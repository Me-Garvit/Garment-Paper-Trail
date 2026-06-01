# Debug Post-Mortem — Upload & Verify Flow

End-to-end trace of every issue hit while bringing the Buyer PO upload → AI parse → verify flow to working state.

---

## Issue 1 — S3 `SignatureDoesNotMatch`

**Symptom:** `POST /cases/` → 500. Log: `botocore.exceptions.ClientError: SignatureDoesNotMatch when calling PutObject`.

**Root cause:** The original `s3_storage.py` used boto3 with standard AWS defaults. Supabase Storage's S3-compatible endpoint requires `signature_version=s3v4` and path-style addressing. Even after adding those, the credentials still failed — Supabase's S3 compatibility layer is finicky and the error persisted.

**First attempt (partial):** Added `Config(signature_version='s3v4', s3={'addressing_style': 'path'})` to the boto3 client. Still failed.

**Ultimate fix:** Scrapped boto3 entirely. Rewrote `s3_storage.py` to call Supabase Storage's native REST API directly via `httpx`:
- Upload: `POST /storage/v1/object/{bucket}/{key}` with `Authorization: Bearer {service_role_key}`
- Signed URL: `POST /storage/v1/object/sign/{bucket}/{key}` with `{"expiresIn": 900}`

No S3 signing, no boto3 — just plain HTTP to the Supabase endpoint.

