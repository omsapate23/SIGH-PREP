from neo4j import GraphDatabase
import logging
from models import SessionLocal, CaseRecord
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- SQLite Case Helper Functions ---

def create_case(title: str, raw_text: str = "", case_id: str = None, status: str = "Active") -> dict:
    db_session = SessionLocal()
    try:
        new_case = CaseRecord(
            id=case_id or str(uuid.uuid4()),
            title=title,
            status=status,
            raw_text=raw_text
        )
        db_session.add(new_case)
        db_session.commit()
        db_session.refresh(new_case)
        return new_case.to_dict()
    finally:
        db_session.close()

def get_all_cases() -> list:
    db_session = SessionLocal()
    try:
        cases = db_session.query(CaseRecord).order_by(CaseRecord.created_at.desc()).all()
        return [c.to_dict() for c in cases]
    finally:
        db_session.close()

def get_case_by_id(case_id: str) -> dict | None:
    db_session = SessionLocal()
    try:
        case = db_session.query(CaseRecord).filter(CaseRecord.id == case_id).first()
        return case.to_dict() if case else None
    finally:
        db_session.close()

def delete_case_by_id(case_id: str) -> bool:
    db_session = SessionLocal()
    try:
        case = db_session.query(CaseRecord).filter(CaseRecord.id == case_id).first()
        if case:
            db_session.delete(case)
            db_session.commit()
            return True
        return False
    finally:
        db_session.close()

def clear_sqlite_cases():
    db_session = SessionLocal()
    try:
        db_session.query(CaseRecord).delete()
        db_session.commit()
    finally:
        db_session.close()


# --- Threat Scoring Metric ---

def calculate_threat_score(node_type: str, degree_count: int) -> int:
    type_multipliers = {
        "Person": 1.5,
        "Account": 1.3,
        "Phone": 1.1,
        "Vehicle": 0.8,
        "Location": 0.5,
        "Organization": 1.2,
        "Digital_Artifact": 1.0,
        "Crime_Event": 1.4,
        "Tool": 1.0,
        "Infrastructure": 0.9
    }
    
    base_score = 10
    edge_weight = degree_count * 8  # 8 points per direct connection
    
    multiplier = type_multipliers.get(node_type, 1.0)
    raw_score = (base_score + edge_weight) * multiplier
    
    return min(int(raw_score), 100)


# --- Neo4j Graph Connection & Operations ---

