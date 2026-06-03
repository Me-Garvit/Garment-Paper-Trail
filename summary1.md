# Manufacturing Paper Trail — Build Summary (Sessions 1–10)

**Project:** Style-Anchored Garment Manufacturing Operational Tracking Platform  
**Stack:** FastAPI + PostgreSQL (Supabase) + React/Vite + Tailwind CSS  
**AI Parsing:** OpenRouter (Claude 3.5 Sonnet) → DeepSeek fallback  
**Storage:** Supabase REST API via httpx (no boto3)

---

## What Was Built

### Foundation (Sessions 1–2)
- Full project spec defined in `CLAUDE.md` and `history.md` (cross-session continuity contract).
- Complete FastAPI backend scaffolded: 4 SQLAlchemy models, 4 Pydantic v2 schema files, 3 services, 2 API routers, async SQLAlchemy engine, Alembic migrations.
- Core architecture: every table anchored by `style_number` string key; flexible fields stored in PostgreSQL JSONB `metadata_` columns; AI parses documents as drafts pending human review.

### Database & Storage (Sessions 3–5)
- All 5 tables created in Supabase via direct SQL (bypassing Alembic for this deployment): `buyer_pos`, `suppliers`, `supplier_pos`, `grns`, `supplier_invoices`, plus `style_supplier_rooms` junction.
- Storage layer rewritten from boto3 (broken `SignatureDoesNotMatch`) to **Supabase REST API via httpx** — all file uploads and presigned URL generation use this engine exclusively.
- AI fallback chain: OpenRouter (402 on credits) → DeepSeek with `pypdf` text extraction for PDFs.
- Full React/Vite frontend built: 5 pages, 4 shared components, React Router v6, Axios.
- 7 production bugs fixed in Session 5 (CORS port drift, empty file re-read, Vite proxy conflict, presigned URL fix for iframes, duplicate key on re-upload).

### Supplier Room & PO Workflow (Session 6)
- Supplier creation fixed (get-or-create + `style_supplier_rooms` junction table).
- Supplier PO upload → AI parse → split-screen verify flow built end-to-end.
- `SUPPLIER_PO_PARSE_PROMPT` targets: supplier name, PO#, material category, HSN codes, line items (name/HSN/qty/rate/UOM), agreed rate, payment terms.
- `VerifySupplierPO.jsx`: editable form + HSN badge row + line items table + PDF iframe.

### Document Viewer & GRN Framework (Session 7)
- Universal `DocumentPanel.jsx` slide-in drawer for inline PDF viewing without page navigation.
- GRN ingestion rebuilt: `GRN_PARSE_PROMPT` extracts challan header + `line_items[]` (item name, qty, UOM). `parse_grn()` added to AI service.
- `VerifyGRN.jsx`: split-screen verify with editable line-items grid, live total qty, UOM dropdown.
- Single invoice GET endpoint added; presigned URL fix applied to invoice viewer.

### 3-Stream GRN Subsystem (Sessions 8–9)
- **Single-upload flow**: one Supplier Delivery Challan PDF drives the entire GRN workflow — no separate gate count file required.
- AI extracts `expected_challan_qty` per line item at upload time; operator enters physical gate counts in the verify UI.
- **3-stream reconciliation engine** in `verify_grn`: `variance = actual − expected`; items with `variance < 0` trigger automatic `debit_note_draft` construction in JSONB.
- **Financial penalty engine**: `penalty_amount = shortage_qty × agreed_rate` per shortage item; `agreed_rate` inherited from Supplier PO at ingest time (no second DB lookup at verify time).
- **Debit Note Summary card** in `SupplierRoom.jsx`: per-item penalty breakdown, total ₹ penalty, editable justification textarea pre-populated with auto-generated text.
- Commit button: `"Log GRN & Create Debit Note"` (red) on shortages / `"Log GRN"` (indigo) when clean.
- Default gate count = challan expected qty (rapid-entry pattern — operator only corrects actual shortages).

### Buyer PO Enrichment (Session 10)
- **Sub-buyer tracking**: AI extracts `sub_buyer_name` (third-party brand/buying agent) from Buyer POs; stored in `metadata_` JSONB. Displayed as `"via <name>"` sub-text in Dashboard buyer column and as a detail row in StyleRoom.
- **Size-wise quantity breakdown**: AI extracts `size_breakdown: { "S": 150, "M": 300, ... }` from any size grid or colour-size matrix; aggregates across colours automatically. `total_quantity` auto-derived from `sum(size_breakdown.values())` when no explicit total is printed.
- `VerifyCase.jsx` updated: sub-buyer input field, dynamic size table (editable per-size inputs + % share + live rolling total footer), "+ Add Size" / per-row delete for manual edits. Total Qty field locks read-only when a breakdown is present.
- `StyleRoom.jsx` updated: `SizeBreakdownCard` with proportional bar chart per size, % share, and formatted total. PO details and size card sit in a 2-column grid.
- `BuyerPOListItem` schema extended with `metadata_` so Dashboard receives sub-buyer data in the list response (no per-case extra fetch).
- Metadata merge on verify (`{**existing, **patch}` instead of replace) preserves fields not touched by the form.

