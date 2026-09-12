# jokercad

Prompt-to-CAD: describe a part in plain English, get back a real parametric
solid you can view and export (STL/GLB), generated via `build123d` (built on
OpenCascade).

The LLM never touches geometry directly — it writes `build123d` Python code,
which gets executed in a subprocess and exported. If execution fails, the
error is fed back to the model for up to 3 self-repair attempts.

## Free by design

No API costs required to run this yourself:

- **Geometry**: `build123d` (OpenCascade) — open source.
- **LLM**: a provider router tries **Groq** (free tier) → **Gemini** (free
  tier) → **Ollama** (local, no key) in order, falling through automatically
  if one is unconfigured or rate-limited. You only need to set up *one* of
  the three to get started.
- **Frontend**: Three.js via CDN, no build step.

## Setup

1. Install backend dependencies (Python 3.11+ recommended):

   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and fill in at least one provider:

   ```bash
   copy .env.example .env
   ```

   - **Groq** (recommended first): free key at https://console.groq.com/keys
   - **Gemini**: free key at https://aistudio.google.com/app/apikey
   - **Ollama**: install from https://ollama.com, then `ollama pull qwen2.5-coder:7b`
     — no key needed, works offline.

3. Run the server:

   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

4. Open http://localhost:8000 and type a prompt, e.g.:
   > a 40x20x10mm box with a 4mm hole drilled through the center

Check `/api/health` to see which providers are currently configured.

## Notes / current limitations

- **Not a sandboxed multi-tenant service.** Generated code runs as a local
  subprocess with a basic denylist on dangerous tokens — fine for you running
  it against your own prompts, not safe to expose to untrusted users on the
  open internet without a real sandbox (Docker/gVisor/firejail).
- **Session state is in-memory** and resets when the server restarts.
- Each prompt currently regenerates code from the full conversation history
  rather than surgically patching a persistent feature tree — good enough for
  iterating by conversation, but large multi-step models will get slower and
  less reliable to edit this way. A persistent, structured feature tree is
  the natural next step.
