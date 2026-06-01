# IV·SIG — I-V Signature Analysis System

In-circuit IGBT board inspection via oscilloscope I-V curve comparison.

**Stack:** FastAPI · Python OpenCV/scikit-image · Supabase · React PWA · Docker · Render.com

---

## App Flow

```
┌──────────────────────────────────────────────────────────┐
│  HOME  (/)                                               │
│                                                          │
│  ┌─────────────────────────────┐                        │
│  │  IGBT_BOARD_V1  ›           │  ← tap to expand       │
│  │  ─────────────────────────  │                        │
│  │  Technician Name: [      ]  │  ← inline form         │
│  │  [ ▶ Start Analysis ]       │  → TestFlow (analyze)  │
│  └─────────────────────────────┘                        │
│  ┌─────────────────────────────┐                        │
│  │  IGBT_BOARD_V2  ›           │                        │
│  └─────────────────────────────┘                        │
│                                                          │
│  [ 📄 Create Report ]          → /collect               │
│  [ ⚙  Upload Master Signatures ]                        │
│  [ 🔬 Pipeline Debugger ]                               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  CREATE REPORT  (/collect)                               │
│                                                          │
│  Board Type:  ◉ IGBT_BOARD_V1                           │
│               ○ IGBT_BOARD_V2                           │
│               ○ IGBT_BOARD_V3                           │
│                                                          │
│  Technician Name: [                    ]                 │
│  Board Serial:    [                    ]  (optional)     │
│  Notes:           [                    ]  (optional)     │
│                                                          │
│  [ Begin Collection → ]  → TestFlow (collect)           │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  TEST FLOW  (/test/:sessionId)                           │
│                                                          │
│  ANALYZE mode:                                           │
│    For each test point:                                  │
│    Upload image → pipeline runs → score + diagnosis      │
│    Master reference shown for comparison                 │
│    → Session Summary → PDF report                        │
│                                                          │
│  COLLECT mode:                                           │
│    Select one image OR multiple images at once           │
│    Multiple files auto-assigned to consecutive points    │
│    No analysis, no master reference shown                │
│    → Session Summary → PDF report                        │
└──────────────────────────────────────────────────────────┘
```

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
    │  No MORPH_CLOSE / MORPH_OPEN — preserves two-branch loop
    │  In-circuit IGBTs produce a capacitive loop curve where
    │  the same voltage has TWO current values (outgoing + return
    │  AC sweep trace). Morphological ops would merge these branches.
    │
    ▼  Skeletonization  (Zhang-Suen, scikit-image)
    │  Thins mask to 1-pixel-wide centerline
    │
    ▼  Coordinate extraction → V/I scatter
    │  Pixel (x,y) → V ∈ [−10, +10]  I ∈ [−12, +10]  (fixed axis)
    │  Two-branch loop visible here as two I values at same V
    │
    ▼  Feature extraction  (on raw scatter coords)
    │  slope, r², enclosed_area, bbox_aspect, fill_ratio
    │
    ▼  Shape classification
    │  bbox_aspect > 3.0  → resistive (NTC thermistor)
    │  bbox_aspect > 1.2  → capacitive_loop (suspect fault)
    │  else               → diode (normal in-circuit diode)
    │
    ▼  Resample to 256 pts on shared V axis  (DTW input only)
    │  NOTE: np.interp collapses two-branch → single-valued here.
    │  Step above (scatter) is the faithful two-branch representation.
    │
    ▼  DTW similarity vs master
    │  Both curves normalized to [−1,+1] before DTW
    │  score = max(0, 1 − DTW/n) × 100
    │
    ▼  Diagnosis
       Shape mismatch  → FAULT  (cap_leakage / diode_degradation)
       score ≥ 85      → OK     (normal)
       score ≥ 60      → WARNING (degraded)
       score < 60      → FAULT  (degraded)
