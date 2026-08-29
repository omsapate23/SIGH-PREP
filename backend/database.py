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
        
    def ingest_graph(self, data):
        """
        Idempotently inserts nodes and edges using MERGE.
        data schema: {"nodes": [...], "edges": [...]}
        """
        with self.__driver.session() as session:
            # Ingest Nodes
            for node in data.get("nodes", []):
                session.execute_write(self._merge_node, node)
            
            # Ingest Edges
            for edge in data.get("edges", []):
                session.execute_write(self._merge_edge, edge)
                
    @staticmethod
    def _merge_node(tx, node):
        node_id = node.get("id")
        label = node.get("label", "")
        node_type = node.get("type", "Unknown")
        
        query = f"""
        MERGE (n:`{node_type}` {{id: $node_id}})
        SET n.label = $label
        RETURN n
        """
        tx.run(query, node_id=node_id, label=label)
        
    @staticmethod
    def _merge_edge(tx, edge):
        source = edge.get("source")
        target = edge.get("target")
        label = edge.get("label", "RELATED_TO")
        
        query = f"""
        MATCH (a {{id: $source}})
        MATCH (b {{id: $target}})
        MERGE (a)-[r:`{label}`]->(b)
        RETURN r
        """
        tx.run(query, source=source, target=target)
        
    def get_cytoscape_graph(self):
        with self.__driver.session() as session:
            return session.execute_read(self._fetch_graph)

    @staticmethod
    def _fetch_graph(tx):
        # Fetch all nodes
        nodes_result = tx.run("MATCH (n) RETURN n")
        nodes = []
        for record in nodes_result:
            node = record["n"]
            # Extract labels, there's usually one main type
            node_type = list(node.labels)[0] if node.labels else "Unknown"
            nodes.append({
                "data": {
                    "id": node["id"],
                    "label": node.get("label", node["id"]),
                    "type": node_type
                }
            })
            
        # Fetch all edges
        edges_result = tx.run("MATCH (a)-[r]->(b) RETURN a.id AS source, b.id AS target, type(r) AS type")
        edges = []
        for record in edges_result:
            edges.append({
                "data": {
                    "id": f"{record['source']}-{record['target']}-{record['type']}",
                    "source": record["source"],
                    "target": record["target"],
                    "label": record["type"]
                }
            })
            
        return nodes + edges

# Initialize the connection with local credentials
db = Neo4jConnection("bolt://localhost:7687", "neo4j", "password")
