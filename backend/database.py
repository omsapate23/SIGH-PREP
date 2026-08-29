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
        SET n.label = $label, n.type = $type, n.risk = $risk
        RETURN n
        """
        tx.run(query, 
               id=node.get("id"), 
               label=node.get("label", ""), 
               type=node.get("type", "Unknown"), 
               risk=node.get("risk", 0))
        
    @staticmethod
    def _merge_edge(tx, edge):
        query = """
        MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
        MERGE (a)-[r:RELATION {label: $label}]->(b)
        RETURN r
        """
        tx.run(query, 
               source=edge.get("source"), 
               target=edge.get("target"), 
               label=edge.get("label", "RELATED_TO"))
        
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
                    "id": node["id"],
                    "label": node.get("label", node["id"]),
                    "type": node.get("type", "Unknown"),
                    "risk": node.get("risk", 0)
                }
            })
            
        edges_result = tx.run("MATCH (a:Entity)-[r:RELATION]->(b:Entity) RETURN a.id AS source, b.id AS target, r.label AS label")
        edges = []
        for record in edges_result:
            edges.append({
                "data": {
                    "id": f"{record['source']}-{record['target']}-{record['label']}",
                    "source": record["source"],
                    "target": record["target"],
                    "label": record["label"]
                }
            })
            
        return {"nodes": nodes, "edges": edges}

db = Neo4jConnection("bolt://localhost:7687", "neo4j", "password")
