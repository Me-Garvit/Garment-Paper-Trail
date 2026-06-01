---
description: Start or restart the Vite/React frontend dev server for this project
---

# Run Frontend

Working directory: `/Users/garvit/Manufacturing-Paper-Trail/style-tracker-mvp/frontend`

## Steps

1. Kill any existing Vite process:
```bash
pkill -f "vite" 2>/dev/null; sleep 1
```

2. Start the dev server:
```bash
cd /Users/garvit/Manufacturing-Paper-Trail/style-tracker-mvp/frontend
npm run dev &>/tmp/vite.log &
echo "PID: $!"
```

3. Wait and read the log to find the actual port:
```bash
sleep 3 && cat /tmp/vite.log
```

The log will show the port (typically 5173, but may be 5174+ if another process holds 5173).

## Key facts
- Framework: Vite + React 18 + Tailwind CSS 3 + React Router v6 + Axios
- Entry: `style-tracker-mvp/frontend/src/main.jsx`
- API base URL: `http://localhost:8000` (hardcoded in `src/api/client.js` — no proxy)
- **No Vite proxy** — the proxy was removed in Session 5 (it was forwarding page routes to FastAPI)
- Port 5173 is default; if occupied, Vite auto-increments. Always check the log for the actual port.
- Logs go to `/tmp/vite.log`
