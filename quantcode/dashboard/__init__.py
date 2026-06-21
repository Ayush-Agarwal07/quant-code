"""Read-only judge-facing dashboard.

Python side = a FastAPI read-API over workspace artifacts + Redis (`api.py`, lazy-imported
so the package works without the `[dashboard]` extra). UI side = the Next.js app in
`frontend/` (mirrors the AgentQR design). Nothing here writes Redis or files.
"""
