"""
I-V Signature Analysis — FastAPI Backend
Deploy: Render.com / Railway
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os, uuid, tempfile, traceback
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

from .database import supabase
from .storage import upload_image, get_public_url
from .iv_engine import process_image, process_image_debug, similarity_score
from .pdf_generator import generate_report_pdf

_ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*").strip().rstrip("/")

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()  # buffers full body — acceptable at ≤10 MB limit
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 10 MB)")
    return data

app = FastAPI(
    title="IV Signature Analysis API",
    version="1.0.0",
    description="IGBT Board I-V Curve Signature Analysis System"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[_ALLOWED_ORIGIN],
    allow_credentials=False,   # set True (and use a specific origin, not *) when auth headers are needed
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── CORS-SAFE EXCEPTION HANDLER ─────────────────────────────
# FastAPI's CORSMiddleware does NOT add headers to unhandled 500s.
# This handler adds them explicitly so the browser sees a clean error
# instead of a silent CORS block.
#
# Security: the full traceback (which can contain table names, query text,
# and other internals) is written ONLY to the server log. The browser
# receives a generic message so we don't leak implementation details.
@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[UNHANDLED] {request.method} {request.url}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again."},
        headers={"Access-Control-Allow-Origin": _ALLOWED_ORIGIN},
    )

# ─── HEALTH ──────────────────────────────────────────────────
# Accept GET and HEAD: uptime monitors (e.g. UptimeRobot free tier) send
# HEAD requests, and a GET-only route would reject those with 405.
@app.api_route("/health", methods=["GET", "HEAD"])
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
        tmp.write(await _read_upload(file))
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
    board_id: str
    tag_no:   str            # inspection Tag NO (or technician name in analysis mode)
    notes:    Optional[str] = None

@app.post("/sessions")
def create_session(body: SessionCreate):
    res = supabase.table("test_sessions").insert({
        "board_id": body.board_id,
        "tag_no":   body.tag_no,
        "notes":    body.notes,
        "status":   "in_progress",
    }).execute()
    return res.data[0]

@app.get("/sessions/{session_id}")
def get_session(session_id: str):
    res = (supabase.table("test_sessions")
           .select("*, boards(board_name, description), test_results(*, test_points(point_name, component_type))")
           .eq("session_id", session_id)
           .single()
           .execute())
    # Attach public image URL to each result so the collector can show
    # thumbnails for points that were already uploaded (e.g. after a refresh).
    for result in (res.data.get("test_results") or []):
        if result.get("image_path"):
            result["image_url"] = get_public_url(result["image_path"])
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
        tmp.write(await _read_upload(file))
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

        # Shape mismatch is always a FAULT — score alone can't rescue it
        if shape != expected:
            status    = "fault"
            diagnosis = _diagnose(current_feats, expected)
        elif score >= 85:
            status    = "ok"
            diagnosis = "normal"
        elif score >= 60:
            status    = "warning"
            diagnosis = "degraded"
        else:
            status    = "fault"
            diagnosis = "degraded"

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

# ─── DEBUG PIPELINE ──────────────────────────────────────────
@app.post("/debug/analyze")
async def debug_analyze(
    file: UploadFile = File(...),
    point_id: Optional[str] = None,
):
    """
    Run full pipeline and return every intermediate step as base64 images
    or chart data arrays. Optionally compare with master if point_id given.
    """
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(await _read_upload(file))
        tmp_path = tmp.name

    try:
        debug = process_image_debug(tmp_path)
        if not debug:
            raise HTTPException(400, "Could not read image")

        # Optional step 9: similarity comparison with master
        if point_id and debug.get("result"):
            master_res = (supabase.table("master_signatures")
                          .select("*")
                          .eq("point_id", point_id)
                          .order("created_at", desc=True)
                          .limit(1)
                          .execute())
            if master_res.data:
                import numpy as np
                master = master_res.data[0]
                m_v = np.array(master["v_data"])
                m_i = np.array(master["i_data"])
                t_v = np.array(debug["result"]["v"])
                t_i = np.array(debug["result"]["i"])
                score = similarity_score(m_v, m_i, t_v, t_i)

                m_feats  = master["feature_vector"]
                t_feats  = debug["result"]["features"]
                shape    = t_feats.get("shape_type", "unknown")
                expected = m_feats.get("shape_type", "diode")

                if shape != expected:
                    status, diagnosis = "fault", _diagnose(t_feats, expected)
                elif score >= 85:
                    status, diagnosis = "ok", "normal"
                elif score >= 60:
                    status, diagnosis = "warning", "degraded"
                else:
                    status, diagnosis = "fault", "degraded"

                debug["steps"].append({
                    "name": "Similarity Comparison",
                    "desc": (f"DTW score: {score}%  ·  shape {shape} vs expected {expected}"
                             f"  ·  Status: {status.upper()}  ·  {diagnosis}"),
                    "chart": {
                        "type": "comparison",
                        "master_v": master["v_data"],
                        "master_i": master["i_data"],
                        "test_v":   debug["result"]["v"],
                        "test_i":   debug["result"]["i"],
                    },
                    "score":     score,
                    "status":    status,
                    "diagnosis": diagnosis,
                    "shape":     shape,
                    "expected":  expected,
                })

        return debug
    finally:
        os.unlink(tmp_path)

# ─── COLLECT ONLY (upload + store, no analysis) ──────────────
@app.post("/sessions/{session_id}/collect")
async def collect_image(
    session_id: str,
    point_id:   str,
    serial:     Optional[str] = None,    # board serial / unit ID (for path)
    file: UploadFile = File(...),
):
    """
    Upload and store an oscilloscope image without running analysis.

    Storage path structure:
      collected/{tag_no}/{board_name}/{serial_or_nosn}/{point_name}.png

    tag_no    = session.tag_no      (Tag NO entered at inspection start)
    serial    = query param         (Board Serial / Unit ID per board)
    board_name, point_name resolved from DB for human-readable paths.
    """
    # ── Resolve session → tag_no + board_id ──────────────────
    sess = (supabase.table("test_sessions")
            .select("board_id, tag_no")
            .eq("session_id", session_id)
            .single().execute())
    if not sess.data:
        raise HTTPException(404, "Session not found")
    tag_no   = (sess.data.get("tag_no") or "no-tag").strip().replace("/", "-")
    board_id = sess.data["board_id"]

    # ── Resolve board_name ────────────────────────────────────
    board_row = (supabase.table("boards")
                 .select("board_name")
                 .eq("board_id", board_id)
                 .single().execute())
    board_name = (board_row.data or {}).get("board_name", "unknown")

    # ── Resolve point_name ────────────────────────────────────
    point_row = (supabase.table("test_points")
                 .select("point_name")
                 .eq("point_id", point_id)
                 .single().execute())
    point_name = (point_row.data or {}).get("point_name", "unknown")

    # ── Build semantic storage path ───────────────────────────
    sn = (serial.strip().replace("/", "-") if serial else "no-sn") or "no-sn"
    storage_path = f"collected/{tag_no}/{board_name}/{sn}/{point_name}.png"
    # Using fixed filename per point → re-upload replaces previous image

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(await _read_upload(file))
        tmp_path = tmp.name

    try:
        upload_image(tmp_path, storage_path)

        # Re-upload safety: remove any previous result for this exact
        # (session, point) so "Replace" updates the record instead of
        # creating a duplicate row. The storage file is already overwritten
        # (fixed filename + upsert), so only the DB row needs cleaning.
        (supabase.table("test_results")
         .delete()
         .eq("session_id", session_id)
         .eq("point_id", point_id)
         .execute())

        row = {
            "session_id": session_id,
            "point_id":   point_id,
            "image_path": storage_path,
            "status":     "collected",
            "diagnosis":  "pending",
        }
        ins = supabase.table("test_results").insert(row).execute()
        out = ins.data[0]
        out["image_url"] = get_public_url(storage_path)
        return out
    finally:
        os.unlink(tmp_path)

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

    # Attach public image URL to each result so the PDF can embed the photo
    for result in (sess.data.get("test_results") or []):
        if result.get("image_path"):
            result["image_url"] = get_public_url(result["image_path"])

    pdf_path = generate_report_pdf(sess.data)

    # Semantic storage path:  reports/{tag_no}/{board_name}/report_{date}_{sid8}.pdf
    tag_no     = (sess.data.get("tag_no") or "no-tag").strip().replace("/", "-")
    board_name = (sess.data.get("boards") or {}).get("board_name", "unknown")
    date_str   = datetime.utcnow().strftime("%Y%m%d")
    sid8       = session_id.replace("-", "")[:8]
    storage_path = f"reports/{tag_no}/{board_name}/report_{date_str}_{sid8}.pdf"

    upload_image(pdf_path, storage_path, content_type="application/pdf")
    os.unlink(pdf_path)

    pdf_url = get_public_url(storage_path)

    # Persist the URL so the dashboard can show it without re-generating
    supabase.table("test_sessions").update({"report_url": pdf_url}).eq("session_id", session_id).execute()

    return {"pdf_url": pdf_url}

# ─── HISTORY (per board) ─────────────────────────────────────
@app.get("/boards/{board_id}/history")
def get_history(board_id: str, limit: int = 20):
    res = (supabase.table("test_sessions")
           .select("session_id, tag_no, test_date, status, test_results(status)")
           .eq("board_id", board_id)
           .order("test_date", desc=True)
           .limit(limit)
           .execute())
    return res.data

# ─── ALL SESSIONS (dashboard) ────────────────────────────────
@app.get("/sessions")
def get_all_sessions(limit: int = 200):
    """
    Return all sessions across all boards, newest first.
    Used by the dashboard to group inspections by Tag NO.
    """
    res = (supabase.table("test_sessions")
           .select(
               "session_id, tag_no, notes, test_date, status, board_id, report_url,"
               "boards(board_name, description),"
               "test_results(status, similarity_score, diagnosis)"
           )
           .order("test_date", desc=True)
           .limit(limit)
           .execute())
    return res.data
