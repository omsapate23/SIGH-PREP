from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pymupdf as fitz
from database import (
    db,
    create_case,
    get_all_cases,
    get_case_by_id,
    delete_case_by_id,
    clear_sqlite_cases
)
from extractor import extract_entities_from_text
import io
import os
import tempfile
import pandas as pd
from typing import Optional

app = FastAPI(title="S.N.A.R.E. API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def _process_payload(file: UploadFile, title: Optional[str] = None):
    content = await file.read()
    filename_lower = file.filename.lower()
    default_title = title.strip() if title and title.strip() else os.path.splitext(file.filename)[0].replace('_', ' ')

    # 1. Handle CSV (Call Detail Record - CDR) directly via pandas without Ollama
    if filename_lower.endswith('.csv'):
        df = pd.read_csv(io.BytesIO(content))
        raw_text = df.to_string(max_rows=100)
        
        # Normalize column names for flexible matching
        cols = {col.lower().strip().replace(' ', '_'): col for col in df.columns}
        
        def get_col(possible_names, fallback_idx=0):
            for name in possible_names:
                if name in cols:
                    return cols[name]
            if len(df.columns) > fallback_idx:
                return df.columns[fallback_idx]
            return None

        caller_col = get_col(['caller', 'calling_num', 'calling_number', 'source', 'from', 'caller_id', 'origin'])
        receiver_col = get_col(['receiver', 'called_num', 'called_number', 'target', 'to', 'recipient_id', 'destination'], fallback_idx=1)
        duration_col = get_col(['duration', 'duration_sec', 'duration_seconds', 'call_duration', 'secs'])
        timestamp_col = get_col(['timestamp', 'date', 'time', 'call_date', 'datetime'])

        if not caller_col or not receiver_col:
            raise HTTPException(status_code=400, detail="CSV must contain at least caller and receiver columns.")

        nodes_dict = {}
        edges = []

        for _, row in df.iterrows():
            caller = str(row[caller_col]).strip()
            receiver = str(row[receiver_col]).strip()
            
            if not caller or not receiver or caller == 'nan' or receiver == 'nan':
                continue

            duration = str(row[duration_col]) if duration_col and pd.notna(row[duration_col]) else "N/A"
            timestamp = str(row[timestamp_col]) if timestamp_col and pd.notna(row[timestamp_col]) else "N/A"

            if caller not in nodes_dict:
                nodes_dict[caller] = {
                    "id": caller,
                    "label": caller,
                    "type": "Phone",
                    "role": "Suspect",
                    "aliases": "CDR Originator",
                    "last_seen": timestamp if timestamp != "N/A" else "CDR Log Entry",
                    "details": "Logged in Call Detail Records initiating communications.",
                    "evidence": f"Call initiated from {caller} to {receiver} (Duration: {duration}s, Time: {timestamp})"
                }

            if receiver not in nodes_dict:
                nodes_dict[receiver] = {
                    "id": receiver,
                    "label": receiver,
                    "type": "Phone",
                    "role": "Suspect",
                    "aliases": "CDR Recipient",
                    "last_seen": timestamp if timestamp != "N/A" else "CDR Log Entry",
                    "details": "Logged in Call Detail Records receiving communications.",
                    "evidence": f"Call received by {receiver} from {caller} (Duration: {duration}s, Time: {timestamp})"
                }

            edges.append({
                "source": caller,
                "target": receiver,
                "label": "CALLED",
                "details": f"Call Duration: {duration}s, Timestamp: {timestamp}",
                "evidence": f"Call record: {caller} dialed {receiver} at {timestamp} for {duration} seconds."
            })

        nodes = list(nodes_dict.values())
        case_record = create_case(title=default_title, raw_text=raw_text)
        db.ingest_graph_data(nodes, edges, case_id=case_record["id"])
        graph_data = db.get_all_graph_data(case_id=case_record["id"])
        return {"case": case_record, "graph": graph_data, "data": graph_data}

    # 2. Handle Audio Files (.wav / .mp3) using Faster-Whisper
    elif filename_lower.endswith('.wav') or filename_lower.endswith('.mp3'):
        from faster_whisper import WhisperModel
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename_lower)[1]) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            try:
                model = WhisperModel("base.en", device="cuda", compute_type="float16")
            except Exception:
                model = WhisperModel("base.en", device="cpu", compute_type="int8")

            segments, _ = model.transcribe(tmp_path, beam_size=5)
            transcribed_text = " ".join([segment.text for segment in segments]).strip()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        if not transcribed_text:
            raise HTTPException(status_code=400, detail="No speech could be transcribed from audio file.")

        graph_extracted = extract_entities_from_text(transcribed_text)
        nodes = graph_extracted.get("nodes", [])
        edges = graph_extracted.get("edges", [])

        case_record = create_case(title=default_title, raw_text=transcribed_text)
        db.ingest_graph_data(nodes, edges, case_id=case_record["id"])
        graph_data = db.get_all_graph_data(case_id=case_record["id"])
        return {"case": case_record, "graph": graph_data, "data": graph_data}

    # 3. Handle PDF and TXT
    else:
        text = ""
        if filename_lower.endswith('.pdf'):
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                text += page.get_text()
        else:
            text = content.decode('utf-8', errors='ignore')

        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from document.")

        graph_extracted = extract_entities_from_text(text)
        nodes = graph_extracted.get("nodes", [])
        edges = graph_extracted.get("edges", [])

        case_record = create_case(title=default_title, raw_text=text)
        db.ingest_graph_data(nodes, edges, case_id=case_record["id"])
        graph_data = db.get_all_graph_data(case_id=case_record["id"])
        return {"case": case_record, "graph": graph_data, "data": graph_data}


@app.post("/api/cases")
async def create_case_endpoint(file: UploadFile = File(...), title: Optional[str] = Form(None)):
    try:
        return await _process_payload(file, title)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cases")
async def list_cases():
    try:
        return get_all_cases()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cases/{case_id}")
async def get_case_detail(case_id: str):
    try:
        case = get_case_by_id(case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        return case
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cases/{case_id}/graph")
async def get_case_graph(case_id: str):
    try:
        return db.get_all_graph_data(case_id=case_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/cases/{case_id}")
async def delete_case(case_id: str):
    try:
        deleted = delete_case_by_id(case_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Case not found")
        db.delete_case_from_graph(case_id)
        return {"status": "deleted", "case_id": case_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/graph/global")
async def get_global_graph():
    try:
        return db.get_all_graph_data(case_id=None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/graph")
async def get_graph():
    try:
        return db.get_all_graph_data(case_id=None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ingest")
async def ingest_file(file: UploadFile = File(...), title: Optional[str] = Form(None)):
    try:
        result = await _process_payload(file, title)
        return result.get("graph", result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/graph")
async def delete_graph():
    try:
        db.clear_graph_database()
        clear_sqlite_cases()
        return {"status": "purged", "message": "Graph and Case database successfully cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
