# jokercad

Prompt-to-CAD: describe a part in plain English, get back a real solid you
can view and export (STL/GLB), generated with `build123d` (built on
OpenCascade).

The LLM never touches geometry directly — it writes `build123d` Python code,
which runs in a subprocess and gets exported. If the code fails or produces
invalid geometry, the error is fed back to the model for up to 3 self-repair
attempts.

Every part that builds is also checked against the request. The server draws
it from four directions (`backend/app/cad/render.py`, plain numpy + Pillow, no
GPU needed) and Gemini looks at the picture; if a feature is missing,
misplaced or the wrong shape, the model is told what to fix and tries again.
Without Gemini, a text-only check of the code and measurements runs instead.

## What you can do with a part

- **Edit dimensions by hand**: every size the code exposes shows up as a
  parameter; changing one rebuilds the part without an AI call.
- **Version history**: click any earlier ✓ to go back to it.
- **Compare versions** (`C`): overlays any two versions in the viewer (blue,
  orange, translucent) so a changed feature is easy to spot, next to a
  line-by-line diff of the code and a size/volume readout, with **Restore A**
  / **Restore B** buttons (`frontend/diff.js` for the diff itself).
- **From a photo or sketch**: attach a picture (📎, paste, or drop it on the
  chat). It's shrunk in the browser and sent to Gemini, which builds what it
  shows; the review compares the result with both the picture and a render.
