---
description: Start or restart the FastAPI backend dev server for this project
---

# Run Backend

Working directory: `/Users/garvit/Manufacturing-Paper-Trail/style-tracker-mvp`

Uvicorn is in the local venv, not on PATH. Always use the venv binary.

## Steps

1. Kill any existing uvicorn process:
```bash
pkill -f "uvicorn main:app" 2>/dev/null; sleep 1
```

2. Start the server from the correct directory:
```bash
cd /Users/garvit/Manufacturing-Paper-Trail/style-tracker-mvp
.venv/bin/uvicorn main:app --reload --port 8000 &>/tmp/uvicorn.log &
echo "PID: $!"
```

3. Wait and verify:
```bash
sleep 4 && cat /tmp/uvicorn.log
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/openapi.json
```

A `200` response confirms startup. If the log shows an import error, read it and fix before retrying.

## Key facts
- Venv path: `style-tracker-mvp/.venv/bin/uvicorn`
- Entry point: `main:app` (file: `style-tracker-mvp/main.py`)
- Port: 8000
- `--reload` watches `style-tracker-mvp/` for file changes
- Logs go to `/tmp/uvicorn.log`
- `.env` must exist at `style-tracker-mvp/.env` with `DATABASE_URL`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET`
