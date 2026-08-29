import ollama
import json

def extract_entities_from_text(text: str) -> dict:
    prompt = f"""
You are a criminal intelligence parser. Extract all persons, phone numbers, vehicles, bank accounts, and locations.
Output STRICT JSON:
{{
  "nodes": [
    {{"id": "unique_id", "label": "Display Name", "type": "Person|Phone|Vehicle|Account|Location", "risk": 0}}
  ],
  "edges": [
    {{"source": "id1", "target": "id2", "label": "RELATIONSHIP_NAME"}}
  ]
}}
Note: risk should be a number between 0 and 100.

Text to analyze:
{text}
"""
    
    response = ollama.chat(
        model='llama3:8b-instruct-q4_K_M',
        format='json',
        messages=[
            {'role': 'system', 'content': 'You are a precise data extraction system. You only output valid JSON matching the exact schema requested, with no other text, explanation, or markdown.'},
            {'role': 'user', 'content': prompt}
        ]
    )
    
    output = response['message']['content'].strip()
    
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        print("Failed to parse JSON from LLM output:", output)
        return {"nodes": [], "edges": []}
