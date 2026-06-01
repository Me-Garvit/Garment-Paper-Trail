# Project Build History — Style-Anchored Garment Tracking System

---

## MANDATORY RULE — Read Before Making Any Change

> **Every model and every session must follow this rule without exception.**

After making **any** of the following changes:
- Adding, renaming, moving, or deleting a file or folder
- Adding or removing a function, class, route, or component
- Changing what a file is responsible for
- Adding or removing a dependency or environment variable

**You must update `history.md` before ending the session:**
1. Add a new dated entry at the top of the Session Log describing what changed and why.
2. Update the relevant entry in the **File Map** section to reflect the current state — new files get a full entry, deleted files get removed, changed files get their description updated.

The File Map must always reflect the live codebase. A new session or a different model reading only `history.md` must be able to navigate to the exact file for any change without reading the code first. If it can't, the File Map is out of date — fix it.

---

## Session Log

---

### Session 7 — 2026-05-31

**Status:** Document side-panel viewer + re-edit capability added to all record types. GRN ingestion upgraded to full AI-extracted line-item framework.

**What was done:**

1. **Universal PDF side panel (`DocumentPanel.jsx`):**
   - New `components/DocumentPanel.jsx` — fixed-right slide-in drawer with iframe, backdrop click to close, loading state. Fetches a fresh presigned URL every time it opens (no stale tokens).
   - `StyleRoom.jsx`: "View PDF" button + "Edit PO Details" button added to Buyer PO Details card. Opens panel by calling `getCase()` for a fresh `document_url`.
   - `SupplierRoom.jsx`: Eye icon on each PO row (calls `getSupplierPO`), eye icon on each invoice row (calls `getSupplierInvoice`), both open the panel. Row click still navigates to edit.
   - All verify pages (`VerifyCase`, `VerifySupplierPO`, `VerifyInvoice`) accessible from list views via Edit buttons — editing already-verified records is fully supported.

2. **`GET .../invoices/{invoice_id}` endpoint + presigned URL fix:**
   - Added `GET /{supplier_id}/invoices/{invoice_id}` to `api/supplier_rooms.py` — returns single invoice with `document_url`.
   - Added `document_url: str | None` to `SupplierInvoiceResponse` in `schemas/accounting.py`.
   - `VerifyInvoice.jsx` switched from `listInvoices + find` to `getSupplierInvoice` (single fetch). Fixed iframe to use `document_url` (presigned) instead of raw `file_url` — same bug VerifyCase had.

3. **GRN AI ingestion framework (full rebuild):**
   - `services/openrouter_ai.py`: Added `GRN_PARSE_PROMPT` — forces strict JSON output with header block (`challan_no`, `challan_date`, `vehicle_no`, `supplier_name`, `grn_number`) + `line_items[]` array (each row: `item_name`, `incoming_qty` as number, `uom`: CONE/BOX/GRS/PCS/MTR/KG/SET/ROLL). Added `parse_grn()` using same OpenRouter → DeepSeek+pypdf fallback chain.
   - `schemas/procurement.py`: Added `GRNVerify` schema (header fields + `line_items`). Added `document_url: str | None` to `GRNResponse`.
   - `api/supplier_rooms.py`: Added three new GRN routes:
     - `POST .../grns/upload` — UploadFile, calls `parse_grn()`, computes `received_quantity = Σ(incoming_qty)`, writes full line-item array atomically into JSONB `metadata_` as draft.
     - `GET .../grns/{grn_id}` — returns single GRN with presigned `document_url`.
     - `PATCH .../grns/{grn_id}/verify` — updates header + line_items in JSONB, recomputes `received_quantity`, marks VERIFIED. Added `_require_grn` helper.
   - `SupplierRoom.jsx`: Inline GRN logger removed. "+ Upload GRN" button → `UploadModal` → navigates to `VerifyGRN`. Edit icon on each GRN row.
   - New `pages/VerifyGRN.jsx`: Split-screen verify. Left: 2-col header form + editable line-items grid (item name / qty / UOM dropdown / delete row) + live total qty row + "+ Add Row". Right: PDF/image iframe via presigned URL. "Confirm & Save GRN" / "Update GRN" mode-aware button.
   - `api/client.js`: Added `uploadGRN`, `getGRN`, `verifyGRN`.
   - `App.jsx`: Added route `/cases/:styleNumber/suppliers/:supplierId/pos/:poId/grns/:grnId/verify`.

**New files:**
- `frontend/src/components/DocumentPanel.jsx` — universal PDF side-panel drawer
- `frontend/src/pages/VerifyGRN.jsx` — GRN split-screen verify page

**New API routes:**
- `GET /cases/{style_number}/suppliers/{supplier_id}/invoices/{invoice_id}` — single invoice with presigned URL
- `POST /cases/{style_number}/suppliers/{supplier_id}/pos/{po_id}/grns/upload` — GRN document upload + AI parse
- `GET /cases/{style_number}/suppliers/{supplier_id}/pos/{po_id}/grns/{grn_id}` — single GRN with presigned URL
- `PATCH /cases/{style_number}/suppliers/{supplier_id}/pos/{po_id}/grns/{grn_id}/verify` — confirm GRN

