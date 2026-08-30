import ollama
import json
import re

def normalize_phone_number(raw_str: str) -> str:
    """Extracts last 10 digits of a phone number."""
    digits = re.sub(r'\D', '', str(raw_str))
    if len(digits) >= 10:
        return digits[-10:]
    return digits

def normalize_entity(node: dict) -> dict:
    """
    Deterministically canonicalizes entity IDs, types, and labels so that
    references across different documents (FIRs, CDR CSVs, Audio Transcripts)
    resolve to the EXACT same node.
    """
    raw_id = str(node.get("id", "")).strip()
    raw_label = str(node.get("label", raw_id)).strip()
    raw_type = str(node.get("type", "Unknown")).strip()
    role = str(node.get("role", "Suspect" if raw_type == "Person" else "Infrastructure")).strip()
    combined_str = f"{raw_label} {raw_id}".lower()

    # 1. BANK ACCOUNT / FINANCIAL ARTIFACT NORMALIZATION (MUST CHECK BEFORE PHONE!)
    is_account = (
        raw_type.lower() in ["account", "bank_account", "mule_account", "financial", "bank"] or
        bool(re.search(r'(account|ac_no|a/c|bank_acc|icici|sbi|hdfc|axis|pnb|paytm_bank|kotak)', combined_str))
    )
    if is_account:
        clean_acc = re.sub(r'[^a-zA-Z0-9]', '', raw_id.lower().replace('account', '').replace('acc', '').replace('bank', '').replace('icici', '').replace('sbi', '').replace('hdfc', ''))
        if not clean_acc:
            clean_acc = re.sub(r'[^a-zA-Z0-9]', '', raw_label.lower())
        
        canonical_id = f"account_{clean_acc}" if clean_acc else f"account_{raw_id.lower()}"
        node["id"] = canonical_id
        node["label"] = raw_label if raw_label else f"Account {clean_acc}"
        node["type"] = "Account"
        if role not in ["Mule_Account", "Suspect", "Victim"]:
            node["role"] = "Mule_Account"
        return node

    # 2. VEHICLE & LICENSE PLATE NORMALIZATION
    plate_match = re.search(r'([A-Za-z]{2}[-\s]?\d{1,2}[-\s]?[A-Za-z]{1,3}[-\s]?\d{4})', f"{raw_label} {raw_id}")
    if raw_type.lower() in ["vehicle", "car", "bike", "truck"] or plate_match:
        if plate_match:
            clean_plate = re.sub(r'[^A-Za-z0-9]', '', plate_match.group(1)).upper()
            canonical_id = f"vehicle_{clean_plate.lower()}"
            node["id"] = canonical_id
            node["type"] = "Vehicle"
            if not raw_label or raw_label.lower() == raw_id.lower() or raw_label.startswith("vehicle_"):
                node["label"] = f"Vehicle {clean_plate}"
            return node
        else:
            clean_id = re.sub(r'[^a-zA-Z0-9_]', '', raw_id.lower().replace(' ', '_'))
            clean_id = clean_id if clean_id.startswith('vehicle_') else f"vehicle_{clean_id}"
            node["id"] = clean_id
            node["type"] = "Vehicle"
            return node

    # 3. PHONE NUMBER NORMALIZATION
    digits = re.sub(r'\D', '', raw_label if re.search(r'\d{10}', raw_label) else raw_id)
    if raw_type.lower() in ["phone", "phonenumber", "mobile", "contact", "sim"] or (len(digits) >= 10 and len(digits) <= 13):
        phone_10 = digits[-10:] if len(digits) >= 10 else digits
        canonical_id = f"phone_{phone_10}"
        if len(phone_10) == 10:
            formatted_label = f"+91-{phone_10[:5]}-{phone_10[5:]}"
        else:
            formatted_label = raw_label or f"+{digits}"

        node["id"] = canonical_id
        node["label"] = formatted_label
        node["type"] = "Phone"
        node["role"] = role if role in ["Suspect", "Victim", "Witness", "Officer", "Mule_Account", "Tool", "Infrastructure"] else "Tool"
        return node

    # 4. PERSON NORMALIZATION
    if raw_type.lower() in ["person", "suspect", "victim", "witness", "officer", "individual"]:
        # Strip honorifics & prefixes
        clean_name = re.sub(r'^(mr|mrs|ms|shri|smt|dr|inspector|sub_inspector|si|accused|suspect|victim)_+', '', raw_id.lower().replace(' ', '_'))
        clean_name = re.sub(r'[^a-zA-Z0-9_]', '', clean_name).strip('_')
        canonical_id = f"person_{clean_name}" if not clean_name.startswith('person_') else clean_name
        node["id"] = canonical_id
        node["type"] = "Person"
        return node

    # 5. GENERAL NORMALIZATION
    clean_id = re.sub(r'[^a-zA-Z0-9_]', '_', raw_id.lower()).strip('_')
    node["id"] = clean_id or f"entity_{abs(hash(raw_label))}"
    return node


