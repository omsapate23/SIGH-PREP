from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pymupdf as fitz
from database import db
from extractor import extract_entities_from_text
import io
import os
import tempfile
import pandas as pd

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
        filename_lower = file.filename.lower()

        # Always auto-purge before ingesting a new file
        db.clear_graph_database()

        # 1. Handle CSV (Call Detail Record - CDR) directly via pandas without Ollama
        if filename_lower.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
            
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
                        "risk": 45,
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
                        "risk": 45,
                        "aliases": "CDR Recipient",
                        "last_seen": timestamp if timestamp != "N/A" else "CDR Log Entry",
                        "details": "Logged in Call Detail Records receiving communications.",
                        "evidence": f"Call received by {receiver} from {caller} (Duration: {duration}s, Time: {timestamp})"
                    }

                edges.append({
                    "source": caller,
                    "target": receiver,
                    "label": "CALLED",
                    "details": f"Call Duration: {duration}s, Timestamp: {timestamp}"
                })

            nodes = list(nodes_dict.values())
            db.ingest_graph_data(nodes, edges)
            return db.get_all_graph_data()

        # 2. Handle Audio Files (.wav / .mp3) using Faster-Whisper
        elif filename_lower.endswith('.wav') or filename_lower.endswith('.mp3'):
            from faster_whisper import WhisperModel
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename_lower)[1]) as tmp:
                tmp.write(content)
                tmp_path = tmp.name

            try:
                # Try CUDA float16 first, fallback to CPU int8
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

            graph_data = extract_entities_from_text(transcribed_text)
            nodes = graph_data.get("nodes", [])
            edges = graph_data.get("edges", [])
            db.ingest_graph_data(nodes, edges)
            return db.get_all_graph_data()

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

            graph_data = extract_entities_from_text(text)
            nodes = graph_data.get("nodes", [])
            edges = graph_data.get("edges", [])
            db.ingest_graph_data(nodes, edges)
            return db.get_all_graph_data()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/graph")
async def get_graph():
    try:
        data = db.get_all_graph_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/graph")
async def delete_graph():
    try:
        db.clear_graph_database()
        return {"status": "purged", "message": "Graph successfully cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
