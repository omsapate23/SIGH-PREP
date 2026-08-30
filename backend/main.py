from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pymupdf as fitz
from database import (
    db,
    create_case,
    get_all_cases,
    get_case_by_id,
    delete_case_by_id,
    append_case_raw_text,
    clear_sqlite_cases
)
from extractor import extract_entities_from_text, normalize_entity
import io
import os
import tempfile
import pandas as pd
from typing import Optional, List

app = FastAPI(title="S.N.A.R.E. API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def _extract_from_file(file: UploadFile) -> tuple[str, list, list]:
    """
    Extracts raw text, nodes, and edges from a single file payload (CSV, Audio, PDF, TXT).
    Applies deterministic canonical entity resolution so all cross-file references merge.
    """
    content = await file.read()
    filename_lower = file.filename.lower()

    # 1. Handle CSV (Call Detail Record - CDR) directly via pandas without Ollama
    if filename_lower.endswith('.csv'):
        df = pd.read_csv(io.BytesIO(content))
        raw_text = f"CDR CSV Log ({file.filename}):\n" + df.to_string(max_rows=100)
        
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
            raise HTTPException(status_code=400, detail=f"CSV '{file.filename}' must contain caller and receiver columns.")

        nodes_dict = {}
        edges = []

        for _, row in df.iterrows():
            caller_raw = str(row[caller_col]).strip()
            receiver_raw = str(row[receiver_col]).strip()
            
            if not caller_raw or not receiver_raw or caller_raw.lower() == 'nan' or receiver_raw.lower() == 'nan':
                continue

            duration = str(row[duration_col]) if duration_col and pd.notna(row[duration_col]) else "N/A"
            timestamp = str(row[timestamp_col]) if timestamp_col and pd.notna(row[timestamp_col]) else "N/A"

            caller_node = normalize_entity({
                "id": caller_raw,
                "label": caller_raw,
                "type": "Phone",
                "role": "Suspect",
                "aliases": "CDR Originator",
                "last_seen": timestamp if timestamp != "N/A" else "CDR Log Entry",
                "details": "Logged in Call Detail Records initiating communications.",
                "evidence": f"Call initiated from {caller_raw} to {receiver_raw} (Duration: {duration}s, Time: {timestamp})"
            })

            receiver_node = normalize_entity({
                "id": receiver_raw,
                "label": receiver_raw,
                "type": "Phone",
                "role": "Suspect",
                "aliases": "CDR Recipient",
                "last_seen": timestamp if timestamp != "N/A" else "CDR Log Entry",
                "details": "Logged in Call Detail Records receiving communications.",
                "evidence": f"Call received by {receiver_raw} from {caller_raw} (Duration: {duration}s, Time: {timestamp})"
            })

            caller_id = caller_node["id"]
            receiver_id = receiver_node["id"]

            if caller_id not in nodes_dict:
                nodes_dict[caller_id] = caller_node

            if receiver_id not in nodes_dict:
                nodes_dict[receiver_id] = receiver_node

            edges.append({
                "source": caller_id,
                "target": receiver_id,
                "label": "CALLED",
                "details": f"Call Duration: {duration}s, Timestamp: {timestamp}",
                "evidence": f"Call record in {file.filename}: {caller_raw} dialed {receiver_raw} at {timestamp} for {duration}s."
            })

        return raw_text, list(nodes_dict.values()), edges

    # 2. Handle Audio Files (.wav / .mp3) using Faster-Whisper on CPU int8
    elif filename_lower.endswith('.wav') or filename_lower.endswith('.mp3'):
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise HTTPException(status_code=500, detail="faster-whisper is not installed in the server environment.")

        ext = os.path.splitext(filename_lower)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        transcribed_text = ""
        try:
            # Deterministically use device='cpu' with compute_type='int8' to avoid Windows cublas64_12.dll CUDA runtime errors
            try:
                model = WhisperModel("base", device="cpu", compute_type="int8")
                segments, _ = model.transcribe(tmp_path, beam_size=5)
                transcribed_text = " ".join([segment.text for segment in segments]).strip()
            except Exception as e1:
                print(f"Whisper base CPU transcribe error: {e1}, attempting tiny model fallback...")
                model = WhisperModel("tiny", device="cpu", compute_type="int8")
                segments, _ = model.transcribe(tmp_path, beam_size=5)
                transcribed_text = " ".join([segment.text for segment in segments]).strip()
        finally:
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception as e:
                print(f"Warning: Could not remove temporary audio file: {e}")

        if not transcribed_text:
            raise HTTPException(status_code=400, detail=f"No audible speech could be transcribed from audio file '{file.filename}'.")

        graph_extracted = extract_entities_from_text(transcribed_text)
        nodes = graph_extracted.get("nodes", [])
        edges = graph_extracted.get("edges", [])
        raw_text = f"Audio Intercept Transcript ({file.filename}):\n{transcribed_text}"
        return raw_text, nodes, edges

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
            raise HTTPException(status_code=400, detail=f"Could not extract text from document '{file.filename}'.")

        graph_extracted = extract_entities_from_text(text)
        nodes = graph_extracted.get("nodes", [])
        edges = graph_extracted.get("edges", [])
        raw_text = f"Investigative Document ({file.filename}):\n{text}"
        return raw_text, nodes, edges


@app.post("/api/cases")
async def create_or_append_case_endpoint(
    files: List[UploadFile] = File(...),
    case_id: Optional[str] = Form(None),
    title: Optional[str] = Form(None)
):
    try:
        if not files:
            raise HTTPException(status_code=400, detail="No files provided.")

        # Determine target case (existing vs new)
        if case_id and case_id.strip():
            existing_case = get_case_by_id(case_id.strip())
            if not existing_case:
                raise HTTPException(status_code=404, detail="Specified case not found.")
            target_case = existing_case
        else:
            first_filename = files[0].filename
            default_title = title.strip() if title and title.strip() else os.path.splitext(first_filename)[0].replace('_', ' ')
            target_case = create_case(title=default_title, raw_text="")

        active_case_id = target_case["id"]

        # Track existing case nodes for cross-document intra-case anchoring
        existing_graph = db.get_all_graph_data(case_id=active_case_id)
        existing_node_ids = {n["data"]["id"] for n in existing_graph.get("nodes", [])}
        
        # Primary anchor for the case
        case_anchor_id = None
        for n in existing_graph.get("nodes", []):
            if n["data"].get("role") in ["Victim", "Suspect", "Crime_Event"]:
                case_anchor_id = n["data"]["id"]
                break

        # Process each file in batch
        for file in files:
            raw_text, nodes, edges = await _extract_from_file(file)
            append_case_raw_text(active_case_id, raw_text)

            # Check if this document's nodes share any overlap with existing case nodes
            new_node_ids = {node["id"] for node in nodes}
            has_overlap = bool(existing_node_ids.intersection(new_node_ids))

            # If no direct overlap exists between this file and earlier files in the same case,
            # bind the document's central entity to the case anchor to guarantee a single unified graph
            if not has_overlap and existing_node_ids and nodes:
                doc_anchor = nodes[0]["id"]
                for node in nodes:
                    if node.get("role") in ["Victim", "Suspect", "Crime_Event"]:
                        doc_anchor = node["id"]
                        break
                
                target_anchor = case_anchor_id or next(iter(existing_node_ids))
                if target_anchor != doc_anchor:
                    edges.append({
                        "source": target_anchor,
                        "target": doc_anchor,
                        "label": "CO_INVESTIGATED_IN",
                        "details": f"Evidence linked via multi-source payload ({file.filename}).",
                        "evidence": f"Document co-submitted under Case Dossier: {target_case.get('title', active_case_id)}."
                    })

            # Ingest to Neo4j
            db.ingest_graph_data(nodes, edges, case_id=active_case_id)

            # Update tracked nodes
            existing_node_ids.update(new_node_ids)
            if not case_anchor_id and nodes:
                case_anchor_id = nodes[0]["id"]

        updated_case = get_case_by_id(active_case_id)
        graph_data = db.get_all_graph_data(case_id=active_case_id)
        return {
            "case": updated_case,
            "graph": graph_data,
            "data": graph_data,
            "files_processed": len(files)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/cases/{case_id}/files")
async def append_files_to_case_endpoint(
    case_id: str,
    files: List[UploadFile] = File(...)
):
    try:
        existing_case = get_case_by_id(case_id)
        if not existing_case:
            raise HTTPException(status_code=404, detail="Case not found.")

        return await create_or_append_case_endpoint(files=files, case_id=case_id, title=None)
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
async def ingest_files_legacy(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    title: Optional[str] = Form(None)
):
    try:
        file_list = []
        if files:
            file_list.extend(files)
        if file:
            file_list.append(file)
        if not file_list:
            raise HTTPException(status_code=400, detail="No files uploaded.")
        
        result = await create_or_append_case_endpoint(files=file_list, case_id=None, title=title)
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