- **Edit by clicking** (`E`): click a face or hole and say what to change. The
  app works out what was clicked (a flat face, a round hole or a round surface,
  with its size and position in the part's coordinates) and tells the AI to
  change only that.
- **3D print check** (`P`): overhangs that need support in red, walls under
  0.8 mm in orange, a bed-fit check for common printers, rough weight,
  filament, cost and time, **Auto-orient** to the side that prints best, and
  **Export 3MF** for Bambu Studio, PrusaSlicer, Orca or Cura
  (`frontend/print.js`).
- **Engineering drawing** (Export → PDF): front, top and side views with
  hidden lines dashed, overall sizes, centre marks and a hole table (position,
  Ø, through or depth), the part's parameters, an isometric view and a title
  block, in first-angle (ISO) or third-angle projection, on A4 or A3. It's SVG
  in millimetres, so printing (or "Save as PDF") is true to scale
  (`frontend/drawing.js`: edges from the mesh, hidden lines from depth maps).
- **Standard parts**: exact ISO sizes for M2–M20 bolts, nuts, washers,
  clearance and tap holes, counterbores, heat-set insert holes, nut traps and
  common ball bearings, plus coil springs, as helpers the model calls
  (`backend/app/cad/parts_library.py`).
- **More export formats**: **OBJ** (Export menu) for Blender, Maya and most
  3D apps, and **DXF** for laser or CNC cutting — the outline visible from
  whichever camera view is active (Top by default), as plain line entities in
  millimetres.
- **Fit** (under the chat box): press, sliding or loose, for printed or
  machined parts. Every prompt tells the model the clearance to use between
  holes and what goes in them, kept as an editable `clearance` parameter.
- **Organic** (✨ in the toolbar): the AI reshapes the current part with
  smooth, sculpted curves (splines, lofts, tapers) and rounds every edge with
  the built-in `soften()` helper, keeping holes, bores and main sizes. It's a
  new version, so the raw one is a click away, and `fillet_radius` shows up as
  an editable parameter.
- **Motion** (for mechanisms): the model's code includes a `motion` dict
  (the fixed part, pin and slide joints, which joint the slider drives), and
  the Motion card's slider or ▶ Play moves the parts. A small solver
  (`frontend/motion.js`) keeps every pin joined, so linkages follow correctly,
  and stops where the mechanism can't physically go any further.
- **Section view** (`S`): cut the part open along X, Y or Z to see bores and
  wall thicknesses.
- **Measure** (`M`): click two points for the distance and its X/Y/Z
  components; clicks near a corner snap to it.
- **Export**: STEP (exact geometry for Fusion, SolidWorks, FreeCAD), STL for
  printing, GLB, or a transparent PNG of the view.
- **Share**: copies a link that carries the part's code, so no database is
  needed. Whoever opens it sees the code and chooses whether to build it.
- Camera views `1`–`4`, wireframe `W`, `Esc` to close tools.

## Projects and assemblies

- **Projects** (the folder button at the top): each project holds several
  parts, each with its own chat and version history. Projects are saved in
  the browser (IndexedDB), so they need no account or server; **Export
  project file** writes a `.jokercad.json` backup that **Import** reads back,
  on any browser.
- **Assembly** tab: insert copies of the project's parts, then move and rotate
  them with the on-screen handles (`G` move, `R` rotate), by typing a position,
  or with 90° turns. **Snap faces together** turns a part so a face you click
  sits flush against a face on another part, centre to centre, so a pin's end
  snapped to the ring around a hole lands centred over it. `Ctrl+Z` undoes
  moves. The assembly always uses each part's current version, and exports as
  STL, GLB or PNG.
- **Joints**: **+ Pivot joint** — click a round hole or pin on one part, then
  the matching one on another, and a hinge is added between them, driven by a
  slider. **+ Slide joint** — click the two parts, then pick a direction. The
  first part clicked stays fixed; dragging it carries its jointed parts along
  (forward kinematics down a tree of joints — not a closed-loop linkage
  solver, so joints can't form a loop). Each joint's slider and the part it
  drives are saved with the project.
- **Explode view**: a slider that pulls the assembly's parts apart along the
  line from the assembly's centre to each part's own centre, to see how they
  fit — purely visual, so it never changes a part's saved position and is
  automatically turned off for exports.
- **Overlap check**: parts that overlap another part turn red, checked after
  every move, joint change, or explode change (a vertex-in-mesh test, so two
  paper-thin shells crossing with no vertex inside either can rarely slip
  through undetected).

## Syncing projects across devices (optional)

Projects work entirely from this browser's own storage by default — nothing
to set up. This section is for whoever **runs** the site: set it up once,
here, and it's available to everyone who signs in, each person's projects
kept private from everyone else's by the database policy in step 2 (not by
the site or by you having to do anything per-visitor). Connects a free
[Supabase](https://supabase.com) project (`frontend/sync.js`); until it's
set up here, the sync icon stays hidden for every visitor and nothing else
changes.

1. Create a free account at supabase.com and a new project (pick any name
   and a database password — you won't need that password again here).
2. Open its **SQL Editor** and run:

   ```sql
   create table if not exists public.projects (
     id uuid primary key,
     user_id uuid not null references auth.users(id) on delete cascade,
     name text not null,
     updated_at timestamptz not null default now(),
     data jsonb not null
   );

   alter table public.projects enable row level security;

   create policy "Users manage their own projects"
     on public.projects
     for all
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);

   create index if not exists projects_user_id_idx on public.projects (user_id);
   ```

   Row Level Security is what actually keeps each visitor's projects private
   from every other visitor — enforced by the database itself, on every
   request, regardless of who's signed in or what the browser sends.
3. Under **Authentication → URL Configuration**, add your site's URL to
   **Redirect URLs** (`https://your-app.vercel.app/*`, and
   `http://localhost:8000/*` too if you run it locally) — otherwise a
   sign-in email's link won't be allowed to bring anyone back.
4. Under **Project Settings → API**, copy the **Project URL** and the
   **anon public** key, and add them to the server's environment variables
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY` — alongside `GROQ_API_KEY` and the
   rest; on Vercel that's **Settings → Environment Variables**, then
   redeploy). Unlike the AI provider keys, the anon key is *meant* to be
   public — it's safe for the server to hand to every visitor's browser
   (via `/api/health`) precisely because of the policy in step 2.

Once that's set, anyone who opens the site sees a sync icon (top right),
signs in with their own email (a link, no password), and their projects
follow them to their other devices — still saved to each browser first and
working fully offline, with the cloud copy just catching up when there's a
connection. Signing in on a second device merges by whichever project was
saved most recently, so don't rely on it for editing the exact same project
on two devices at once.

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
