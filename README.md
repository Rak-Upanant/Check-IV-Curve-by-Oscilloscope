# IV·SIG — I-V Signature Analysis System

In-circuit IGBT board inspection via oscilloscope I-V curve comparison.

**Stack:** FastAPI · Python OpenCV/scikit-image · Supabase · React PWA · Docker · Render.com

**Live:** [iv-sig-app.onrender.com](https://iv-sig-app.onrender.com) (frontend) · [iv-sig-api.onrender.com/health](https://iv-sig-api.onrender.com/health) (backend) — see [DEPLOYMENT.md](DEPLOYMENT.md) for the full deployment record.

---

## App Flow

```
┌──────────────────────────────────────────────────────────┐
│  HOME  (/)                                               │
│                                                          │
│  [ ▶  Start Analysis ]      → /analyze  (compare mode)  │
│  [ 📄 Create Report ]       → /collect  (collect mode)  │
│  ──────────────────────────                              │
│  [ 📊 Inspection Dashboard ]                             │
│  [ ⚙  Upload Master Signatures ]                        │
│  [ 🔬 Pipeline Debugger ]                               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  CREATE REPORT  (/collect)                               │
│                                                          │
│  Tag NO: [ INS-2025-001 ]   ← inspection identifier     │
│                                                          │
│  Select Boards (multi-select checkboxes):                │
│    ☑ AGDR_Board                                          │
│    ☐ IGBT_BOARD_V2                                       │
│    ☐ IGBT_BOARD_V3                                       │
│                                                          │
│  [ Begin Collection → ]   creates 1 session per board   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  COLLECT FLOW  (/collect-flow)  — upload only            │
│                                                          │
│  One accordion section per board:                        │
│    • Board Serial / Unit ID input                        │
│    • Type selector: AGDR-71C / AGDR-76C                  │
│    • Upload button per test point (+ thumbnail)          │
│  📂 batch upload assigns files across all boards         │
│                                                          │
│  No PDF here — reports are generated from the Dashboard. │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  INSPECTION DASHBOARD  (/dashboard)                      │
│                                                          │
│  Sessions grouped by Tag NO, newest first                │
│  Per board: points collected, status badge, expandable   │
│  point-results table                                     │
│                                                          │
│  [ Load PDF ]  → generates report (with photos), saves   │
│  the link to the session — shows as [↓ PDF] forever      │
│  Auto-refreshes every 30 s · manual ↻ button             │
└──────────────────────────────────────────────────────────┘
```

Analysis mode (`/analyze` → `/test/:sessionId`) still exists: upload an image per
test point, the pipeline compares it to the master signature and returns a
similarity score + diagnosis.

---

## Boards & Test Points (seed data)

**AGDR_Board** — the primary board:

| Point | Type |
|---|---|
| Gate-Emitter_13-14 | diode |
| Gate-Emitter_16-17 | diode |
| Gate-Emitter_18-19 | diode |
| Gate-Emitter_21-22 | diode |
| Gate-Emitter_23-24 | diode |
| Gate-Emitter_26-27 | diode |
| NTC Thermistor_28-29 | resistive |

Plus mock boards `IGBT_BOARD_V2` (6 points) and `IGBT_BOARD_V3` (8 points) for
multi-board testing. Seeds live in [supabase/schema.sql](supabase/schema.sql).

---

## Image Processing Pipeline

```
Oscilloscope PNG (direct export, fixed size & axis range)
    │
    ▼  CROP plot area
    │  PLOT_CROP = (10, 50, 470, 520)   removes frame & menu panel
    │
    ▼  HSV Yellow mask
    │  Low  [15, 80,  80]
    │  High [45, 255, 255]   extracts yellow trace pixels
    │
    ▼  Blob-size filter  (keep ≥ 15 px connected components)
    │  No MORPH_CLOSE / MORPH_OPEN — preserves two-branch loop.
    │  In-circuit IGBTs produce a capacitive loop curve where the same
    │  voltage has TWO current values (outgoing + return AC sweep trace).
    │  Morphological ops would merge these branches.
    │
    ▼  Skeletonization  (Zhang-Suen, scikit-image)
    │  Thins mask to 1-pixel-wide centerline
    │
    ▼  Coordinate extraction → V/I scatter
    │  Pixel (x,y) → V ∈ [−10, +10]  I ∈ [−12, +10]  (fixed axis)
    │
    ▼  Feature extraction  (on raw scatter coords)
    │  slope, r², enclosed_area, bbox_aspect, fill_ratio
    │
    ▼  Shape classification
    │  bbox_aspect > 3.0  → resistive (NTC thermistor)
    │  bbox_aspect > 1.2  → capacitive_loop
    │  else               → diode
    │
    ▼  Resample to 256 pts on shared V axis  (DTW input only —
    │  np.interp collapses the two-branch loop to single-valued here)
    │
    ▼  DTW similarity vs master  (curves normalized to [−1,+1])
    │  score = max(0, 1 − DTW/n) × 100
    │
    ▼  Diagnosis
       Shape mismatch  → FAULT  (cap_leakage / diode_degradation)
       score ≥ 85      → OK
       score ≥ 60      → WARNING
       score < 60      → FAULT
```

---

## Project Structure

```
IV_Oscilloscope/
├── backend/
│   ├── main.py            # FastAPI app + all API endpoints
│   ├── iv_engine.py       # Image processing pipeline + DTW scoring
│   ├── database.py        # Supabase client (loads root .env)
│   ├── storage.py         # Supabase Storage upload helpers
│   ├── pdf_generator.py   # ReportLab PDF (incl. photo grid)
│   └── requirements.txt
├── frontend/                # React app built with Vite
│   ├── index.html         # Vite entry HTML (app root)
│   ├── vite.config.js     # dev server :3000 + API proxy to :8000
│   └── src/
│       ├── index.jsx                # React entry point
│       ├── App.jsx                  # Routes
│       ├── styles.css               # Dark oscilloscope theme
│       ├── lib/api.js               # Axios client (Vite proxy in dev)
│       └── pages/
│           ├── BoardSelect.jsx      # Home landing page
│           ├── AnalyzeSetup.jsx     # Analysis mode setup
│           ├── CollectSetup.jsx     # Create Report — multi-board + Tag NO
│           ├── CollectFlow.jsx      # Upload-only collector (per-board accordion)
│           ├── TestFlow.jsx         # Point-by-point analysis flow
│           ├── SessionSummary.jsx   # Analysis results + PDF
│           ├── Dashboard.jsx        # Inspection history + Load PDF
│           ├── MasterUpload.jsx     # Upload reference signatures
│           └── DebugAnalyzer.jsx    # Step-by-step pipeline debugger
├── supabase/
│   ├── schema.sql             # Tables + RLS + seed boards/points
│   ├── add_report_url.sql     # Migration: report_url column
│   ├── seed_boards_v2_v3.sql  # Mock boards V2/V3
│   └── update_names.sql       # AGDR_Board / Gate-Emitter renames
├── test_pic/              # Sample oscilloscope images
├── Dockerfile             # Backend container
├── Dockerfile.frontend    # Frontend (nginx)
├── docker-compose.yml     # Local: backend :8000, frontend :3002
├── render.yaml            # Render.com Blueprint
├── DEPLOYMENT.md          # Live URLs, env vars, free-tier gotchas
└── .env                   # Secrets (never committed — see .env.example)
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check (GET + HEAD for uptime monitors) |
| GET | `/boards` | List all boards |
| GET | `/boards/{id}/points` | Test points + master signatures |
| GET | `/boards/{id}/history` | Past sessions for one board |
| GET | `/sessions` | All sessions (dashboard) incl. `report_url` |
| GET | `/sessions/{id}` | Session + results |
| POST | `/sessions` | Create test session |
| PATCH | `/sessions/{id}/complete` | Mark session done |
| POST | `/sessions/{id}/analyze?point_id=` | Upload + analyze vs master |
| POST | `/sessions/{id}/collect?point_id=&serial=` | Upload + store only |
| POST | `/sessions/{id}/report` | Generate PDF (saves `report_url`) |
| POST | `/boards/{board_id}/points/{point_id}/master` | Upload master image |
| POST | `/debug/analyze?point_id=` | Full pipeline debug with step images |

Uploads are capped at **10 MB**. CORS origin is set by the `ALLOWED_ORIGIN`
env var (defaults to `*` for local dev).

---

## Supabase Storage Layout

```
iv-signatures/          ← bucket (public)
├── masters/{board_id}/{point_id}/{uuid}.png
├── results/{session_id}/{point_id}/{uuid}.png        ← analysis mode
├── collected/{tag_no}/{board_name}/{serial}/{point_name}.png
│       fixed filename per point → re-upload replaces the image
└── reports/{tag_no}/{board_name}/report_{YYYYMMDD}_{sid8}.pdf
```

The PDF report embeds the collected photos in a 2-column grid and its URL is
persisted on the session (`test_sessions.report_url`) so the Dashboard shows
a download link without regenerating.

---

## Setup Guide

### 1 — Supabase

1. [supabase.com](https://supabase.com) → New Project
2. **SQL Editor** → run `supabase/schema.sql`, then `supabase/add_report_url.sql`
3. **Storage** → New bucket `iv-signatures` → toggle **Public** ON
4. **Project Settings → API** → copy Project URL + `service_role` key

### 2 — Local `.env` (project root — backend only)

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiI...
```

Do **not** set `VITE_API_URL` locally — Vite's dev server proxies API calls to
`localhost:8000` (see `frontend/vite.config.js`), which avoids CORS entirely.
The dev server is pinned to port 3000 (`strictPort`).

### 3 — Run Locally

```bash
# Terminal 1 — backend (from project root)
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Docker alternative: `docker-compose up --build` → backend `:8000`,
frontend `:3002` (3002 so it never collides with `npm run dev`).

### 4 — Smoke Test the Pipeline

```bash
python -c "
import sys; sys.path.insert(0, '.')
from backend.iv_engine import process_image
import os
for f in sorted(os.listdir('test_pic')):
    r = process_image(f'test_pic/{f}')
    if r: print(f'{f}: {r[\"features\"][\"shape_type\"]}')
"
```

### 5 — Deploy

Push to `main` → Render auto-deploys both services from `render.yaml`.
Full instructions, env vars, and free-tier gotchas: [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Tests

The image pipeline (`backend/iv_engine.py`) is covered by a pytest suite that
uses the real sample images in `test_pic/` as fixtures — it checks shape
classification, output structure, and DTW scoring.

```bash
pip install -r backend/requirements-dev.txt
pytest backend/tests/ -v
```

These tests run automatically on every push and pull request via
[GitHub Actions](.github/workflows/tests.yml) — no database or secrets needed.

---

## Debug Tools

`/debug` — upload any oscilloscope image to inspect every pipeline step
(crop box, HSV mask, blob filter, skeleton, raw two-branch scatter, resampled
curve, features, master comparison) with annotated images and charts.
