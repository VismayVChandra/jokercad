# Vercel looks for a top-level `app` in index.py at the project root; the
# application itself lives in backend/app/main.py.
from backend.app.main import app  # noqa: F401