```

---

## Score Thresholds

| Score | Status | Meaning |
|---|---|---|
| ≥ 85 + shape match | OK | Component matches master |
| 60 – 84 | WARNING | Slight deviation — monitor |
| < 60 | FAULT | Significant deviation — inspect |
| shape mismatch | FAULT | Wrong curve type regardless of score |

---

## Project Structure

```
IV_Oscilloscope/
├── backend/
│   ├── main.py            # FastAPI app + all API endpoints
│   ├── iv_engine.py       # Full image processing pipeline
│   ├── database.py        # Supabase client (loads .env)
│   ├── storage.py         # Supabase Storage upload helpers
│   ├── pdf_generator.py   # ReportLab PDF generation
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx                  # Routes
│       ├── styles.css               # Dark oscilloscope theme
│       ├── lib/api.js               # Axios API client
│       └── pages/
│           ├── BoardSelect.jsx      # Home — Analysis mode
│           ├── CollectSetup.jsx     # Create Report — Collect mode
│           ├── TestFlow.jsx         # Core test workflow (both modes)
│           ├── SessionSummary.jsx   # Results + PDF download
│           ├── MasterUpload.jsx     # Upload reference signatures
│           └── DebugAnalyzer.jsx    # Step-by-step pipeline debugger
├── supabase/
│   └── schema.sql         # Tables + indexes + seed data
├── test_pic/              # Sample oscilloscope images for testing
├── Dockerfile             # Backend container
├── Dockerfile.frontend    # Frontend (nginx)
├── docker-compose.yml     # Local development
├── render.yaml            # Render.com deployment blueprint
└── .env                   # Secrets (never commit)
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/boards` | List all boards |
| GET | `/boards/{id}/points` | Test points + master signatures |
| GET | `/boards/{id}/history` | Past sessions |
| POST | `/boards/{board_id}/points/{point_id}/master` | Upload master image |
| POST | `/sessions` | Create test session |
| GET | `/sessions/{id}` | Session + results |
| PATCH | `/sessions/{id}/complete` | Mark session done |
| POST | `/sessions/{id}/analyze?point_id=` | Upload + analyze (compare vs master) |
| POST | `/sessions/{id}/collect?point_id=` | Upload + store only (no analysis) |
| POST | `/sessions/{id}/report` | Generate PDF report |
| POST | `/debug/analyze?point_id=` | Full pipeline debug with step images |

---

## Supabase Storage Layout

```
iv-signatures/          ← bucket (public)
├── masters/
│   └── {board_id}/{point_id}/{uuid}.png
├── results/
│   └── {session_id}/{point_id}/{uuid}.png
├── collected/
│   └── {session_id}/{point_id}/{uuid}.png
└── reports/
    └── {session_id}/report.pdf
```

---

## Setup Guide

### 1 — Supabase

1. [supabase.com](https://supabase.com) → New Project → Region: **Southeast Asia (Singapore)**
2. **SQL Editor** → paste `supabase/schema.sql` → Run
3. **Storage** → New bucket → name: `iv-signatures` → toggle **Public** ON
4. **Project Settings → API** → copy:
   - `Project URL` → `SUPABASE_URL` (format: `https://xxxx.supabase.co`)
   - `service_role` key → `SUPABASE_SERVICE_KEY` (starts with `eyJ…`)

### 2 — Local `.env`

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiI...
REACT_APP_API_URL=http://localhost:8000
```

### 3 — Run Locally

**Docker Compose (recommended — matches production):**
```bash
docker-compose up --build
# Backend:  http://localhost:8000
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

**Manual:**
```bash
# Terminal 1 — backend (run from project root)
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install --legacy-peer-deps
npm start
```

### 4 — Smoke Test Pipeline

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

### 5 — Deploy to Render.com

1. Push repo to GitHub
2. [render.com](https://render.com) → **New → Blueprint** → connect repo (reads `render.yaml`)
3. Set env vars on `iv-sig-api` service: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
4. Deploy backend → copy its URL (e.g. `https://iv-sig-api.onrender.com`)
5. Set `REACT_APP_API_URL` on `iv-sig-app` → redeploy frontend
6. **Anti-sleep:** [UptimeRobot](https://uptimerobot.com) → HTTP monitor → `https://iv-sig-api.onrender.com/health` → every 5 min

### 6 — Install as PWA

| Platform | Steps |
|---|---|
| iPhone | Safari → Share → **Add to Home Screen** |
| Android | Chrome → Menu → **Add to Home Screen** |

---

## Adding More Board Types

To add IGBT_BOARD_V2, IGBT_BOARD_V3, etc., run in Supabase SQL Editor:

```sql
INSERT INTO boards (board_name, description) VALUES
  ('IGBT_BOARD_V2', 'Description of V2 board');

-- Then add its test points:
INSERT INTO test_points (board_id, point_name, component_type, sort_order)
SELECT board_id, 'IGBT1', 'diode', 1 FROM boards WHERE board_name = 'IGBT_BOARD_V2';
-- (repeat for each test point)
```

New boards appear automatically in both the Home (Analysis) and Create Report (Collect) screens.

---

## Debug Tools

Open `http://localhost:3000/debug` (or production URL `/debug`) to run the
**Pipeline Debugger** — upload any oscilloscope image to inspect every
processing step with annotated images and charts:

| Step | Shows |
|---|---|
| 1 Original | Raw export |
| 2 Crop | Cyan crop box + cropped result |
| 3 HSV Mask | Binary mask + matched pixels |
| 4 Blob Filter | Cleaned mask (noise removed) |
| 5 Skeleton | 1-px centerline + green overlay |
| 6 Raw I-V | Scatter — **two-branch loop visible here** |
| 7 Resampled | Single-valued curve for DTW (two-branch collapsed) |
| 8 Features | shape_type, slope, r², fill_ratio table |
| 9 Comparison | Master vs test overlay + score + diagnosis |