---

## Current Architecture State

### Backend files and their roles
| File | Role |
|---|---|
| `main.py` | FastAPI app, CORS, router mounts |
| `config.py` | Env vars via pydantic-settings |
| `database.py` | Async SQLAlchemy engine, `get_db` dependency |
| `models/style_case.py` | `buyer_pos` table — root style anchor |
| `models/supplier_room.py` | `suppliers`, `supplier_pos`, `style_supplier_rooms` |
| `models/procurement.py` | `grns` table |
| `models/accounting.py` | `supplier_invoices` table |
| `schemas/style_case.py` | BuyerPO request/response shapes; `BuyerPOListItem` includes `metadata_` |
| `schemas/procurement.py` | GRN shapes; `GRNVerify` includes `justification` field |
| `services/s3_storage.py` | Supabase REST upload + presigned URL generation |
| `services/openrouter_ai.py` | `DOCUMENT_PARSE_PROMPT` (sub_buyer, size_breakdown), `SUPPLIER_PO_PARSE_PROMPT`, `GRN_PARSE_PROMPT`; OpenRouter→DeepSeek fallback |
| `services/matching_engine.py` | 3-way match, style financials, closure eligibility |
| `api/cases.py` | Buyer PO CRUD; size_breakdown fallback for total_qty; metadata merge on verify |
| `api/supplier_rooms.py` | Supplier, PO, GRN, Invoice routes; 3-stream reconciliation engine |

### Frontend pages and their roles
| File | Role |
|---|---|
| `pages/Dashboard.jsx` | Case grid; buyer column shows sub-buyer tag |
| `pages/VerifyCase.jsx` | Split-screen PO verify; sub-buyer input; size breakdown table with live total |
| `pages/StyleRoom.jsx` | Stats, lifecycle stepper, size breakdown card, supplier list |
| `pages/SupplierRoom.jsx` | PO list, GRN table (single-upload challan flow + debit note), invoices |
| `pages/VerifySupplierPO.jsx` | Split-screen supplier PO verify |
| `pages/VerifyGRN.jsx` | Split-screen GRN verify (legacy route) |
| `pages/VerifyInvoice.jsx` | Split-screen invoice verify + 3-way match trigger |
| `components/DocumentPanel.jsx` | Slide-in PDF drawer |
| `components/UploadModal.jsx` | Drag-drop file upload modal |
| `components/StatusBadge.jsx` | Lifecycle + Verification badge pills |
| `components/DiscrepancyFlags.jsx` | 3-way match flag badges |

---

## Key Architectural Decisions

| Decision | Reason |
|---|---|
| JSONB `metadata_` for flexible fields | Vendor documents have unpredictable custom fields |
| Soft discrepancy flags, never hard blocks | Warehouse ops cannot be halted; managers review async |
| Draft-first AI writes (`is_draft=true`) | Prevents bad parses from entering live financial data |
| Context inheritance from URL params | Vendors don't print internal style numbers on their bills |
| Supabase REST over boto3 | boto3 S3-compatible layer had persistent `SignatureDoesNotMatch` failures |
| OpenRouter → DeepSeek fallback | OpenRouter credits can be exhausted; DeepSeek handles text-only via pypdf |
| `agreed_rate` embedded in GRN line items at ingest | Avoids second DB round-trip during penalty computation at verify time |
| Metadata merge (not replace) on verify | Re-verifying a case must not erase AI-extracted fields not shown in the form |

---

## Open Items for Next Sessions
1. End-to-end test of GRN 3-stream flow with a real challan PDF.
2. Wire SHORTAGE badge in GRN list to expand/display saved `debit_note_draft` detail.
3. `VerifyGRN.jsx` needs update to display `expected_challan_qty`/`actual_received_qty` columns (currently shows legacy `incoming_qty`).
4. Outbound tax invoices + buyer payments tables for revenue side and case closure logic.
5. `lifecycle_status = CLOSED` gate needs a dedicated `/close` endpoint enforcing zero-balance conditions.
