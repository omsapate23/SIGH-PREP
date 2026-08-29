import ollama
import json

def extract_entities_from_text(text: str) -> dict:
    prompt = f"""
You are an expert criminal network analyst. Your task is to extract entities and their relationships from the given text and output them in a strict JSON format.

The entities must be of type "Person", "Phone", or "Vehicle".
Relationships should be described with clear, uppercase labels (e.g., "CALLS", "OWNS", "KNOWS").

Output ONLY a JSON object with this exact schema:
{{
  "nodes": [
    {{"id": "unique_id_1", "label": "display name", "type": "Person|Phone|Vehicle"}}
  ],
  "edges": [
    {{"source": "unique_id_1", "target": "unique_id_2", "label": "RELATIONSHIP"}}
  ]
}}

Text to analyze:
{text}
"""
    
    response = ollama.chat(model='llama3', messages=[
        {'role': 'system', 'content': 'You are a precise data extraction system. You only output valid JSON matching the exact schema requested, with no other text, explanation, or markdown.'},
        {'role': 'user', 'content': prompt}
    ])
    
    output = response['message']['content'].strip()
    
    # Clean up markdown code blocks if present
    if output.startswith("```json"):
        output = output[7:]
    if output.startswith("```"):
        output = output[3:]
    if output.endswith("```"):
        output = output[:-3]
        
    try:
        return json.loads(output.strip())
    except json.JSONDecodeError:
        print("Failed to parse JSON from LLM output:", output)
        return {"nodes": [], "edges": []}
