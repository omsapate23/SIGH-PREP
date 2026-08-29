from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
from database import db
from extractor import extract_entities_from_text

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
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
            
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")
            
        graph_data = extract_entities_from_text(text)
        db.ingest_graph(graph_data)
        
        return {"status": "success", "message": "Graph data ingested successfully", "data": graph_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/graph")
async def get_graph():
    try:
        elements = db.get_cytoscape_graph()
        return elements
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