def process_extracted_json(data: dict) -> dict:
    raw_nodes = data.get("nodes", [])
    raw_edges = data.get("edges", [])

    id_mapping = {}
    nodes_by_id = {}

    # Step 1: Canonicalize each node and build ID alias mapping
    for node in raw_nodes:
        original_id = str(node.get("id", ""))
        original_label = str(node.get("label", original_id))
        
        normalized_node = normalize_entity(dict(node))
        canonical_id = normalized_node["id"]
        
        id_mapping[original_id] = canonical_id
        id_mapping[original_label] = canonical_id
        id_mapping[canonical_id] = canonical_id

        # Merge duplicates if multiple raw entities map to same canonical node
        if canonical_id in nodes_by_id:
            existing = nodes_by_id[canonical_id]
            if not existing.get("details") and normalized_node.get("details"):
                existing["details"] = normalized_node["details"]
            if not existing.get("evidence") and normalized_node.get("evidence"):
                existing["evidence"] = normalized_node["evidence"]
            if normalized_node.get("role") in ["Suspect", "Victim", "Mule_Account"]:
                existing["role"] = normalized_node["role"]
        else:
            nodes_by_id[canonical_id] = normalized_node

    nodes = list(nodes_by_id.values())

    # Step 2: Remap edges using canonical ID mapping
    edge_set = set()
    edges = []

    for edge in raw_edges:
        src = str(edge.get("source", ""))
        tgt = str(edge.get("target", ""))
        label = str(edge.get("label", "RELATED_TO")).upper().replace(' ', '_')

        canonical_src = id_mapping.get(src, id_mapping.get(re.sub(r'\D', '', src), src))
        canonical_tgt = id_mapping.get(tgt, id_mapping.get(re.sub(r'\D', '', tgt), tgt))

        # Check if source or target were raw phone numbers in edge
        digits_src = re.sub(r'\D', '', src)
        if len(digits_src) >= 10 and f"phone_{digits_src[-10:]}" in nodes_by_id:
            canonical_src = f"phone_{digits_src[-10:]}"

        digits_tgt = re.sub(r'\D', '', tgt)
        if len(digits_tgt) >= 10 and f"phone_{digits_tgt[-10:]}" in nodes_by_id:
            canonical_tgt = f"phone_{digits_tgt[-10:]}"

        if not canonical_src or not canonical_tgt or canonical_src == canonical_tgt:
            continue

        edge_key = (canonical_src, canonical_tgt, label)
        if edge_key not in edge_set:
            edge_set.add(edge_key)
            edges.append({
                "source": canonical_src,
                "target": canonical_tgt,
                "label": label,
                "details": edge.get("details", ""),
                "evidence": edge.get("evidence", "")
            })

    # Step 3: Zero Orphan Nodes - Link unconnected entities to primary anchor
    connected_node_ids = set()
    for edge in edges:
        connected_node_ids.add(edge["source"])
        connected_node_ids.add(edge["target"])

    anchor_node_id = None
    for node in nodes:
        if node.get("role") in ["Victim", "Suspect", "Crime_Event"]:
            anchor_node_id = node.get("id")
            break

    if not anchor_node_id and nodes:
        anchor_node_id = nodes[0].get("id")

    if anchor_node_id:
        for node in nodes:
            node_id = node.get("id")
            if node_id and node_id not in connected_node_ids and node_id != anchor_node_id:
                edges.append({
                    "source": anchor_node_id,
                    "target": node_id,
                    "label": "ASSOCIATED_WITH",
                    "details": "Contextual link identified in investigative dossier.",
                    "evidence": node.get("evidence") or "Co-mentioned in primary case narrative."
                })
                connected_node_ids.add(node_id)

    return {"nodes": nodes, "edges": edges}


def extract_entities_from_text(text: str) -> dict:
    prompt = f"""
You are an elite Law Enforcement Intelligence Knowledge Graph Extractor.
Extract an exhaustive, interconnected criminal intelligence network from police reports, FIRs, and surveillance dossiers.

Rules:
- Extract ALL entities: Complainants (Victims), Accused (Suspects/Impersonators), Witnesses, Investigating Officers, Phone Numbers, Bank Accounts, Shell Companies, Financial Transactions (with amounts), Digital Artifacts/Apps (e.g. QuickSupport, APKs), and Locations.
- ZERO ORPHAN NODES: Every node MUST connect to at least one other node.
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
