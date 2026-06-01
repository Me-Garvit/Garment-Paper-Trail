# Style-Anchored Integrated Garment Tracking System (MVP)
### Product Requirement Document (PRD)

---

## Table of Contents

1. [Executive Summary & Vision](#1-executive-summary--vision)
2. [Epics & Detailed User Workflows](#2-epics--detailed-user-workflows)
3. [Tech Stack & Infrastructure](#3-tech-stack--infrastructure)
4. [Database Schema Blueprint & Core Data Rules](#4-database-schema-blueprint--core-data-rules)
5. [Analytical Computation & Core Engine Logic](#5-analytical-computation--core-engine-logic)
6. [Claude Code Orchestration & Implementation Instructions](#6-claude-code-orchestration--implementation-instructions)

---

## 1. Executive Summary & Vision

### 1.1 Objective

The purpose of this software is to provide a **unified, automated, thread-based garment manufacturing operational tracking platform**. Traditional ERP systems fracture data across disconnected accounting, warehouse, and merchandising modules. This application replaces those fragmented modules with a **Single Closed Case Ecosystem** anchored strictly by a garment's unique **Style Number**.

### 1.2 Core Business Value

- **Prevents Margin Leakage:** Automates a 3-Way Verification Match (Supplier PO vs. Goods Received Notes vs. Incoming Supplier Invoice) to catch vendor overcharges, excessive material deliveries, or price inflation.

- **Eliminates Manual Data Entry Fatigue:** Ingests complex financial and manufacturing paperwork (Buyer POs, Supplier Bills, and Outbound GST Invoices) via multi-modal AI parsing, transforming documents into database records in seconds.

- **Granular Profitability Diagnostics:** Restructures the financial reporting layout into nested "Supplier Rooms" inside the Master Style Suite, allowing management to see instantly if a style is losing money due to a specific vendor overcharge.

---

## 2. Epics & Detailed User Workflows

### Epic 1: Main Landing Dashboard & Case Initiation

**User Flow 1.1 — Home Screen Dashboard**

When a user logs into the system, they are presented with a clean, scannable data grid displaying all active business cases.

| Column | Description |
|---|---|
| Master Style Number | Unique anchor identifier |
| Buyer Name | Associated buyer entity |
| Total Ordered Pieces | Aggregate order quantity |
| Live Net Profit Margin (%) | Real-time calculated margin |
| Total Outstanding Collection Amount | Unpaid receivables |
| Lifecycle Status | Current pipeline stage |

**User Flow 1.2 — Case Initiation Gate**

The home screen features a primary action button labeled **"Initiate a New Case"**. Clicking this action launches a file upload modal. The user drops the initial master contract document (e.g., the buyer's Factory Purchase Order PDF or Excel). This action initializes the entire tracking case down the logical pipeline.

---

### Epic 2: The Multi-Modal AI Ingestion Engine & Staging Pipeline

**User Flow 2.1 — Asynchronous Document Processing**

When any document is uploaded, the backend executes an asynchronous background worker:

1. The physical file is instantly written to a private cloud folder in an **Amazon S3 Bucket**.
2. The application backend generates a secure, temporary, expiring **Presigned URL** (valid for 15 minutes) for frontend viewing.
3. The file stream is passed through the **OpenRouter API** to a top-tier multi-modal model (*Claude 3.5 Sonnet* as primary; *GPT-4o* as an automated infrastructure failover fallback).
4. The AI parses the tabular text grids contextually and transforms them into a structured JSON database payload.
5. The backend writes this payload to the database with safety flags set to `is_draft = true` and `verification_status = 'PENDING_VERIFICATION'`.

**User Flow 2.2 — The Split-Screen Verification Workspace**

Once the draft row is saved, the user is redirected to a side-by-side split screen window:

- **Right-Half Viewport:** Displays the raw, original document PDF natively using the browser's built-in engine via the secure S3 Presigned URL. The user has full native pan, scroll, and pinch-to-zoom capabilities.
- **Left-Half Viewport:** Displays standard editable text and numeric form fields pre-populated directly from the data saved in the database draft row.

**The Commit Action:** The user reviews the fields visually against the raw paper. If the AI misread a character due to poor document resolution, the user manually types the correction. Once satisfied, the user clicks **"Confirm & Save"**. The system executes an `UPDATE` query, shifts `is_draft = false`, sets `verification_status = 'VERIFIED'`, and recalculates the live style financial statistics.

---

### Epic 3: The Nested UI Room Architecture & Contextual Inheritance

**User Flow 3.1 — The Master Style Suite**

Selecting an active case from the home screen drops the user into a specific **Master Style Room** defined completely by that Style Number (e.g., `SS26_ZRA_PRT_BOXYF_NW_2`). This room isolates all customer-centric actions:

- Buyer PO details
- Proforma Invoices (PI)
- Packing Lists
- Outbound GST Tax Invoices (e.g., Invoice No. 41)
- Incoming buyer payment advice sheets

**User Flow 3.2 — The Nested Supplier Rooms**

Within the style suite, an internal navigation section opens the **"Procurement Zone."** This zone splits into independent sub-rooms categorized by vendor entity (e.g., *Khanna Fabrics Room*, *Apex Trims Room*). Each room encapsulates all outbound procurement workflows, supplier POs, gate notes, and bills specific to that vendor for this garment style only.

**User Flow 3.3 — Contextual Inheritance Loop**

Local raw material vendors rarely reference your internal style tracking codes on their bills. To handle this loophole without manual searching, UI context overrides document ambiguity:

> If a user is physically navigating inside the **Khanna Fabrics Room** under **Style Suite X** and clicks **"Upload Supplier Bill,"** the system instantly prepends `style_number = "Style X"` and `supplier_id = "Khanna Fabrics"` to the database staging row before sending the file to the AI.

The left-half split-screen verification form then renders a targeted dropdown list populated only with open Supplier PO numbers created for Khanna Fabrics under this specific style. The user links the bill to the correct PO with a single click.

---

### Epic 4: The Procurement Protection Shield (3-Way Match Rules)

**User Flow 4.1 — Multi-GRN Tracking**

Procurement teams raise a Supplier PO defining the raw material budget (agreed item descriptions, quantities, and rates). When delivery trucks arrive at the factory gate, warehouse personnel log individual **Goods Received Notes (GRNs)** against that Supplier PO. The system allows infinite partial GRNs to track fragmented materials landing over time.

**User Flow 4.2 — Low-Strictness Quantity Guardrail**

The backend maintains a running cumulative tally of all received quantities across all GRNs for an individual item. If an arriving delivery pushes the cumulative total past the original quantity ordered in the Supplier PO, the system must **not** block the warehouse user from saving the entry. Instead, it triggers a soft `[EXCESS_DELIVERY]` discrepancy tag on the style dashboard.

**User Flow 4.3 — The 3-Way Invoicing Verification Match**

When a vendor invoice is uploaded and confirmed in the split-screen layout, the 3-way matching rules engine runs an automated programmatic query:

$$\text{Expected Invoice Cost} = \text{Supplier PO Agreed Rate} \times \sum(\text{All Associated GRN Received Quantities})$$

- **Price Enforcement:** If the invoice rate is higher than the Supplier PO agreed rate, trigger a high-visibility `[RATE_MISMATCH]` flag.
- **Quantity Enforcement:** If the invoice bills for a higher quantity than the cumulative sum of what physically cleared your warehouse gate via the GRNs, trigger a high-visibility `[BILLING_MISMATCH]` alert to halt overpayment.

---

## 3. Tech Stack & Infrastructure

| Layer | Technology |
|---|---|
| **Frontend** | React.js (Vite) + Tailwind CSS |
| **Backend** | Python 3.11+ / FastAPI |
| **Database** | PostgreSQL (Relational columns + JSONB for variable fields) |
| **AI Extraction** | OpenRouter API → Claude 3.5 Sonnet (primary) / GPT-4o (failover) |
| **File Storage** | Amazon S3 (or S3-compatible: DigitalOcean Spaces / Cloudflare R2) |
| **S3 SDK** | boto3 with private bucket access + expiring Presigned URLs |

---

## 4. Database Schema Blueprint & Core Data Rules

To enable the app to adapt "on the go" when different vendors present custom rows or data parameters on their documents, the schema utilizes a **Hybrid Relational-Document Architecture**. Core structural tracking metrics are isolated into strict database columns, while variable, unexpected fields are dynamically stored in a Postgres **JSONB** metadata bucket.

### Table 1: `buyer_pos` — The Root Case Table

| Column | Type | Notes |
|---|---|---|
| `id` | BigInt, PK | Auto-increment primary key |
| `style_number` | String, Unique Index | **Primary anchor string for all joins** |
| `buyer_name` | String | |
| `total_order_quantity` | Integer | |
| `total_order_value` | Decimal | |
| `file_url` | String | S3 physical storage path pointer |
| `is_draft` | Boolean (Default: `true`) | |
| `verification_status` | Enum | `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED` |
| `lifecycle_status` | Enum | `INITIATED`, `PRODUCTION_READY`, `SHIPPED`, `CLOSED` |
| `metadata` | JSONB (Default: `{}`) | Size-wise breakdowns (S/M/L/XL arrays), payment terms, seasons, genders, custom tags |

### Table 2: `supplier_pos` — Procurement Budget Framework

| Column | Type | Notes |
|---|---|---|
| `id` | BigInt, PK | |
| `style_number` | String, FK → `buyer_pos.style_number` | |
| `supplier_name` | String | |
| `supplier_po_number` | String, Unique Index | |
| `material_category` | Enum | `FABRIC`, `BUTTONS`, `THREAD`, `PACKING`, `LABELS` |
| `metadata` | JSONB | |

### Table 3: `grns` — Warehouse Arrival Ledger

| Column | Type | Notes |
|---|---|---|
| `id` | BigInt, PK | |
| `style_number` | String, FK → `buyer_pos.style_number` | |
| `supplier_id` | BigInt, FK | |
| `supplier_po_id` | BigInt, FK → `supplier_pos.id` | |
| `grn_number` | String, Unique Index | |
| `received_date` | Timestamp | |
| `metadata` | JSONB | Gate entry numbers, driver contacts, vehicle registration |

### Table 4: `supplier_invoices` — Outbound Expense Register

| Column | Type | Notes |
|---|---|---|
| `id` | BigInt, PK | |
| `style_number` | String, FK → `buyer_pos.style_number` | |
| `supplier_id` | BigInt, FK | |
| `supplier_po_id` | BigInt, FK → `supplier_pos.id` | |
| `invoice_number` | String | |
| `taxable_value` | Decimal | |
| `is_discrepancy` | Boolean (Default: `false`) | |
| `file_url` | String | |
| `is_draft` | Boolean (Default: `true`) | |
| `metadata` | JSONB | Fabric GSM, fabric width (inches), shrinkage allowances, HSN codes, GST splits |

---

## 5. Analytical Computation & Core Engine Logic

### 5.1 Real-Time Profitability Engine

Triggered automatically whenever a user accesses a Master Style Room view. The system performs an on-the-fly computational database query across all verified records linked to that specific `style_number`:

$$\text{Live Style Revenue} = \sum(\text{Taxable Values of Confirmed Outbound Tax Invoices})$$

$$\text{Live Style Expenses} = \sum(\text{Taxable Values of Confirmed Inbound Supplier Invoices})$$

$$\text{Net Profit Margin (Absolute)} = \text{Live Style Revenue} - \text{Live Style Expenses}$$

$$\text{Net Profit Margin \%} = \left( \frac{\text{Net Profit Margin Absolute}}{\text{Live Style Revenue}} \right) \times 100$$

### 5.2 Case Reconciliation Closure Logic

A case's `lifecycle_status` can only be set to `CLOSED` when the two condition boundaries hit zero:

- **Outstanding Buyer Balance** = $\sum(\text{Gross Outbound Tax Invoices}) - \sum(\text{Reconciled Buyer Bank Receipts}) = 0$
- **Outstanding Vendor Balance** = $\sum(\text{Gross Supplier Invoices}) - \sum(\text{Confirmed Outbound Payments Issued}) = 0$

---

## 6. Claude Code Orchestration & Implementation Instructions

This section contains step-by-step instructions designed to guide your development workflow when you initialize the project folder and invoke Claude Code in your terminal.

### Step 1: Initialize Your Project Directory

```bash
mkdir style-tracker-mvp
cd style-tracker-mvp
touch CLAUDE.md main.py requirements.txt config.py database.py
mkdir models schemas services api
```

### Step 2: Configure the `CLAUDE.md` Blueprint

Open your local `CLAUDE.md` file and paste the following operational framework into it so Claude Code understands the system design boundaries on start:

```markdown
# Style-Anchored Garment Management App - Tech Conventions

## Tech Stack
- Backend: Python 3.11+ using FastAPI
- Database: PostgreSQL (SQLAlchemy Async ORM + Alembic for migrations)
- Dynamic Fields: PostgreSQL `JSONB` columns for all flexible metadata fields
- AI Parser: OpenRouter API (Claude 3.5 Sonnet / GPT-4o failover)
- Storage: Amazon S3 (or S3-compatible Spaces) via boto3

## Architectural Principles
1. THE STYLE ANCHOR: Every database table (except pure master configs) MUST include an
   indexed `style_number` column matching `buyer_pos.style_number`.
2. NESTING HIERARCHY: Cases contain Master Style rooms. Style rooms contain Supplier rooms.
   Supplier rooms house POs, GRNs, Invoices, and Payments.
3. CONTEXT INHERITANCE: Endpoint logic must support inheritance. Uploading an invoice inside
   a specific style/supplier route auto-assigns those foreign keys.

## Code Style & Commands
- Use Pydantic v2 for data validation and API schemas.
- Use async/await for database operations and external API calls.
- Run Dev Server: `uvicorn main:app --reload`
- Database Migration: `alembic revision --autogenerate -m "message"` -> `alembic upgrade head`
```

### Step 3: Claude Code Prompt Sequence

Start the Claude Code interface in your terminal. Execute these specific prompts **sequentially**, waiting for Claude Code to complete file construction and validation tests at each step.

---

**Prompt 1 — Environment Setup**

> *"Claude, read CLAUDE.md and populate requirements.txt with the necessary asynchronous dependencies for FastAPI, SQLAlchemy, asyncpg, Pydantic, boto3, and python-multipart. Then install them."*

---

**Prompt 2 — Database and Core Model Scaffolding**

> *"Scaffold the database configuration in database.py using an async engine pool. Then build the SQLAlchemy classes inside the models/ folder for style_case.py, supplier_room.py, procurement.py, and accounting.py according to the PRD database schemas. Ensure all tables have an indexed style_number foreign key and a JSONB metadata field."*

---

**Prompt 3 — S3 Storage & OpenRouter API Wiring**

> *"Create the storage services inside services/s3_storage.py using boto3 to handle file uploads and generate 15-minute expiring Presigned URLs. Then, create services/openrouter_ai.py to stream PDFs/images to OpenRouter using Claude 3.5 Sonnet, passing a strict Pydantic JSON structure to capture line items and values, saving them to the DB models with is_draft=True."*

---

**Prompt 4 — 3-Way Matching Rules Implementation**

> *"Write the business logic inside services/matching_engine.py. Implement Rule Engine 1 for live profit margins using SQL sum operations, and build the 3-Way Match logic checking Supplier PO rate vs. Multi-GRN cumulative counts vs. Supplier Invoice values, throwing soft discrepancy flags if overages occur."*

---

**Prompt 5 — Contextual API Routing Architecture**

> *"Build out the FastAPI application endpoints in the api/ directory. Create routes in api/cases.py for home dashboard views and case creation. Create nested routes in api/supplier_rooms.py that accept document drops, leverage contextual inheritance to auto-tag the current style and supplier keys, and feed the split-screen staging workspace workflow."*

---

**Prompt 6 — Verification and Execution**

> *"Review all files in main.py, database connections, and validation routers. Ensure syntax is perfectly valid, run a comprehensive validation script check, and confirm the API server initializes successfully via Uvicorn."*

---

*End of PRD — Style-Anchored Integrated Garment Tracking System (MVP)*
