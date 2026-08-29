from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
from database import db
from extractor import extract_entities_from_text
import io

app = FastAPI(title="S.N.A.R.E. API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/ingest")
async def ingest_file(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text = ""
        
        if file.filename.lower().endswith('.pdf'):
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                text += page.get_text()
        else:
            # Assume TXT/CSV or other raw text
            text = content.decode('utf-8')
            
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from file")
            
        graph_data = extract_entities_from_text(text)
        
        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])
        
        db.ingest_graph_data(nodes, edges)
        
        return {"status": "success", "message": "Data ingested successfully", "data": graph_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/graph")
async def get_graph():
    try:
        data = db.get_all_graph_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