**Next Steps (pick up here in Session 8):**
1. Test full GRN upload → verify → confirm with a real challan PDF.
2. Verify 3-way match runs correctly after a GRN is confirmed (sum of GRN qty feeds into `run_three_way_match`).
3. Test VerifyInvoice presigned URL fix — invoice PDF should now render in the right panel.
4. Future: outbound invoices + payments tables for revenue side and case closure logic.

---

### Session 6 — 2026-05-30

**Status:** Supplier Room fully operational — supplier creation fixed, Supplier PO upload + AI parse + split-screen verify flow built end-to-end.

**What was done:**

1. **Fix "Add Supplier Room" (two bugs):**
   - `create_supplier` had no `style_number` path param and no get-or-create → `UniqueViolationError` on retry.
   - `list_suppliers` joined only through `supplier_pos` → newly created suppliers (with no PO yet) were invisible.
   - **Fix:** Created `style_supplier_rooms` junction table (SQL migration). Added `StyleSupplierRoom` SQLAlchemy model. Updated `create_supplier` to get-or-create the global `Supplier` and upsert a `StyleSupplierRoom` link. Updated `list_suppliers` to join via `style_supplier_rooms` instead of `supplier_pos`.

2. **Supplier PO — upload & AI parse (new feature):**
   - Replaced manual PO form in `SupplierRoom.jsx` with "Upload PO" → `UploadModal` → navigate to split-screen verify.
   - `POST /cases/{style_number}/suppliers/{supplier_id}/pos` now accepts `UploadFile`: uploads to `supplier_pos/` Supabase bucket, calls `parse_supplier_po()`, saves draft `SupplierPO` with `file_url`/`is_draft`/`verification_status` in JSONB `metadata_`.
   - Added `GET /pos/{po_id}` (returns `document_url` presigned URL) and `PATCH /pos/{po_id}/verify` (confirms the draft, sets `is_draft=False`, `verification_status=VERIFIED` in JSONB).

3. **`parse_supplier_po` — targeted AI prompt:**
   - Refactored `_call_openrouter` and `_call_deepseek` in `openrouter_ai.py` to accept a `prompt` param (default = `DOCUMENT_PARSE_PROMPT`). No breaking change to `parse_document`.
   - Added `SUPPLIER_PO_PARSE_PROMPT` targeting: supplier name, PO number, material category, HSN codes, line items (item name, HSN, qty, rate, taxable value, UOM), agreed rate, total qty/value, payment terms.
   - Added `parse_supplier_po()` using the same OpenRouter → DeepSeek fallback chain.

