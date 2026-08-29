from neo4j import GraphDatabase
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

    def ingest_graph_data(self, nodes: list, edges: list):
        with self.__driver.session() as session:
            for node in nodes:
                session.execute_write(self._merge_node, node)
            for edge in edges:
                session.execute_write(self._merge_edge, edge)
                
    @staticmethod
    def _merge_node(tx, node):
        query = """
        MERGE (n:Entity {id: $id})
        SET n.label = $label,
            n.type = $type,
            n.risk = $risk,
            n.aliases = $aliases,
            n.last_seen = $last_seen,
            n.details = $details,
            n.evidence = $evidence
        RETURN n
        """
        tx.run(query, 
               id=str(node.get("id")), 
               label=str(node.get("label", node.get("id"))), 
               type=str(node.get("type", "Unknown")), 
               risk=int(node.get("risk", 0)),
               aliases=str(node.get("aliases", "")),
               last_seen=str(node.get("last_seen", "")),
               details=str(node.get("details", "")),
               evidence=str(node.get("evidence", "")))
        
    @staticmethod
    def _merge_edge(tx, edge):
        query = """
        MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
        MERGE (a)-[r:RELATION {label: $label}]->(b)
        SET r.details = $details
        RETURN r
        """
        tx.run(query, 
               source=str(edge.get("source")), 
               target=str(edge.get("target")), 
               label=str(edge.get("label", "RELATED_TO")),
               details=str(edge.get("details", "")))
        
    def get_all_graph_data(self):
        with self.__driver.session() as session:
            return session.execute_read(self._fetch_graph)

    @staticmethod
    def _fetch_graph(tx):
        nodes_result = tx.run("MATCH (n:Entity) RETURN n")
        nodes = []
        for record in nodes_result:
            node = record["n"]
            nodes.append({
                "data": {
                    "id": node.get("id"),
                    "label": node.get("label", node.get("id")),
                    "type": node.get("type", "Unknown"),
                    "risk": node.get("risk", 0),
                    "aliases": node.get("aliases", ""),
                    "last_seen": node.get("last_seen", ""),
                    "details": node.get("details", ""),
                    "evidence": node.get("evidence", "")
                }
            })
            
        edges_result = tx.run("MATCH (a:Entity)-[r:RELATION]->(b:Entity) RETURN a.id AS source, b.id AS target, r.label AS label, r.details AS details")
        edges = []
        for record in edges_result:
            edges.append({
                "data": {
                    "id": f"{record['source']}-{record['target']}-{record['label']}",
                    "source": record["source"],
                    "target": record["target"],
                    "label": record["label"],
                    "details": record.get("details", "")
                }
            })
            
        return {"nodes": nodes, "edges": edges}

db = Neo4jConnection("bolt://localhost:7687", "neo4j", "password")
