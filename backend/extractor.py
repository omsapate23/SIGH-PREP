import ollama
import json

def process_extracted_json(data: dict) -> dict:
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])
    
    # Identify all nodes that have edges
    connected_node_ids = set()
    for edge in edges:
        if edge.get("source"):
            connected_node_ids.add(str(edge.get("source")))
        if edge.get("target"):
            connected_node_ids.add(str(edge.get("target")))
        
    # Find a central node to anchor orphans to (e.g., the first Person or Crime Event)
    anchor_node_id = None
    for node in nodes:
        if node.get("role") in ["Victim", "Suspect", "Crime_Event"]:
            anchor_node_id = node.get("id")
            break
    
    if not anchor_node_id and nodes:
        anchor_node_id = nodes[0].get("id")
        
    # Bind orphans
    if anchor_node_id:
        for node in nodes:
            node_id = node.get("id")
            if node_id and node_id not in connected_node_ids and node_id != anchor_node_id:
                # Create a generic edge to prevent the node from floating in the void
                edges.append({
                    "source": anchor_node_id,
                    "target": node_id,
                    "label": "ASSOCIATED_WITH",
                    "details": "System generated edge for orphaned entity constraint.",
                    "evidence": "Implicit contextual link from investigative report."
                })
                connected_node_ids.add(node_id)
                
    return {"nodes": nodes, "edges": edges}

def extract_entities_from_text(text: str) -> dict:
    prompt = f"""
You are an elite Law Enforcement Intelligence Knowledge Graph Extractor.
Extract an exhaustive, interconnected criminal intelligence network from police reports, FIRs, and surveillance dossiers.

Rules:
- Extract ALL entities: Complainants (Victims), Accused (Suspects/Impersonators), Witnesses, Investigating Officers, Phone Numbers, Bank Accounts, Shell Companies, Financial Transactions (with amounts), Digital Artifacts/Apps (e.g. QuickSupport, APKs), and Locations.
- ZERO ORPHAN NODES: Every node MUST connect to at least one other node. (e.g., link Bank branch to Bank Manager or Impersonated Suspect; link Location to Incident/Victim).
- Assign a specific 'role' property: 'Suspect' | 'Victim' | 'Witness' | 'Officer' | 'Mule_Account' | 'Infrastructure' | 'Tool'.
- Edge labels must be actionable: 'CALLED', 'IMPERSONATED_EMPLOYEE_OF', 'COERCED_INSTALL_OF', 'TRANSFERRED_₹95K', 'DENIED_BY_WITNESS', 'INVESTIGATED_BY', 'LOCATED_AT'.

Output STRICT JSON matching this schema:
{{
  "nodes": [
    {{
      "id": "normalized_snake_case_id",
      "label": "Clean Display Name",
      "type": "Person | Phone | Account | Organization | Digital_Artifact | Location | Crime_Event",
      "role": "Victim | Suspect | Witness | Officer | Mule_Account | Infrastructure | Tool",
      "details": "1-sentence summary of involvement",
      "evidence": "Exact verbatim quote from the text source"
    }}
  ],
  "edges": [
    {{
      "source": "source_node_id",
      "target": "target_node_id",
      "label": "ACTION_LABEL",
      "details": "Explanation of link with timestamps/amounts where applicable",
      "evidence": "Verbatim quote supporting this relationship"
    }}
  ]
}}

Source Text:
{text}
"""
    
    response = ollama.chat(
        model='qwen2.5:7b-instruct-q4_K_M',
        format='json',
        options={
            "temperature": 0.0,
            "seed": 42,
            "num_ctx": 8192
        },
        messages=[
            {'role': 'system', 'content': 'You are an elite Law Enforcement Intelligence Knowledge Graph Extractor. Output STRICT JSON with \'nodes\' and \'edges\' arrays. No markdown, explanation, or commentary.'},
            {'role': 'user', 'content': prompt}
        ]
    )
    
    output = response['message']['content'].strip()
    
    try:
        data = json.loads(output)
        return process_extracted_json(data)
    except json.JSONDecodeError:
        print("Failed to parse JSON from LLM output:", output)
        return {"nodes": [], "edges": []}
