# conftest.py — placed at the repo root so pytest adds this directory to
# sys.path. That makes `from backend.iv_engine import ...` work without
# installing the project. pytest auto-discovers this file; you don't import it.