class Neo4jConnection:
    def __init__(self, uri, user, pwd):
        self.__uri = uri
        self.__user = user
        self.__pwd = pwd
        self.__driver = None
        try:
            self.__driver = GraphDatabase.driver(self.__uri, auth=(self.__user, self.__pwd))
        except Exception as e:
            logger.error(f"Failed to create the driver: {e}")
        
    def close(self):
        if self.__driver is not None:
            self.__driver.close()
        
    def clear_graph_database(self):
        with self.__driver.session() as session:
            session.execute_write(lambda tx: tx.run("MATCH (n) DETACH DELETE n"))

    def delete_case_from_graph(self, case_id: str):
        with self.__driver.session() as session:
            session.execute_write(lambda tx: tx.run("MATCH (c:Case {id: $case_id}) DETACH DELETE c", case_id=case_id))

    def ingest_graph_data(self, nodes: list, edges: list, case_id: str = None):
        with self.__driver.session() as session:
            for node in nodes:
                session.execute_write(self._merge_node, node, case_id)
            for edge in edges:
                session.execute_write(self._merge_edge, edge)
                
    @staticmethod
    def _merge_node(tx, node, case_id: str = None):
        query = """
        MERGE (n:Entity {id: $id})
        SET n.label = $label,
            n.type = $type,
            n.role = $role,
            n.aliases = $aliases,
            n.last_seen = $last_seen,
            n.details = $details,
            n.evidence = $evidence
        """
        if case_id:
            query += """
            WITH n
            MERGE (c:Case {id: $case_id})
            MERGE (n)-[:CITED_IN]->(c)
            """
        query += " RETURN n"
        
        tx.run(query, 
               id=str(node.get("id")), 
               label=str(node.get("label", node.get("id"))), 
               type=str(node.get("type", "Unknown")), 
               role=str(node.get("role", "Suspect" if node.get("type") == "Person" else "Infrastructure")),
               aliases=str(node.get("aliases", "")),
               last_seen=str(node.get("last_seen", "")),
               details=str(node.get("details", "")),
               evidence=str(node.get("evidence", "")),
               case_id=str(case_id) if case_id else None)
        
    @staticmethod
    def _merge_edge(tx, edge):
        query = """
        MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
        MERGE (a)-[r:RELATION {label: $label}]->(b)
        SET r.details = $details,
            r.evidence = $evidence
        RETURN r
        """
        tx.run(query, 
               source=str(edge.get("source")), 
               target=str(edge.get("target")), 
               label=str(edge.get("label", "RELATED_TO")),
               details=str(edge.get("details", "")),
               evidence=str(edge.get("evidence", "")))
        
    def get_all_graph_data(self, case_id: str = None):
        with self.__driver.session() as session:
            return session.execute_read(self._fetch_graph, case_id)

    @staticmethod
    def _fetch_graph(tx, case_id: str = None):
        if case_id:
            nodes_query = """
            MATCH (n:Entity)-[:CITED_IN]->(c:Case {id: $case_id})
            OPTIONAL MATCH (n)-[r]-()
            RETURN n, count(r) as degree
            """
            nodes_result = tx.run(nodes_query, case_id=case_id)
        else:
            nodes_query = """
            MATCH (n:Entity)
            OPTIONAL MATCH (n)-[r]-()
            RETURN n, count(r) as degree
            """
            nodes_result = tx.run(nodes_query)

        nodes = []
        for record in nodes_result:
            node = record["n"]
            degree = int(record["degree"] or 0)
            node_type = node.get("type", "Unknown")
            node_role = node.get("role", "Unknown")
            threat_score = calculate_threat_score(node_type, degree)
            nodes.append({
                "data": {
                    "id": node.get("id"),
                    "label": node.get("label", node.get("id")),
                    "type": node_type,
                    "role": node_role,
                    "threat_score": threat_score,
                    "risk": threat_score,
                    "degree": degree,
                    "aliases": node.get("aliases", ""),
                    "last_seen": node.get("last_seen", ""),
                    "details": node.get("details", ""),
                    "evidence": node.get("evidence", "")
                }
            })
            
        if case_id:
            edges_query = """
            MATCH (a:Entity)-[:CITED_IN]->(c:Case {id: $case_id})
            MATCH (b:Entity)-[:CITED_IN]->(c:Case {id: $case_id})
            MATCH (a)-[r:RELATION]->(b)
            RETURN a.id AS source, b.id AS target,
                   a.label AS source_label, a.type AS source_type, a.role AS source_role,
                   b.label AS target_label, b.type AS target_type, b.role AS target_role,
                   r.label AS label, r.details AS details, r.evidence AS evidence
            """
            edges_result = tx.run(edges_query, case_id=case_id)
        else:
            edges_query = """
            MATCH (a:Entity)-[r:RELATION]->(b:Entity)
            RETURN a.id AS source, b.id AS target,
                   a.label AS source_label, a.type AS source_type, a.role AS source_role,
                   b.label AS target_label, b.type AS target_type, b.role AS target_role,
                   r.label AS label, r.details AS details, r.evidence AS evidence
            """
            edges_result = tx.run(edges_query)

        edges = []
        for record in edges_result:
            edges.append({
                "data": {
                    "id": f"{record['source']}-{record['target']}-{record['label']}",
                    "source": record["source"],
                    "target": record["target"],
                    "source_label": record.get("source_label") or record["source"],
                    "source_type": record.get("source_type") or "Unknown",
                    "source_role": record.get("source_role") or "Unknown",
                    "target_label": record.get("target_label") or record["target"],
                    "target_type": record.get("target_type") or "Unknown",
                    "target_role": record.get("target_role") or "Unknown",
                    "label": record["label"],
                    "details": record.get("details", ""),
                    "evidence": record.get("evidence", "")
                }
            })
            
        return {"nodes": nodes, "edges": edges}

db = Neo4jConnection("bolt://localhost:7687", "neo4j", "password")