4. **`VerifySupplierPO.jsx` — new split-screen page:**
   - Left: editable form (supplier name, PO#, material category dropdown, agreed rate, ordered qty) + HSN code badge row + line items table + extra metadata cards.
   - Right: PDF iframe via `document_url` presigned URL.
   - "Confirm & Save" → `PATCH /verify` → navigate back to Supplier Room.
   - "Save as Draft" → navigate back without saving.

**New files:**
- `frontend/src/pages/VerifySupplierPO.jsx` — split-screen Supplier PO verify page

**New DB table (applied via Supabase MCP migration):**
- `style_supplier_rooms` (id, style_number FK→buyer_pos, supplier_id FK→suppliers, created_at, UNIQUE(style_number, supplier_id))

**New API routes:**
- `GET /cases/{style_number}/suppliers/{supplier_id}/pos/{po_id}` — fetch single PO with presigned `document_url`
- `PATCH /cases/{style_number}/suppliers/{supplier_id}/pos/{po_id}/verify` — confirm draft PO

**Next Steps (pick up here in Session 7):**
1. Test full PO upload → verify → confirm flow in the browser.
2. Wire up GRN logging against the now-uploaded POs.
3. Test supplier invoice upload → 3-way match against a real PO.
4. Check `VerifyInvoice.jsx` for the same presigned URL pattern (likely needs `document_url` fix like VerifyCase).
5. Future: outbound invoices + payments for case closure logic.

---

### Session 5 — 2026-05-30

**Status:** Full upload → AI parse → verify flow working end-to-end. 7 bugs debugged and fixed.

**What was done:**

1. **Storage rewrite (boto3 → Supabase REST):** Scrapped boto3 S3-compatible layer (persistent `SignatureDoesNotMatch`). Rewrote `s3_storage.py` to call Supabase Storage REST API directly via `httpx`. Created `documents` bucket in Supabase via SQL. Updated `config.py` to use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `STORAGE_BUCKET` instead of AWS vars.

2. **AI fallback chain (OpenRouter → DeepSeek):** OpenRouter returned 402 (no credits). Added DeepSeek (`api.deepseek.com`) as a direct fallback. DeepSeek is text-only so added `pypdf` for PDF text extraction — `_call_deepseek` extracts text from the PDF before sending. Added `DEEPSEEK_API_KEY` to config and `.env`.

3. **CORS fix:** Vite auto-moved to port 5174 (5173 in use). Backend only allowed 5173. Added 5174 to `allow_origins` in `main.py`.

4. **Upsert on re-upload:** Duplicate key violation when retrying upload of same style. Fixed `create_case` to upsert: update existing draft, 409 on already-verified case.

5. **PDF preview — presigned URL:** `VerifyCase.jsx` was using `draft.file_url` (raw S3 key) as iframe src. Added `document_url` field to `BuyerPOResponse`; `get_case` populates it via `generate_presigned_url`. Updated iframe to use `draft.document_url`.

6. **Vite proxy conflict:** Vite proxy rule `/cases → localhost:8000` was forwarding React Router page navigations to FastAPI (405 Method Not Allowed). Removed proxy entirely — `api/client.js` already calls the backend directly via `baseURL: http://localhost:8000`.

7. **Empty file upload:** `cases.py` called `file.read()` for AI parsing (moves cursor to EOF), then passed the file to `upload_document` which read again and got empty bytes. Fixed by adding `await file.seek(0)` before the read inside `upload_document`.

**Verified working:** Real Buyer PO PDF uploaded → DeepSeek extracted style number, buyer, qty, value, PO details, line items → saved as draft → verify page shows editable form (left) + rendered PDF (right) via Supabase presigned URL.

**New files:**
- `debug-postmortem.md` — full sequential bug trace with root causes and fixes

**Key config changes (`config.py`):**
- Removed: `aws_access_key_id`, `aws_secret_access_key`, `s3_bucket_name`, `aws_region`, `s3_endpoint_url`
- Added: `supabase_url`, `supabase_service_role_key`, `storage_bucket`, `deepseek_api_key`

**Next Steps (pick up here in Session 6):**
1. Test "Confirm & Save" on the verify page → verify navigates to Style Room.
2. Add a supplier, create a Supplier PO, log a GRN, upload a supplier invoice, run 3-way match.
3. Check `VerifyInvoice.jsx` for the same `file_url` / presigned URL issue (likely same fix needed).
4. Check `StyleRoom.jsx` financials cards once at least one verified invoice exists.
5. Future: outbound invoices + payments for revenue side and case closure logic.

---

### Session 4 — 2026-05-29

**Status:** Database tables created in Supabase via direct SQL migration.

**What was done:**
- Connected to Supabase via MCP.
- Applied a single migration (`create_all_tables`) that creates all 5 tables, 3 enum types, all FK constraints, all indexes, and `updated_at` auto-refresh triggers.

**Tables created:**
| Table | Description |
|---|---|
| `buyer_pos` | Root style anchor. Enums: `verificationstatus`, `lifecyclestatus`. |
| `suppliers` | Master supplier registry (id, name, contact_info JSONB). |
| `supplier_pos` | Procurement budgets per style. Enum: `materialcategory`. |
| `grns` | Warehouse arrival ledger (received_date, received_quantity). |
| `supplier_invoices` | Expense register with discrepancy_flags JSONB array. |

**Triggers created:**
- `trg_buyer_pos_updated_at`, `trg_supplier_pos_updated_at`, `trg_supplier_invoices_updated_at` — all fire `BEFORE UPDATE` via shared `update_updated_at_column()` function.

**Note:** Alembic migrations (`alembic upgrade head`) should now be skipped for this deployment — tables already exist in Supabase. If Alembic is run, it will conflict unless the migration is marked as already applied (`alembic stamp head`).

**Next Steps (pick up here in Session 5):**
1. Set `.env` with Supabase `DATABASE_URL` (PostgreSQL connection string from Supabase project settings).
2. Run `python3.12 -m uvicorn main:app --reload` to start the backend.
3. Run `cd frontend && npm run dev` to start the frontend.
4. End-to-end test: upload buyer PO → verify → add supplier → add supplier PO → log GRN → upload invoice → verify → check 3-way match flags.
5. Future: outbound invoices + payments tables for revenue side and case closure logic.

---

### Session 3 — 2026-05-29

**Status:** Full React/Vite frontend built and verified (clean prod build + dev server confirmed).

**What was done:**
- Scaffolded `frontend/` with Vite + React, Tailwind CSS 3, React Router v6, Axios.
- Built all 5 pages:
  - `Dashboard.jsx` — case grid table with status badges + "Initiate a New Case" upload modal
  - `VerifyCase.jsx` — split-screen buyer PO verification (left: form, right: iframe PDF viewer)
  - `StyleRoom.jsx` — style room with 4 stat cards, lifecycle stepper, supplier room list
  - `SupplierRoom.jsx` — PO list + GRN logger + invoice list with discrepancy flags (5-col layout)
  - `VerifyInvoice.jsx` — split-screen invoice verification with PO dropdown + 3-way match trigger
- Built shared components: `StatusBadge`, `DiscrepancyFlags`, `UploadModal` (drag-drop)
- Built `api/client.js` — all API calls wired to `http://localhost:8000`
- Added `.input` Tailwind component class in `index.css`
- Configured Vite proxy: `/cases` → `http://localhost:8000`
- `npm run build` passes with 0 errors. Dev server confirmed serving at localhost:5173.

**Frontend structure:**
```
frontend/src/
├── api/client.js
├── pages/{Dashboard, StyleRoom, VerifyCase, SupplierRoom, VerifyInvoice}.jsx
├── components/{StatusBadge, DiscrepancyFlags, UploadModal}.jsx
├── App.jsx   ← React Router routes
└── index.css ← Tailwind + .input utility
```

**Next Steps (pick up here in Session 4):**
1. Set up `.env` with real credentials and run `alembic upgrade head`.
2. Start both servers: `python3.12 -m uvicorn main:app --reload` + `npm run dev`.
3. End-to-end test: upload a buyer PO → verify → add supplier → add PO → log GRN → upload invoice → verify invoice → check flags.
4. Future: outbound invoices/payments model for revenue side + case closure logic.

---

### Session 2 — 2026-05-29

**Status:** Full backend scaffolded and validated. No frontend yet.

**What was done:**
- Scaffolded `style-tracker-mvp/` directory with all files and folders per PRD Section 6.
- Created `.venv` using Python 3.12 (`python3.12 -m venv .venv`); installed all deps.
- Built `config.py` (pydantic-settings), `database.py` (async SQLAlchemy engine + session factory).
- Built all 4 SQLAlchemy models:
  - `models/style_case.py` → `buyer_pos` table with enums for VerificationStatus, LifecycleStatus
  - `models/supplier_room.py` → `suppliers` + `supplier_pos` tables with MaterialCategory enum
  - `models/procurement.py` → `grns` table
  - `models/accounting.py` → `supplier_invoices` table with discrepancy_flags JSONB
- Built all 4 Pydantic v2 schema files in `schemas/`.
- Built all 3 services:
  - `services/s3_storage.py` → boto3 upload + presigned URL generation
  - `services/openrouter_ai.py` → Claude 3.5 Sonnet primary / GPT-4o failover, base64 image parse
  - `services/matching_engine.py` → 3-way match rules + style financials + closure check
- Built API routes:
  - `api/cases.py` → list/create/get/verify/lifecycle update for buyer POs
  - `api/supplier_rooms.py` → nested routes with context inheritance; GRN, invoice upload & verify
- Wired `main.py` with CORS and lifespan.
- Initialized Alembic with async env.py wired to Base.metadata.
- Full import validation: all modules load with zero errors.

**Current State of Codebase:**
```
style-tracker-mvp/
├── .venv/                   ← Python 3.12 virtualenv
├── main.py                  ← FastAPI app + CORS + router wiring
├── config.py                ← pydantic-settings from .env
├── database.py              ← async engine + get_db dependency
├── requirements.txt
├── alembic.ini
├── alembic/env.py           ← async migration runner
├── models/{style_case, supplier_room, procurement, accounting}.py
├── schemas/{style_case, supplier_room, procurement, accounting}.py
├── services/{s3_storage, openrouter_ai, matching_engine}.py
└── api/{cases, supplier_rooms}.py
```

**Known Gotchas:**
- `.venv/bin/python` symlinks to Python 3.14 (homebrew default); always use `.venv/bin/python3.12`
  or activate with `source .venv/bin/activate` then call `python3.12`.
- Alembic uses `%(DATABASE_URL)s` interpolation — set `DATABASE_URL` in env before running migrations.
- `matching_engine.py::check_closure_eligibility` always returns False until payment tables are added.
- Outbound (buyer) revenue in `compute_style_financials` returns 0 until outbound_invoices model added.

**Next Steps (pick up here in Session 3):**
1. Copy `.env.example` → `.env` and fill in real credentials.
2. Run `alembic revision --autogenerate -m "initial"` → `alembic upgrade head` to create tables.
3. Test API with `uvicorn main:app --reload` (use `python3.12 -m uvicorn main:app --reload`).
4. Build React/Vite frontend:
   - `cd ../ && npm create vite@latest frontend -- --template react` (or in `style-tracker-mvp/frontend/`)
   - Home dashboard (case list grid)
   - Case initiation modal (file upload → POST /cases/)
   - Split-screen verification workspace
   - Style room view with supplier rooms

---

### Session 1 — 2026-05-29

**Status:** Project initialized. No code written yet.

**What was done:**
- User provided `style-tracker-prd.md` — full PRD read and understood.
- Created `CLAUDE.md` with full tech conventions, architectural principles, schema summary, business logic rules, and dev commands.
- Created `history.md` (this file) for cross-session continuity.

**Current State of Codebase:**
- `/Manufacturing-Paper-Trail/` — root working directory
  - `style-tracker-prd.md` — source PRD (do not modify)
  - `CLAUDE.md` — Claude Code operational framework
  - `history.md` — this session log
- No backend or frontend code exists yet.

**Decisions Made:**
- Project directory for actual code will be: `style-tracker-mvp/` (as per PRD Section 6)
- Backend scaffolded first, then frontend.
- AI model for document parsing: OpenRouter → Claude 3.5 Sonnet (primary) / GPT-4o (failover)

**Next Steps (pick up here in Session 2):**
1. Scaffold `style-tracker-mvp/` project directory with all empty files and folders (PRD Step 1).
2. Populate `requirements.txt` with async FastAPI, SQLAlchemy, asyncpg, Pydantic v2, boto3, python-multipart, alembic, httpx dependencies.
3. Build `database.py` with async SQLAlchemy engine pool.
4. Build SQLAlchemy models: `models/style_case.py`, `models/supplier_room.py`, `models/procurement.py`, `models/accounting.py`.
5. Build services: `s3_storage.py`, `openrouter_ai.py`, `matching_engine.py`.
6. Build API routes: `api/cases.py`, `api/supplier_rooms.py`.
7. Wire up `main.py` and validate with Uvicorn.
8. Build React/Vite frontend.

---

## File Map — Current Codebase Navigation

> This section is the authoritative file-level reference. A new session should read this to know exactly which file to open for any change. Keep it updated whenever files are added, renamed, or significantly changed.

All code lives under `style-tracker-mvp/`. Paths below are relative to that root.

---

### Backend

#### `main.py`
- Creates the FastAPI `app` instance with CORS (allows `localhost:5173`) and an async lifespan.
- Mounts `api/cases.py` router at `/cases` and `api/supplier_rooms.py` at `/cases/{style_number}/suppliers`.
- Also has `GET /health`.
- **Edit here when:** adding a new top-level router, changing CORS origins, or adding global middleware.

#### `config.py`
- `Settings` class (pydantic-settings) reads all env vars from `.env`.
- Exports a singleton `settings` object used everywhere.
- Keys: `DATABASE_URL`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET`, `PRESIGNED_URL_EXPIRY`.
- **Edit here when:** adding a new environment variable.

#### `database.py`
- Creates the async SQLAlchemy `engine` (pool_size=10).
- Exports `AsyncSessionLocal`, `Base` (all models inherit from this), and `get_db` (FastAPI dependency).
- **Edit here when:** changing DB pool settings or the session lifecycle.

#### `alembic/env.py`
- Async Alembic runner. Imports `Base` and all models (via `import models`) so autogenerate sees every table.
- **Edit here when:** Alembic migration runs fail or a new model file is added and not being picked up.

---

#### `models/style_case.py`
- **Table:** `buyer_pos`
- **Class:** `BuyerPO`
- **Enums:** `VerificationStatus` (`PENDING_VERIFICATION` / `VERIFIED` / `REJECTED`), `LifecycleStatus` (`INITIATED` / `PRODUCTION_READY` / `SHIPPED` / `CLOSED`)
- Key columns: `style_number` (unique string PK anchor), `buyer_name`, `total_order_quantity`, `total_order_value`, `file_url`, `is_draft`, `verification_status`, `lifecycle_status`, `metadata_` (JSONB).
- **Edit here when:** adding columns to buyer POs, changing lifecycle stages, or adding new verification states.

#### `models/supplier_room.py`
- **Tables:** `suppliers`, `supplier_pos`, `style_supplier_rooms`
- **Classes:** `Supplier` (id, name, contact_info JSONB), `SupplierPO` (style_number FK, supplier_id FK, supplier_po_number unique, material_category, agreed_rate, ordered_quantity, metadata_ JSONB), `StyleSupplierRoom` (style_number FK, supplier_id FK, UNIQUE together)
- **Enum:** `MaterialCategory` (`FABRIC` / `BUTTONS` / `THREAD` / `PACKING` / `LABELS`)
- `SupplierPO.metadata_` stores draft state: `file_url` (Supabase key), `is_draft` (bool), `verification_status`, `hsn_codes` (array), `line_items` (array), `extra_fields`.
- **Edit here when:** adding a material category, adding columns to supplier POs, or adding supplier-level fields.

#### `models/procurement.py`
- **Table:** `grns`
- **Class:** `GRN`
- Key columns: `style_number` FK, `supplier_id` FK, `supplier_po_id` FK, `grn_number` (unique), `received_date`, `received_quantity`, `metadata_` JSONB.
- **Edit here when:** adding GRN fields (e.g., vehicle number, gate entry).

#### `models/accounting.py`
- **Table:** `supplier_invoices`
- **Class:** `SupplierInvoice`
- Key columns: `style_number` FK, `supplier_id` FK, `supplier_po_id` FK, `invoice_number`, `taxable_value`, `invoice_rate`, `invoice_quantity`, `is_discrepancy` (bool), `discrepancy_flags` (JSONB array of strings), `file_url`, `is_draft`, `verification_status`, `metadata_` JSONB.
- **Edit here when:** adding invoice fields, changing how discrepancy flags are stored, adding outbound invoice support.

---

#### `schemas/style_case.py`
- `BuyerPOCreate` — POST body for new case
- `BuyerPOVerify` — PATCH body for the verify endpoint (all fields optional)
- `BuyerPOResponse` — full API response shape; includes `document_url: str | None` (presigned URL, set by API layer, not an ORM column)
- `BuyerPOListItem` — slimmed response for dashboard list
- `StyleFinancials` — response for `/financials` endpoint
- **Edit here when:** changing what the API accepts or returns for buyer POs.

#### `schemas/supplier_room.py`
- `SupplierCreate`, `SupplierResponse`
- `SupplierPOCreate` — manual JSON body (retained for programmatic use)
- `SupplierPOVerify` — PATCH body for verify endpoint (all fields optional)
- `SupplierPOResponse` — includes `document_url: str | None` (presigned URL, populated by API layer)
- **Edit here when:** changing supplier or supplier PO API shape.

#### `schemas/procurement.py`
- `GRNCreate`, `GRNResponse`
- **Edit here when:** changing the GRN API shape.

#### `schemas/accounting.py`
- `SupplierInvoiceVerify` — PATCH body for invoice verification (all fields optional)
- `SupplierInvoiceResponse` — full invoice API response
- **Edit here when:** changing what the invoice verify endpoint accepts or returns.

---

#### `services/s3_storage.py`
- `upload_document(file, folder)` → uploads `UploadFile` to Supabase Storage via REST API (`POST /storage/v1/object/{bucket}/{key}`), returns the object key (string). Seeks file to start before reading.
- `generate_presigned_url(key)` → calls `POST /storage/v1/object/sign/{bucket}/{key}` with `{"expiresIn": 900}`, returns full signed URL.
- Uses `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET` from config. No boto3.
- **Edit here when:** changing bucket, folder structure, presigned URL expiry, or adding multi-file support.

#### `services/openrouter_ai.py`
- `_call_openrouter(file_bytes, mime_type, prompt)` → sends base64 image_url message to OpenRouter with the given prompt (default: `DOCUMENT_PARSE_PROMPT`).
- `_call_deepseek(file_bytes, mime_type, prompt)` → extracts PDF text via `pypdf.PdfReader`, sends text-only message to `api.deepseek.com`. Prompt param allows per-document-type targeting.
- `parse_document(file_bytes, mime_type)` → general document parser (buyer POs, invoices). OpenRouter → DeepSeek.
- `parse_supplier_po(file_bytes, mime_type)` → Supplier PO-specific parser using `SUPPLIER_PO_PARSE_PROMPT`. Extracts: supplier_name, po_number, material_category, hsn_codes[], line_items[], agreed_rate, total_quantity, total_value, payment_terms. OpenRouter → DeepSeek.
- `parse_grn(file_bytes, mime_type)` → GRN/challan-specific parser using `GRN_PARSE_PROMPT`. Extracts: challan_no, challan_date, vehicle_no, supplier_name, grn_number, line_items[] (item_name, incoming_qty as number, uom). OpenRouter → DeepSeek.
- **Edit here when:** changing models, adding a new document type prompt, or changing the fallback chain.

#### `services/matching_engine.py`
- `run_three_way_match(db, invoice, supplier_po)` → queries cumulative GRN qty, compares against invoice rate/qty/PO agreed rate, returns list of flag strings (`[RATE_MISMATCH]`, `[BILLING_MISMATCH]`, `[EXCESS_DELIVERY]`).
- `compute_style_financials(db, style_number)` → sums VERIFIED supplier invoice taxable values as expenses; revenue side returns 0 until outbound invoices table exists.
- `check_closure_eligibility(db, style_number)` → always returns `False` until payment tables are added.
- **Edit here when:** changing 3-way match rules, adding new flag types, wiring in outbound invoice revenue, or implementing case closure logic.

---

#### `api/cases.py`
- **Routes** (all under `/cases`):
  - `GET /` → `list_cases` — dashboard list
  - `POST /` → `create_case` — upload file, AI parse, save as draft, redirect to verify
  - `GET /{style_number}` → `get_case`
  - `GET /{style_number}/financials` → `get_financials`
  - `PATCH /{style_number}/verify` → `verify_case` — sets `is_draft=False`, `verification_status=VERIFIED`
  - `PATCH /{style_number}/lifecycle` → `update_lifecycle` (blocks CLOSED — use a dedicated /close endpoint)
- Helper `_get_or_404` used internally.
- **Edit here when:** adding buyer PO routes, changing verification logic, adding the `/close` endpoint.

#### `api/supplier_rooms.py`
- **Routes** (all under `/cases/{style_number}/suppliers`):
  - `POST /` → `create_supplier` — get-or-create global Supplier + upsert `StyleSupplierRoom` link
  - `GET /` → `list_suppliers` — joins via `style_supplier_rooms`
  - `POST /{supplier_id}/pos` → `create_supplier_po` — accepts `UploadFile`, uploads to `supplier_pos/` bucket, calls `parse_supplier_po()`, saves draft SupplierPO
  - `GET /{supplier_id}/pos` → `list_supplier_pos`
  - `GET /{supplier_id}/pos/{po_id}` → `get_supplier_po` — returns single PO with `document_url`
  - `PATCH /{supplier_id}/pos/{po_id}/verify` → `verify_supplier_po`
  - `POST /{supplier_id}/pos/{po_id}/grns/upload` → `upload_grn` — UploadFile, calls `parse_grn()`, writes line_items[] atomically to JSONB, computes received_quantity = Σ(incoming_qty)
  - `GET /{supplier_id}/pos/{po_id}/grns` → `list_grns`
  - `GET /{supplier_id}/pos/{po_id}/grns/{grn_id}` → `get_grn` — returns single GRN with `document_url`
  - `PATCH /{supplier_id}/pos/{po_id}/grns/{grn_id}/verify` → `verify_grn` — updates header + line_items in JSONB, recomputes received_quantity, marks VERIFIED
  - `POST /{supplier_id}/pos/{po_id}/grns` → `create_grn` — manual JSON body (retained)
  - `POST /{supplier_id}/invoices/upload` → `upload_supplier_invoice`
  - `PATCH /{supplier_id}/invoices/{invoice_id}/verify` → `verify_supplier_invoice` — triggers `run_three_way_match`
  - `GET /{supplier_id}/invoices` → `list_invoices`
  - `GET /{supplier_id}/invoices/{invoice_id}` → `get_invoice` — returns single invoice with `document_url`
- Helpers: `_require_case`, `_require_supplier`, `_require_supplier_po`, `_require_grn`, `_require_invoice`, `_parse_material_category`.
- **Edit here when:** adding GRN editing, invoice deletion, outbound payments, or changing context inheritance logic.

---

### Frontend

All frontend code lives under `frontend/src/`. Dev server: `localhost:5173`. API calls proxy to `localhost:8000`.

#### `api/client.js`
- Axios instance with `baseURL: http://localhost:8000`.
- Exports one named function per API endpoint: `listCases`, `getCase`, `createCase`, `verifyCase`, `getFinancials`, `updateLifecycle`, `listSuppliers`, `createSupplier`, `listSupplierPOs`, `uploadSupplierPO`, `getSupplierPO`, `verifySupplierPO`, `listGRNs`, `uploadGRN`, `getGRN`, `verifyGRN`, `createGRN`, `listInvoices`, `getSupplierInvoice`, `uploadInvoice`, `verifyInvoice`.
- **Edit here when:** adding a new API call, changing base URL, or adding auth headers.

#### `App.jsx`
- React Router v6 `<Routes>` config. Seven routes:
  - `/` → `Dashboard`
  - `/cases/:styleNumber` → `StyleRoom`
  - `/cases/:styleNumber/verify` → `VerifyCase`
  - `/cases/:styleNumber/suppliers/:supplierId` → `SupplierRoom`
  - `/cases/:styleNumber/suppliers/:supplierId/pos/:poId/verify` → `VerifySupplierPO`
  - `/cases/:styleNumber/suppliers/:supplierId/pos/:poId/grns/:grnId/verify` → `VerifyGRN`
  - `/cases/:styleNumber/suppliers/:supplierId/invoices/:invoiceId/verify` → `VerifyInvoice`
- **Edit here when:** adding a new page or changing a URL pattern.

#### `pages/Dashboard.jsx`
- Home screen. Fetches `listCases()` on mount. Renders a table with style number, buyer, qty, value, lifecycle badge, verification badge.
- "Initiate a New Case" button opens `UploadModal` → calls `createCase(file)` → navigates to `/cases/:styleNumber/verify`.
- **Edit here when:** changing the home table columns, adding search/filter, or changing the case initiation flow.

#### `pages/VerifyCase.jsx`
- Split-screen layout. Left half: editable form pre-populated from the draft `BuyerPO`. Right half: `<iframe>` rendering `file_url` (S3 presigned URL).
- "Confirm & Save" calls `verifyCase()` then navigates to `StyleRoom`.
- "Save as Draft" navigates away without saving.
- **Edit here when:** adding fields to the buyer PO verification form or changing the confirm flow.

#### `pages/StyleRoom.jsx`
- Master style room. Loads `getCase`, `getFinancials`, `listSuppliers` in parallel.
- Shows 4 stat cards (order qty, order value, live expenses, net profit %).
- Lifecycle stepper (visual progress bar across 4 stages).
- Supplier room list with "+ Add Supplier Room" inline form.
- **Edit here when:** adding more stat cards, wiring lifecycle advancement buttons, adding outbound invoice section, or adding the case closure UI.

#### `pages/SupplierRoom.jsx`
- 5-column grid layout: left 2 cols = PO list; right 3 cols = GRN table + invoice table.
- "+ Upload PO" button → `UploadModal` → `uploadSupplierPO()` → navigates to `VerifySupplierPO`. Eye + edit icons on each PO row.
- Selecting a PO shows its GRNs with a running total row. "+ Upload GRN" button → `UploadModal` → `uploadGRN()` → navigates to `VerifyGRN`. Edit icon on each GRN row.
- "Upload Supplier Bill" → `uploadInvoice()` → navigates to `VerifyInvoice`. Eye icon on each invoice row opens `DocumentPanel`.
- Contains `DocumentPanel` for PDF side-panel viewing of POs and invoices.
- **Edit here when:** adding PO editing, GRN flow changes, invoice deletion, or showing cumulative match status per PO.

#### `pages/VerifySupplierPO.jsx`
- Split-screen layout for reviewing AI-extracted Supplier PO data.
- Left: editable form (supplier name, PO#, material category dropdown, agreed rate, ordered qty) + HSN code badge row + line items table + extra metadata cards.
- Right: `<iframe>` rendering `document_url` (Supabase presigned URL from `get_supplier_po`).
- "Confirm & Save" calls `verifySupplierPO()` → marks `is_draft=False`, `verification_status=VERIFIED` in JSONB → navigates to SupplierRoom.
- **Edit here when:** adding more PO fields, changing line item display, or updating the confirm flow.

#### `pages/VerifyGRN.jsx`
- Split-screen GRN verify page.
- Left: 2-column header form (GRN#, challan#, challan date, vehicle no, supplier name) + editable line-items grid (item name / incoming qty / UOM dropdown / delete row) + live total qty row + "+ Add Row" button.
- Right: `<iframe>` via `document_url` presigned URL from `get_grn`.
- "Confirm & Save GRN" (draft) / "Update GRN" (already verified) — mode-aware button label.
- On confirm: calls `verifyGRN()` → `PATCH .../verify`, then navigates back to SupplierRoom.
- **Edit here when:** adding more GRN header fields, changing UOM options, or adding batch-GRN support.

#### `pages/VerifyInvoice.jsx`
- Split-screen layout. Left: invoice form with fields for invoice number, linked PO (dropdown from `listSupplierPOs`), invoice rate, qty, taxable value. Right: `<iframe>` of invoice file.
- "Confirm & Run 3-Way Match" calls `verifyInvoice()` → backend runs match engine → flags written back.
- After save, navigates back to `SupplierRoom`.
- **Edit here when:** adding more invoice fields, changing the PO linking UX, or displaying match results inline after confirm.

#### `components/StatusBadge.jsx`
- `LifecycleBadge` — colored pill for `INITIATED / PRODUCTION_READY / SHIPPED / CLOSED`.
- `VerificationBadge` — colored pill for `PENDING_VERIFICATION / VERIFIED / REJECTED`.
- **Edit here when:** adding new statuses or changing badge colors.

#### `components/DiscrepancyFlags.jsx`
- Renders `[RATE_MISMATCH]` (red), `[BILLING_MISMATCH]` (red), `[EXCESS_DELIVERY]` (yellow) as monospace pill badges.
- **Edit here when:** adding new flag types from the matching engine.

#### `components/DocumentPanel.jsx`
- Fixed-right slide-in drawer component for viewing PDFs/images inline without leaving the current page.
- Props: `isOpen`, `onClose`, `url` (presigned URL), `title`, `loading`.
- Backdrop click closes the panel. Fetches a fresh presigned URL each time it opens (caller is responsible for the fetch function).
- Used in `StyleRoom.jsx` (buyer PO) and `SupplierRoom.jsx` (supplier POs + invoices).
- **Edit here when:** changing panel width, adding zoom controls, or adding a download button.

#### `components/UploadModal.jsx`
- Drag-and-drop file upload modal. Accepts PDF, PNG, JPG, Excel.
- Props: `title`, `description`, `onUpload(file)`, `onClose`, `loading`.
- **Edit here when:** changing accepted file types, adding a progress bar, or adding multi-file support.

#### `index.css`
- Tailwind directives + one component class: `.input` (standard form input styling).
- **Edit here when:** adding global styles or new Tailwind component utility classes.

---

## Running Glossary

| Term | Meaning |
|---|---|
| Style Number | Primary anchor key linking all data (e.g., `SS26_ZRA_PRT_BOXYF_NW_2`) |
| Buyer PO | The root case record — master contract from the buyer |
| Supplier PO | Procurement budget raised for a vendor for a specific style |
| GRN | Goods Received Note — warehouse log when materials arrive |
| Supplier Invoice | Inbound bill from a vendor, matched against PO + GRNs |
| Outbound Tax Invoice | GST invoice issued to the buyer (revenue side) |
| 3-Way Match | PO agreed rate × GRN cumulative qty vs. supplier invoice |
| Split-Screen | Verification UI: raw document (right) vs. editable form (left) |
| Draft Row | AI-parsed record saved with `is_draft=true` pending human review |
| Context Inheritance | Auto-tagging `style_number` + `supplier_id` from URL context |

---

## Architecture Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-05-29 | Hybrid Relational-Document schema (JSONB for variable fields) | Vendors present unpredictable custom fields on their documents |
| 2026-05-29 | Soft discrepancy flags, never hard blocks on GRN saves | Warehouse operations cannot be halted; managers review flags |
| 2026-05-29 | Draft-first AI writes | Prevents bad AI parses from polluting live financial data |
| 2026-05-29 | Context inheritance via URL params | Local vendors don't reference internal style codes on their bills |

---

## Known Constraints & Gotchas

- `style_number` is a **string** unique index, not an integer PK — all FKs reference this string directly.
- `grns` and `supplier_invoices` both carry a `supplier_id` FK — a `suppliers` master table will likely need to be added (not explicitly in PRD schema but implied by FK references).
- Presigned URLs expire in 15 minutes — frontend must request a fresh URL if the user is idle too long.
- `lifecycle_status = CLOSED` is gated by two zero-balance conditions — enforce this as a backend guard, not just frontend UI.

---

*Append a new dated section at the top of the Session Log for each new working session.*
