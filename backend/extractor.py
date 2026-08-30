import ollama
import json

def extract_entities_from_text(text: str) -> dict:
    prompt = f"""
You are a deterministic data extractor. ONLY extract explicitly named entities. Output STRICT JSON with 'nodes' and 'edges' arrays.
DO NOT invent, infer, or hallucinate relationships. If a relationship is not directly stated, omit it.

Extract all relevant entities (persons, phone numbers, vehicles, bank accounts, locations, organizations) and their relationships from the report.

For each entity, extract:
- id: unique slug or standardized identifier (e.g., 'rajesh_malhotra', 'phone_9876543210')
- label: clean display name (e.g., 'Rajesh Malhotra', '+91 98765 43210')
- type: one of 'Person', 'Phone', 'Vehicle', 'Account', 'Location', 'Organization'
- aliases: any known aliases or nicknames
- last_seen: any timestamp, date, or address mentioned in connection with this entity
- details: brief summary of role or involvement
- evidence: EXACT quote or sentence from the source text justifying this entity's extraction and network connection

For each relationship/edge, extract:
- source: source entity id
- target: target entity id
- label: relationship description in UPPERCASE (e.g., 'CALLED', 'OWNS', 'MET_WITH', 'TRANSFERRED_FUNDS', 'ASSOCIATE_OF')
- details: brief context

Output STRICT JSON matching this schema:
{{
  "nodes": [
    {{
      "id": "unique_id",
      "label": "Display Name",
      "type": "Person",
      "aliases": "Known Nickname",
      "last_seen": "Sector 18, Noida on 2026-05-12",
      "details": "Prime coordinator in hawala transactions",
      "evidence": "Rajesh Malhotra was intercepted transferring 50 lakhs..."
    }}
  ],
  "edges": [
    {{
      "source": "unique_id_1",
      "target": "unique_id_2",
      "label": "TRANSFERRED_FUNDS",
      "details": "Rs 50,000 sent via UPI"
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
            "num_ctx": 4096
        },
        messages=[
            {'role': 'system', 'content': 'You are a deterministic data extractor. ONLY extract explicitly named entities. Output STRICT JSON with \'nodes\' and \'edges\' arrays. No markdown, explanation, or commentary.'},
            {'role': 'user', 'content': prompt}
        ]
    )
    
    output = response['message']['content'].strip()
    
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        print("Failed to parse JSON from LLM output:", output)
        return {"nodes": [], "edges": []}