**Files changed:** `services/s3_storage.py`, `config.py` (removed AWS vars, added `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `STORAGE_BUCKET`), `.env`

---

## Issue 2 — OpenRouter 402 Payment Required

**Symptom:** Upload succeeded, then `POST /cases/` → 500. Log: `httpx.HTTPStatusError: 402 Payment Required for url 'https://openrouter.ai/...'`.

**Root cause:** The OpenRouter account had no credits. The primary model (Claude 3.5 Sonnet) and the existing fallback (GPT-4o) both route through OpenRouter billing.

**Fix:** Added DeepSeek as an independent fallback calling `api.deepseek.com` directly (bypasses OpenRouter entirely). Chain: OpenRouter → DeepSeek.

**Sub-issue discovered immediately:** DeepSeek returned `400 Bad Request` because `deepseek-chat` does not support the `image_url` message content type — it is text-only.

**Fix for sub-issue:** Added `pypdf` for PDF text extraction. `_call_deepseek` now extracts text from the PDF bytes via `PdfReader`, then sends plain text to DeepSeek. For non-PDF files (images), sends a placeholder text noting no image support.

**Files changed:** `services/openrouter_ai.py`, `config.py` (added `DEEPSEEK_API_KEY`), `.env`, `requirements.txt` (added `pypdf>=4.0.0`)

---

## Issue 3 — CORS Blocking All Frontend Requests

**Symptom:** Frontend showed "Upload failed" on every attempt. Backend logs showed `POST /cases/ 201 Created` — the request WAS succeeding at the backend, but the browser was blocking the response.

**Root cause:** Vite's dev server tried port 5173 (already in use) and moved to port 5174. The FastAPI CORS middleware only allowed `http://localhost:5173`. The browser rejected all responses from port 8000 because the origin `localhost:5174` was not in the allowlist.

**Fix:** Added `http://localhost:5174` to `allow_origins` in `main.py`.

**Files changed:** `main.py`

---

## Issue 4 — Duplicate Key Violation on Re-upload

**Symptom:** After the first failed upload attempt, retrying the same PO file hit `UniqueViolationError: duplicate key value violates unique constraint "buyer_pos_style_number_key"`.

**Root cause:** The first upload (which failed mid-way due to the CORS bug) had already written the case to the DB as a draft with `style_number = SS26_ZRA_PRT_BOXYF_NW_2`. The second attempt tried to INSERT a new row with the same style number.

**Fix:** Added upsert logic to `create_case`:
- If a draft with that style number already exists → update it (refresh file + parsed data).
- If a verified case with that style number exists → return `409 Conflict`.
- If no existing case → insert new row.

**Files changed:** `api/cases.py`

---

## Issue 5 — PDF Preview Showing `{"detail":"Not Found"}`

**Symptom:** Verify page loaded correctly with AI-extracted data on the left. Right panel showed `{"detail":"Not Found"}` instead of the PDF.

**Root cause:** `VerifyCase.jsx` used `draft.file_url` directly as the iframe `src`. The `file_url` stored in the DB is the raw Supabase Storage object key (e.g. `buyer_pos/d8acea39-...pdf`), not a URL. The browser resolved it as a relative path, hit the Vite proxy for `/cases`, which forwarded it to FastAPI — FastAPI returned 404.

**Fix (two parts):**

1. **Backend:** Added `document_url: str | None` field to `BuyerPOResponse`. In `get_case`, after fetching the ORM object, called `s3_storage.generate_presigned_url(case.file_url)` and set it on the response before returning. The presigned URL is a full absolute Supabase URL, valid for 15 minutes.

2. **Frontend:** Changed `VerifyCase.jsx` to use `draft.document_url` (the presigned URL) as the iframe `src` instead of `draft.file_url`.

**Bonus fix:** Rewrote the "Additional AI-Extracted Fields" section from raw `JSON.stringify` to a grid of key-value cards (label + value, flattened from `extra_fields`).

**Files changed:** `schemas/style_case.py`, `api/cases.py`, `frontend/src/pages/VerifyCase.jsx`

---

## Issue 6 — Vite Proxy Intercepting React Router Routes

**Symptom:** Navigating directly to `localhost:5174/cases/SS26_ZRA_PRT_BOXYF_NW_2/verify` in the browser returned `{"detail":"Method Not Allowed"}` on a black screen.

**Root cause:** `vite.config.js` had a proxy rule: `'/cases' → 'http://localhost:8000'`. This proxied ALL requests starting with `/cases` to FastAPI — including browser page navigation. When the browser loaded the React SPA route `/cases/.../verify`, Vite forwarded it to FastAPI which has no `GET /cases/{style}/verify` route, returning 405 Method Not Allowed.

The proxy was never needed because `api/client.js` already used `baseURL: 'http://localhost:8000'` for all API calls (direct to backend, bypassing Vite entirely).

**Fix:** Removed the proxy block from `vite.config.js` entirely. Restarted Vite (config changes require a full restart, not just HMR). Vite reclaimed port 5173.

**Files changed:** `frontend/vite.config.js`

---

## Issue 7 — PDF Uploaded as Empty File

**Symptom:** PDF viewer in the right panel showed "Failed to load PDF document." The filename was correct and the presigned URL was valid, but the file content was empty.

**Root cause:** In `api/cases.py`, the upload handler reads the file content first for AI parsing:
```python
content = await file.read()   # cursor moves to EOF
s3_key = await s3_storage.upload_document(file, ...)  # file cursor is at EOF
```
Inside `upload_document`, the code did `content = await file.read()` which returned `b""` (empty) because the cursor was already at the end. The empty bytes were uploaded to Supabase. The `await file.seek(0)` in `upload_document` was placed AFTER the read, resetting the cursor too late.

**Fix:** In `upload_document`, moved `await file.seek(0)` to BEFORE `content = await file.read()`:
```python
await file.seek(0)       # reset first
content = await file.read()  # now reads full file
```

**Files changed:** `services/s3_storage.py`

---

## Final State

All issues resolved. End-to-end flow confirmed working:

1. User uploads real Buyer PO PDF via the modal
2. File is stored in Supabase Storage (`documents` bucket, `buyer_pos/` folder)
3. DeepSeek extracts structured data (style number, buyer, qty, value, PO details, line items) from the PDF text
4. Case saved as draft with `PENDING_VERIFICATION` status
5. User lands on the split-screen Verify page
6. Left panel: editable form pre-populated with AI-extracted data + key-value metadata cards
7. Right panel: actual PDF rendered via Supabase presigned URL (15-min expiry)
8. "Confirm & Save" verifies the case and navigates to the Style Room
