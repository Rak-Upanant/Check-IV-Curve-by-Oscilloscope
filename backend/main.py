"""
I-V Signature Analysis — FastAPI Backend
Deploy: Render.com / Railway
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os, uuid, tempfile
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

from .database import supabase
from .storage import upload_image, get_public_url
from .iv_engine import process_image, similarity_score
from .pdf_generator import generate_report_pdf

app = FastAPI(
    title="IV Signature Analysis API",
    version="1.0.0",
    description="IGBT Board I-V Curve Signature Analysis System"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── HEALTH ──────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

# ─── BOARDS ──────────────────────────────────────────────────
@app.get("/boards")
def get_boards():
    res = supabase.table("boards").select("*").execute()
    return res.data

@app.get("/boards/{board_id}/points")
def get_test_points(board_id: str):
    res = (supabase.table("test_points")
           .select("*, master_signatures(signature_id, image_path, feature_vector)")
           .eq("board_id", board_id)
           .order("sort_order")
           .execute())
    # Attach public image URL for each master signature
    for point in res.data:
        for sig in point.get("master_signatures", []):
            sig["image_url"] = get_public_url(sig["image_path"])
    return res.data

# ─── MASTER SIGNATURES ───────────────────────────────────────
@app.post("/boards/{board_id}/points/{point_id}/master")
async def upload_master(board_id: str, point_id: str, file: UploadFile = File(...)):
    """Upload and process a master reference I-V curve image."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        result = process_image(tmp_path)
        if not result:
            raise HTTPException(400, "Could not extract curve from image")

        storage_path = f"masters/{board_id}/{point_id}/{uuid.uuid4()}.png"
        upload_image(tmp_path, storage_path)

        row = {
            "point_id":       point_id,
            "image_path":     storage_path,
            "feature_vector": result["features"],
            "v_data":         result["v"],
            "i_data":         result["i"],
        }
        ins = supabase.table("master_signatures").insert(row).execute()
        sig = ins.data[0]
        sig["image_url"] = get_public_url(storage_path)
        return sig
    finally:
        os.unlink(tmp_path)

# ─── TEST SESSIONS ───────────────────────────────────────────
class SessionCreate(BaseModel):
    board_id:   str
    technician: str
    notes:      Optional[str] = None

@app.post("/sessions")
def create_session(body: SessionCreate):
    res = supabase.table("test_sessions").insert({
        "board_id":   body.board_id,
        "technician": body.technician,
        "notes":      body.notes,
        "status":     "in_progress",
    }).execute()
    return res.data[0]

@app.get("/sessions/{session_id}")
def get_session(session_id: str):
    res = (supabase.table("test_sessions")
           .select("*, test_results(*, test_points(point_name, component_type))")
           .eq("session_id", session_id)
           .single()
           .execute())
    return res.data

@app.patch("/sessions/{session_id}/complete")
def complete_session(session_id: str):
    res = (supabase.table("test_sessions")
           .update({"status": "completed"})
           .eq("session_id", session_id)
           .execute())
    return res.data[0]

# ─── ANALYZE IMAGE ───────────────────────────────────────────
@app.post("/sessions/{session_id}/analyze")
async def analyze_image(session_id: str, point_id: str, file: UploadFile = File(...)):
    """
    Upload a technician's oscilloscope image.
    Process, compare with master, return similarity score + diagnosis.
    """
    # Validate session
    sess = supabase.table("test_sessions").select("board_id").eq("session_id", session_id).single().execute()
    if not sess.data:
        raise HTTPException(404, "Session not found")

    # Fetch master signature for this point
    master_res = (supabase.table("master_signatures")
                  .select("*")
                  .eq("point_id", point_id)
                  .order("created_at", desc=True)
                  .limit(1)
                  .execute())
    if not master_res.data:
        raise HTTPException(404, "No master signature for this test point")
    master = master_res.data[0]

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        result = process_image(tmp_path)
        if not result:
            raise HTTPException(400, "Could not extract curve from image")

        # Compare with master
        import numpy as np
        score = similarity_score(
            np.array(master["v_data"]), np.array(master["i_data"]),
            np.array(result["v"]),      np.array(result["i"])
        )

        # Determine status + diagnosis
        master_feats  = master["feature_vector"]
        current_feats = result["features"]
        shape         = current_feats.get("shape_type", "unknown")
        expected      = master_feats.get("shape_type", "diode")

        if score >= 85 and shape == expected:
            status    = "ok"
            diagnosis = "normal"
        elif score >= 60:
            status    = "warning"
            diagnosis = _diagnose(current_feats, expected)
        else:
            status    = "fault"
            diagnosis = _diagnose(current_feats, expected)

        # Upload test image
        storage_path = f"results/{session_id}/{point_id}/{uuid.uuid4()}.png"
        upload_image(tmp_path, storage_path)

        row = {
            "session_id":       session_id,
            "point_id":         point_id,
            "image_path":       storage_path,
            "feature_vector":   current_feats,
            "v_data":           result["v"],
            "i_data":           result["i"],
            "similarity_score": score,
            "shape_type":       shape,
            "status":           status,
            "diagnosis":        diagnosis,
        }
        ins = supabase.table("test_results").insert(row).execute()
        out = ins.data[0]
        out["image_url"]    = get_public_url(storage_path)
        out["master_image_url"] = get_public_url(master["image_path"])
        out["master_v"]     = master["v_data"]
        out["master_i"]     = master["i_data"]
        return out
    finally:
        os.unlink(tmp_path)

def _diagnose(feats: dict, expected_shape: str) -> str:
    shape = feats.get("shape_type", "unknown")
    if shape == "capacitive_loop" and expected_shape == "diode":
        return "cap_leakage"
    if shape == "resistive" and expected_shape == "diode":
        return "diode_degradation"
    if feats.get("fill_ratio", 0) < 0.02:
        return "open_circuit"
    if feats.get("fill_ratio", 0) > 0.8:
        return "shorted"
    return "degraded"

# ─── PDF REPORT ──────────────────────────────────────────────
@app.post("/sessions/{session_id}/report")
async def generate_report(session_id: str, background_tasks: BackgroundTasks):
    """Generate PDF report for a completed session."""
    sess = (supabase.table("test_sessions")
            .select("*, boards(board_name), test_results(*, test_points(point_name, component_type))")
            .eq("session_id", session_id)
            .single()
            .execute())
    if not sess.data:
        raise HTTPException(404, "Session not found")

    pdf_path = generate_report_pdf(sess.data)
    storage_path = f"reports/{session_id}/report.pdf"
    upload_image(pdf_path, storage_path, content_type="application/pdf")
    os.unlink(pdf_path)

    return {"pdf_url": get_public_url(storage_path)}

# ─── HISTORY ─────────────────────────────────────────────────
@app.get("/boards/{board_id}/history")
def get_history(board_id: str, limit: int = 20):
    res = (supabase.table("test_sessions")
           .select("session_id, technician, test_date, status, test_results(status)")
           .eq("board_id", board_id)
           .order("test_date", desc=True)
           .limit(limit)
           .execute())
    return res.data
