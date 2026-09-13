# jokercad

Prompt-to-CAD: describe a part in plain English, get back a real solid you
can view and export (STL/GLB), generated with `build123d` (built on
OpenCascade).

The LLM never touches geometry directly — it writes `build123d` Python code,
which runs in a subprocess and gets exported. If the code fails or produces
invalid geometry, the error is fed back to the model for up to 3 self-repair
attempts.

## What you can do with a part

- **Edit dimensions by hand**: every size the code exposes shows up as a
  parameter; changing one rebuilds the part without an AI call.
- **Version history**: click any earlier ✓ to go back to it.
- **Section view** (`S`): cut the part open along X, Y or Z to see bores and
  wall thicknesses.
- **Measure** (`M`): click two points for the distance and its X/Y/Z
  components; clicks near a corner snap to it.
- **Export**: STEP (exact geometry for Fusion, SolidWorks, FreeCAD), STL for
  printing, GLB, or a transparent PNG of the view.
- **Share**: copies a link that carries the part's code, so no database is
  needed. Whoever opens it sees the code and chooses whether to build it.
- Camera views `1`–`4`, wireframe `W`, `Esc` to close tools.

## Free by design

- **Geometry**: `build123d` (OpenCascade) — open source.
- **LLM**: a provider router tries **Gemini** (free tier) → **Groq** (free
  tier) → **Ollama** (local, no key) in order, falling through automatically
  if one is unconfigured, rate-limited, or down. You only need one of them.
  Gemini goes first because it writes much better code for complex parts;
  Groq answers the quick check of each built part.
  Free tiers limit each model separately, so each provider also falls back
  to its other models (`GROQ_FALLBACK_MODELS`, `GEMINI_FALLBACK_MODELS`)
  before giving up.
- **Frontend**: Three.js via CDN, no build step.
- **Hosting**: runs on Vercel's free Hobby plan (see below).

## Run locally

1. From the repo root, install dependencies (Python 3.11+):

   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Copy `backend/.env.example` to `backend/.env` and fill in at least one provider:
   - **Groq**: free key at https://console.groq.com/keys
   - **Gemini**: free key at https://aistudio.google.com/app/apikey
   - **Ollama**: install from https://ollama.com, then `ollama pull qwen2.5-coder:7b`

3. From the repo root, start the server:

   ```bash
   uvicorn app.main:app --app-dir backend --port 8000
   ```

4. Open http://localhost:8000.

The first generation on a fresh Windows machine can take a minute or more
while antivirus scans OpenCascade's native libraries; later ones take seconds.
If Windows **Smart App Control** is on, it may block those unsigned libraries
entirely ("An Application Control policy has blocked this file"); run the
backend on Linux instead (WSL, Docker, or a deployment).

## Deploy to Vercel (free Hobby plan)

The bundle is about 720 MB — over the standard 500 MB limit for Python
functions — so it relies on Vercel's Large Functions beta (up to 5 GB).

1. Import the GitHub repo as a Vercel project. Framework preset: **FastAPI**.
   Root Directory: the repo root (`./`). Vercel loads the app from `index.py`.
2. In **Settings → Environment Variables** (Production and Preview), add:
   - `VERCEL_SUPPORT_LARGE_FUNCTIONS` = `1`
   - `GROQ_API_KEY` (and/or `GEMINI_API_KEY`)
   - `APP_PASSWORD` — a long random password. Without it, the deployment
     refuses to generate.
   - optionally `LLM_PROVIDER_ORDER=gemini,groq`, since Ollama isn't available there
3. Redeploy.

The server keeps no state between requests: the browser sends the conversation
with each prompt, and the finished model comes back in the response.

Vercel's function runtime lacks the OpenGL/X11 system libraries OpenCascade
links against. `vercel.json` runs `scripts/vendor_system_libs.sh` as the
build command (after Vercel installs the Python packages), which installs them
in the build container and copies them into `backend/syslibs`; the CAD
subprocess loads them via `LD_LIBRARY_PATH`. Don't set a custom install
command: it replaces Vercel's own Python package install and the app crashes
on startup.

## Other hosts (Docker)

The `Dockerfile` runs anywhere that runs containers (Google Cloud Run, Render,
a VPS). It listens on `$PORT` (default 8000). Set the same environment
variables as for Vercel.

## Security

Generated code runs in a subprocess on the server. API keys and other
secret-looking variables are removed from its environment, and a basic filter
blocks obvious dangerous calls — but both are easy to get around, so treat
anyone who can generate as someone who can run code on the server and use your
LLM quota.

- Set `APP_PASSWORD` on any publicly reachable deployment. Generation then
  requires the password; the page itself stays viewable. Use a long random
  value — nothing slows down password guessing.
- `GENERATIONS_PER_HOUR` (default 60) caps generations.

## Current limitations

- The hourly generation cap is kept in memory, so on serverless hosts it
  applies per running instance rather than globally.
- Each prompt regenerates code from the conversation rather than patching a
  persistent feature tree.
