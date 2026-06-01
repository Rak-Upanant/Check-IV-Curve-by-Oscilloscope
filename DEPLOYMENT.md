# Deployment Checkpoint — IV Signature Analyzer

> Status: **LIVE on free tier ($0/month)** as of 2026-06-01.
> This file records the deployed architecture, URLs, env vars, and the
> gotchas we hit, so future work can resume without re-discovering them.

## Live URLs

| Piece | URL | Host |
|---|---|---|
| Frontend (React PWA) | https://iv-sig-app.onrender.com | Render **Static Site** (global CDN) |
| Backend (FastAPI) | https://iv-sig-api.onrender.com | Render **free web service** (Docker, Oregon) |
| Health check | https://iv-sig-api.onrender.com/health | returns `{"status":"ok",...}` |
| Database + storage | Supabase project `IV_Oscilloscope` (ref `hyirogmzkyzswymlsbkp`, ap-southeast-2) | Supabase free |

## Repository

- GitHub: `github.com/Rak-Upanant/Check-IV-Curve-by-Oscilloscope`
- **Single branch: `main`** (the old unrelated `master`/`main` split was merged into `main`; `master` deleted).
- Render Blueprint auto-deploys from `main` on every push (`autoDeploy: true`).

## Environment variables

**Backend (`iv-sig-api`) — set in Render dashboard, `sync: false`, NOT in git:**
- `SUPABASE_URL` = Supabase project URL
- `SUPABASE_SERVICE_KEY` = Supabase service_role key (secret)
- `ALLOWED_ORIGIN` = `https://iv-sig-app.onrender.com` (locks CORS to the frontend)

**Frontend (`iv-sig-app`) — in `render.yaml`, baked at build time:**
- `REACT_APP_API_URL` = `https://iv-sig-api.onrender.com`

## Keep-warm (avoids free-tier cold starts)

- UptimeRobot HTTP monitor → `https://iv-sig-api.onrender.com/health`
- Sends **HEAD** every **10 min** (free tier). Under Render's 15-min idle sleep, so the backend stays awake during use.

## Gotchas / lessons (so we don't repeat them)

1. **`render.yaml` uses `envVars`, not `buildArgs`** — `buildArgs` is not a valid Blueprint field and fails validation.
2. **Static site syntax:** `runtime: static`, `staticPublishPath: ./frontend/build`, `buildCommand`, and a `routes` rewrite (`source: /*` → `/index.html`) so SPA refreshes don't 404.
3. **`REACT_APP_*` is frozen at BUILD time.** Changing the value requires a rebuild — use Render "Manual Deploy → Clear build cache & deploy", then hard-refresh the browser (Ctrl+Shift+R).
4. **`/health` must accept HEAD** (`@app.api_route("/health", methods=["GET","HEAD"])`) — UptimeRobot free tier only sends HEAD and a GET-only route returns 405.
5. **Free-tier limits:** backend sleeps after 15 min idle; 750 instance-hours/month per workspace (static site uses none). 24/7 keep-warm ≈ 720–744 hrs — fits but tight. If tight, ping only during work hours via cron-job.org.
6. **Cloudflare was ruled out** for hosting: Workers run JS/WASM, can't run the Python/OpenCV/DTW backend without a full rewrite.

## How to redeploy

- Push to `main` → Render auto-deploys both services.
- To change a baked frontend value: edit `render.yaml` env, push, then if needed Manual Deploy with cache clear.
- Database schema lives in `supabase/schema.sql` (already applied: 5 tables, 3 boards, 21 test points, 9 master signatures).

## Open items (for later)

- Master team to review **function/accuracy** of the analysis engine (deferred — not part of deploy hardening).
- Watch Render free-hour usage mid-month; switch to work-hours pinging if close to 750.
- `ALLOWED_ORIGIN` is dashboard-managed — if the frontend service is renamed, update it or CORS breaks.
