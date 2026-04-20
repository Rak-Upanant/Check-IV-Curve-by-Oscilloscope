# IV·SIG — I-V Signature Analysis System

IGBT board inspection via oscilloscope I-V curve comparison.
**Stack:** FastAPI · Python OpenCV · Supabase · React PWA · Docker · Render.com

---

## Project Structure

```
iv-signature/
├── backend/
│   ├── main.py            # FastAPI app + all endpoints
│   ├── iv_engine.py       # Image processing pipeline (Phase 1)
│   ├── database.py        # Supabase client
│   ├── storage.py         # File upload helpers
│   ├── pdf_generator.py   # ReportLab PDF
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   └── manifest.json  # PWA manifest
│   └── src/
│       ├── App.jsx
│       ├── styles.css
│       ├── lib/api.js
│       └── pages/
│           ├── BoardSelect.jsx
│           ├── SessionSetup.jsx
│           ├── TestFlow.jsx       ← core mobile workflow
│           ├── SessionSummary.jsx
│           └── MasterUpload.jsx
├── supabase/
│   └── schema.sql
├── Dockerfile             # Backend
├── Dockerfile.frontend    # Frontend (nginx)
├── docker-compose.yml     # Local dev
├── render.yaml            # Cloud deploy
└── .env.example
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /health | Health check |
| GET    | /boards | List all boards |
| GET    | /boards/{id}/points | Test points + master signatures |
| GET    | /boards/{id}/history | Past sessions |
| POST   | /boards/{board_id}/points/{point_id}/master | Upload master image |
| POST   | /sessions | Create test session |
| GET    | /sessions/{id} | Session + results |
| PATCH  | /sessions/{id}/complete | Mark session done |
| POST   | /sessions/{id}/analyze?point_id={pid} | Upload + analyze image |
| POST   | /sessions/{id}/report | Generate PDF report |

---

## Deploy Guide

### Step 1 — Supabase Setup

1. Go to https://supabase.com → New project
2. In **SQL Editor**, run `supabase/schema.sql` (full schema + seed data)
3. In **Storage**, create a bucket called `iv-signatures` → set to **Public**
4. In **Project Settings → API**, copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

### Step 2 — Deploy Backend to Render.com

1. Push this repo to GitHub
2. Go to https://render.com → **New → Blueprint**
3. Connect your GitHub repo → Render reads `render.yaml` automatically
4. In the `iv-sig-api` service, add environment variables:
   ```
   SUPABASE_URL          = https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY  = eyJ...
   ```
5. Deploy — copy the backend URL (e.g. `https://iv-sig-api.onrender.com`)

### Step 3 — Deploy Frontend to Render.com

1. In `render.yaml`, update `REACT_APP_API_URL` to your backend URL from Step 2
2. Redeploy the `iv-sig-app` service
3. Your PWA is live at `https://iv-sig-app.onrender.com`

### Step 4 — Add to Home Screen (PWA)

On iPhone:
- Open URL in Safari → Share → **Add to Home Screen**

On Android:
- Open URL in Chrome → Menu → **Add to Home Screen**

---

## Local Development

```bash
# 1. Clone + configure
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY

# 2. Run with Docker Compose
docker-compose up --build

# Backend:  http://localhost:8000
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

### Run backend without Docker
```bash
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

### Run frontend without Docker
```bash
cd frontend
npm install --legacy-peer-deps
REACT_APP_API_URL=http://localhost:8000 npm start
```

---

## Workflow (Technician)

```
1. Open PWA on smartphone
2. Select Board → Start Session (enter name)
3. For each test point:
   a. View master reference image
   b. Capture oscilloscope screenshot
   c. Upload → AI analysis runs
   d. See similarity score + OK/WARNING/FAULT
   e. Next point
4. Generate PDF report → download/share
```

---

## AI Processing Pipeline

```
Image Input (PNG from oscilloscope)
    ↓
Crop plot area (remove UI panel)
    ↓
HSV Yellow masking (extract curve)
    ↓
Morphological cleanup
    ↓
Skeletonization (scikit-image)
    ↓
Pixel coordinate extraction
    ↓
Normalize to V/I units
    ↓
Resample to 256 points
    ↓
Feature extraction:
  - bbox_aspect  → shape type classifier
  - enclosed_area, r2_linear, slope
    ↓
Shape classification:
  aspect > 3.0   → resistive  (NTC)
  aspect > 1.2   → capacitive_loop  (FAULT)
  else           → diode  (normal)
    ↓
DTW similarity score vs master (0–100)
    ↓
Diagnosis: normal / cap_leakage / diode_degradation / shorted / open_circuit
```

---

## Supabase Storage Structure

```
iv-signatures/          ← bucket (public)
├── masters/
│   └── {board_id}/{point_id}/{uuid}.png
├── results/
│   └── {session_id}/{point_id}/{uuid}.png
└── reports/
    └── {session_id}/report.pdf
```

---

## Score Thresholds

| Score | Status  | Meaning |
|-------|---------|---------|
| ≥ 85  | OK      | Matches master — component good |
| 60–84 | WARNING | Slight deviation — monitor |
| < 60  | FAULT   | Significant deviation — investigate |
