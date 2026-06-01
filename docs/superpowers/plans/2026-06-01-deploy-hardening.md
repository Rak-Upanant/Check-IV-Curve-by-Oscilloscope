# Deploy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical deploy blockers: CORS wildcard, missing .env.example, Docker env var mismatch, and missing file size validation.

**Architecture:** All changes are isolated to config files and `backend/main.py`. No changes to the IV engine, analysis functions, or database schema — those are reviewed separately by the Master team.

**Tech Stack:** FastAPI (Python), React 18, Docker Compose, Render.com, Supabase

---

## Files Modified

| File | Change |
|---|---|
| `.env.example` | CREATE — placeholder template for required env vars |
| `docker-compose.yml` | Fix `SUPABASE_KEY` → `SUPABASE_SERVICE_KEY` (typo bug) |
| `backend/main.py` | Read `ALLOWED_ORIGIN` env var; use in CORS + exception handler; add upload size guard |

---

### Task 1: Create .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Write the file**

```
# .env.example — copy this to .env and fill in your values
# Get Supabase credentials from: https://supabase.com → Project Settings → API

# ── Supabase ──────────────────────────────────────────────────
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here

# ── Frontend dev server ────────────────────────────────────────
# Forces React dev server to port 3000 (kills ambiguity)
PORT=3000

# ── CORS ──────────────────────────────────────────────────────
# Leave UNSET for local dev (defaults to allow-all).
# Set to your frontend URL in production:
#   ALLOWED_ORIGIN=https://iv-sig-app.onrender.com
# ALLOWED_ORIGIN=

# ── REACT_APP_API_URL ──────────────────────────────────────────
# Leave UNSET for local dev (package.json proxy handles it).
# Set to your backend URL in production:
#   REACT_APP_API_URL=https://iv-sig-api.onrender.com
# REACT_APP_API_URL=
```

- [ ] **Step 2: Commit**

```powershell
git -C "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope" add .env.example
git -C "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope" commit -m "chore: add .env.example template"
```

---

### Task 2: Fix docker-compose.yml env var name

**Files:**
- Modify: `docker-compose.yml` line 11

The backend (`database.py:9`) reads `os.environ["SUPABASE_SERVICE_KEY"]` but docker-compose passes it as `SUPABASE_KEY`. This means Docker deploy silently fails with a `KeyError` on startup.

- [ ] **Step 1: Apply fix**

Change in `docker-compose.yml`:
```yaml
# BEFORE (line 11 — wrong name):
      - SUPABASE_KEY=${SUPABASE_KEY}

# AFTER (correct name):
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
```

- [ ] **Step 2: Verify locally (optional but recommended)**

```powershell
# From IV_Oscilloscope directory:
docker-compose config   # should show SUPABASE_SERVICE_KEY in backend env block
```

- [ ] **Step 3: Commit**

```powershell
git -C "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope" add docker-compose.yml
git -C "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope" commit -m "fix: docker-compose env var SUPABASE_KEY -> SUPABASE_SERVICE_KEY"
```

---

### Task 3: Fix CORS + exception handler

**Files:**
- Modify: `backend/main.py` lines 9, 26-31, 44

CORS is currently hardcoded to `["*"]`. The exception handler on line 44 also hardcodes the `Access-Control-Allow-Origin: *` header. Both need to read from an env var so production can be locked down.

`ALLOWED_ORIGIN` env var rules:
- **Not set** (local dev) → behave as `*` (allow all)
- **Set** (production) → allow only that origin

- [ ] **Step 1: Apply fix to main.py**

Replace the `os` import line and the middleware block (lines 9 and 26-44):

```python
# Change existing import line (line 9) from:
import os, uuid, tempfile, traceback

# To:
import os, uuid, tempfile, traceback

# Add this constant right after the imports, before `app = FastAPI(...)`:
_ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
```

Then replace the middleware setup (lines 26-31):
```python
# BEFORE:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# AFTER:
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_ALLOWED_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Then replace the hardcoded header in the exception handler (line 44):
```python
# BEFORE:
        headers={"Access-Control-Allow-Origin": "*"},

# AFTER:
        headers={"Access-Control-Allow-Origin": _ALLOWED_ORIGIN},
```

- [ ] **Step 2: Commit**

```powershell
git -C "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope" add backend/main.py
git -C "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope" commit -m "fix: CORS origin from env var ALLOWED_ORIGIN (defaults to * for local dev)"
```

---

### Task 4: Add file upload size guard

**Files:**
- Modify: `backend/main.py` — upload endpoints at lines 73, 136, 232, 304

No file size limit means a large image (or a bad actor sending a huge file) can crash the process. Add a 10 MB cap to each of the four upload endpoints.

- [ ] **Step 1: Add size-check helper near top of main.py (after `_ALLOWED_ORIGIN`)**

```python
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 10 MB)")
    return data
```

- [ ] **Step 2: Replace `await file.read()` calls in all four upload endpoints**

Each endpoint currently does:
```python
tmp.write(await file.read())
```

Replace every occurrence with:
```python
tmp.write(await _read_upload(file))
```

There are four endpoints to update:
- `upload_master` (~line 77)
- `analyze_image` (~line 158)
- `debug_analyze` (~line 242)
- `collect_image` (~line 351)

- [ ] **Step 3: Commit**

```powershell
git -C "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope" add backend/main.py
git -C "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope" commit -m "fix: 10 MB upload size guard on all file endpoints"
```

---

## Final verification

After all tasks:

```powershell
# Confirm no real secrets in .env.example
Get-Content "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope\.env.example"

# Confirm docker-compose uses the right key name
Select-String -Path "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope\docker-compose.yml" -Pattern "SUPABASE"

# Confirm main.py no longer has hardcoded wildcard origin strings
Select-String -Path "C:\Users\rak upanant\Desktop\CODING\IV_Oscilloscope\backend\main.py" -Pattern '"\*"'
```

Expected: no `"*"` matches in main.py after the fix.
