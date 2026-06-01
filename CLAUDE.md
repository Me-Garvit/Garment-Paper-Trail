# Style-Anchored Garment Management App - Tech Conventions

## Session Continuity Rule
After every session in which you add, rename, move, or delete any file or folder, or change what a file does, you **must** update `history.md` before finishing:
- Append a new dated entry to the Session Log.
- Update the File Map so it matches the current codebase exactly.

This is not optional. The File Map in `history.md` is the navigation contract for every future session and model.

## Project Overview
A unified, automated garment manufacturing operational tracking platform. All data is anchored by a garment's unique **Style Number**. Replaces fragmented ERP modules with a Single Closed Case Ecosystem.

## Tech Stack
- **Frontend:** React.js (Vite) + Tailwind CSS
- **Backend:** Python 3.11+ using FastAPI
- **Database:** PostgreSQL (SQLAlchemy Async ORM + Alembic for migrations)
- **Dynamic Fields:** PostgreSQL `JSONB` columns for all flexible metadata fields
- **AI Parser:** OpenRouter API (Claude 3.5 Sonnet primary / GPT-4o failover)
- **Storage:** Amazon S3 (or S3-compatible Spaces) via boto3
- **Validation:** Pydantic v2

## Project Structure
```
style-tracker-mvp/
├── CLAUDE.md
├── main.py
├── requirements.txt
├── config.py
├── database.py
├── alembic/
├── models/
│   ├── style_case.py       # buyer_pos table
│   ├── supplier_room.py    # supplier_pos table
│   ├── procurement.py      # grns table
│   └── accounting.py       # supplier_invoices table
├── schemas/                # Pydantic v2 request/response models
├── services/
│   ├── s3_storage.py       # boto3 upload + presigned URL generation
│   ├── openrouter_ai.py    # AI document parsing via OpenRouter
│   └── matching_engine.py  # 3-Way Match rules + profit engine
└── api/
    ├── cases.py            # Home dashboard + case creation routes
    └── supplier_rooms.py   # Nested supplier routes with context inheritance
```

## Architectural Principles
1. **THE STYLE ANCHOR:** Every database table (except pure master configs) MUST include an indexed `style_number` column matching `buyer_pos.style_number`.
2. **NESTING HIERARCHY:** Cases contain Master Style rooms. Style rooms contain Supplier rooms. Supplier rooms house POs, GRNs, Invoices, and Payments.
3. **CONTEXT INHERITANCE:** Endpoint logic must support inheritance. Uploading an invoice inside a specific style/supplier route auto-assigns those foreign keys before AI parsing begins.
4. **DRAFT-FIRST WRITES:** All AI-parsed documents are saved with `is_draft=True` and `verification_status='PENDING_VERIFICATION'`. Only confirmed by human review.
5. **SOFT DISCREPANCY FLAGS:** Never block warehouse saves. Overages trigger soft flags (`[EXCESS_DELIVERY]`, `[RATE_MISMATCH]`, `[BILLING_MISMATCH]`) on the style dashboard instead.

## Database Schema Summary

### `buyer_pos` (Root Case Table)
- `id`, `style_number` (Unique Index — PRIMARY ANCHOR), `buyer_name`
- `total_order_quantity`, `total_order_value`, `file_url`
- `is_draft` (default: true), `verification_status` (PENDING_VERIFICATION / VERIFIED / REJECTED)
- `lifecycle_status` (INITIATED / PRODUCTION_READY / SHIPPED / CLOSED)
- `metadata` JSONB — size breakdowns, payment terms, seasons, genders

### `supplier_pos` (Procurement Budget)
- `id`, `style_number` FK, `supplier_name`, `supplier_po_number` (Unique)
- `material_category` Enum (FABRIC / BUTTONS / THREAD / PACKING / LABELS)
- `metadata` JSONB

### `grns` (Warehouse Arrival Ledger)
- `id`, `style_number` FK, `supplier_id` FK, `supplier_po_id` FK
- `grn_number` (Unique), `received_date`, `metadata` JSONB

### `supplier_invoices` (Expense Register)
- `id`, `style_number` FK, `supplier_id` FK, `supplier_po_id` FK
- `invoice_number`, `taxable_value`, `is_discrepancy` (default: false)
- `file_url`, `is_draft` (default: true), `metadata` JSONB

## Business Logic Rules

### 3-Way Match Engine
- `Expected Invoice Cost = Supplier PO Agreed Rate × Σ(All Associated GRN Quantities)`
- If `invoice_rate > po_agreed_rate` → flag `[RATE_MISMATCH]`
- If `invoice_quantity > Σ(GRN quantities)` → flag `[BILLING_MISMATCH]`
- If `Σ(GRN quantities) > po_ordered_quantity` → flag `[EXCESS_DELIVERY]` (soft, non-blocking)

### Profitability Engine (triggered on Style Room view)
- `Live Revenue = Σ(taxable_value of VERIFIED outbound tax invoices)`
- `Live Expenses = Σ(taxable_value of VERIFIED supplier invoices)`
- `Net Profit Margin % = (Revenue - Expenses) / Revenue × 100`

### Case Closure
- `lifecycle_status = CLOSED` only when:
  - `Σ(outbound invoices) - Σ(buyer receipts) = 0`
  - `Σ(supplier invoices) - Σ(outbound payments) = 0`

## Dev Commands
- Run Dev Server: `uvicorn main:app --reload`
- Database Migration: `alembic revision --autogenerate -m "message"` → `alembic upgrade head`
- Install deps: `pip install -r requirements.txt`
- Frontend dev: `cd frontend && npm run dev`

## Key Config Variables (set in .env)
- `DATABASE_URL` — async PostgreSQL connection string
- `OPENROUTER_API_KEY` — for AI document parsing
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `AWS_REGION`
- `PRESIGNED_URL_EXPIRY` — default 900 (15 minutes)
