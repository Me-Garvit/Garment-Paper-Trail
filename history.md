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

### Session 15 — 2026-06-04

**Status:** 3-screen GRN flow implemented — Challan Confirm, GRN Entry, Debit Note — as separate navigable pages. Split-screen wizard from Sessions 13/14 removed. Backend challan-confirm mode added.

**What was done:**

1. **`services/openrouter_ai.py` — `GRN_PARSE_PROMPT` restored to full extraction:**
   - Re-added `line_items[]` (`item_name`, `qty_value`, `qty_unit`) back to the prompt. Session 14 had stripped these; restored because Screen 1 (Challan Confirm) displays AI-extracted items for the operator to verify.
   - Retained `success: true/false` legibility check and messy-data fallback (`{"success": false, "reason": "...", "line_items": []}`).

2. **`api/supplier_rooms.py` — `ingest_detailed_grn` (POST /grns):**
   - Restored line-item normalisation loop from Session 13. AI-extracted items stored in `metadata_.line_items` as `{item_name, qty_unit, qty_value, challan_rate: null, po_rate, actual_received_qty: null, variance: null}`.

3. **`api/supplier_rooms.py` — `verify_grn` (PATCH) — Challan-confirm mode added:**
   - Before running the reconciliation engine, checks `is_full_verify = any(item.actual_received_qty is not None for item in payload.line_items)`.
   - If `is_full_verify = False` (Screen 1 submitting challan data only): saves normalised items, sets `verification_status = "CHALLAN_CONFIRMED"`, `is_draft = True`, returns immediately. No reconciliation.
   - If `is_full_verify = True` (Screen 2 submitting gate counts): runs full contract reconciliation (rate ceiling + qty discrepancy + historical cumulative), sets `verification_status = "VERIFIED"`.
   - This single PATCH endpoint handles both screens via payload content.

4. **`frontend/src/pages/SupplierRoom.jsx` — split-screen removed, navigates to routes:**
   - Removed all `detailedGRNMode` state, phase wizard, split-screen JSX, and ~200 lines of helper code.
   - `handleChallanUpload`: calls `ingestDetailedGRN()` then `navigate(…/challan)` — Screen 1 opened as a full page.
   - GRN list edit icon uses `grnDestination()` helper to route based on GRN status:
     - No `file_mime` → old-style GRN → `/verify` (legacy VerifyGRN page)
     - `PENDING_VERIFICATION` → `/challan`
     - `CHALLAN_CONFIRMED` → `/grn-entry`
     - `VERIFIED` + discrepancy → `/debit-note`
     - `VERIFIED` + no discrepancy → `/grn-entry` (read-only view)
   - GRN list now shows a status badge per row: `VERIFIED` (green), `CHALLAN CONFIRMED` (blue), `PENDING` (orange).

5. **`frontend/src/pages/VerifyGRN.jsx` — repurposed as Screen 1 (Challan Confirm):**
   - Route: `/grns/:grnId/challan`. Breadcrumb shows "Step 1 of 3".
   - Fetches GRN + SupplierPO in parallel. PO line items populate a "Match to PO item" dropdown per row (auto-fills `item_name`, `qty_unit`, `po_rate`).
   - Parse-failed banner if `metadata_.parse_failed === true`.
   - Right panel: `<img>` for image MIME types, `<iframe>` for PDFs (uses `metadata_.file_mime`).
   - Line items table: PO dropdown + item name input + challan qty + unit dropdown + challan rate input.
   - "Confirm Challan →" → PATCH /verify (no `actual_received_qty`) → navigate to `/grn-entry`.
   - Also still handles legacy `/verify` route for old-style GRNs.

6. **New `frontend/src/pages/GRNEntry.jsx` — Screen 2 (Actual Gate Count):**
   - Route: `/grns/:grnId/grn-entry`.
   - Fetches GRN. Shows confirmed challan items locked (read-only). Actual received qty input per row.
   - Defaults `actual_received_qty = qty_value` so operator only edits shortage rows.
   - Live variance column per row; totals footer.
   - Gatekeeper justification textarea (only shown if any shortage/rate discrepancy detected).
   - "Log GRN & View Debit Note →" (red, if discrepancy) → PATCH /verify (with `actual_received_qty`) → navigate to `/debit-note`.
   - "Confirm & Log GRN" (indigo, if clean) → PATCH /verify → navigate back to Supplier Room.

7. **New `frontend/src/pages/DebitNote.jsx` — Screen 3 (DN Window):**
   - Route: `/grns/:grnId/debit-note`.
   - Fetches GRN. Full-page (no split-screen). Displays:
     - DN header card with party name, challan ref, grand total.
     - Comparison table: all line items with Challan Qty / Received Qty / Variance / Flags (SHORT, RATE↑).
     - Shortage Penalty section: per-item `shortage_qty × po_rate = penalty`.
     - Rate Inflation Overcharge section: per-item `challan_rate vs po_rate × qty = overcharge`.
     - Justification / Gatekeeper Note.
     - Grand total card.
   - "Acknowledge & Return to Supplier Room" → navigate to Supplier Room.

8. **`frontend/src/App.jsx` — new routes added:**
   - `/grns/:grnId/challan` → VerifyGRN (Screen 1)
   - `/grns/:grnId/grn-entry` → GRNEntry (Screen 2)
   - `/grns/:grnId/debit-note` → DebitNote (Screen 3)
   - `/grns/:grnId/verify` retained → VerifyGRN (legacy backward compat)

**New files:**
- `style-tracker-mvp/frontend/src/pages/GRNEntry.jsx` — Screen 2: actual gate count entry
- `style-tracker-mvp/frontend/src/pages/DebitNote.jsx` — Screen 3: debit note comparison window

**Changed files (no DB migrations):**
- `style-tracker-mvp/services/openrouter_ai.py` — GRN_PARSE_PROMPT: line items restored
- `style-tracker-mvp/api/supplier_rooms.py` — `ingest_detailed_grn`: line items restored; `verify_grn`: challan-confirm mode added
- `style-tracker-mvp/frontend/src/pages/SupplierRoom.jsx` — split-screen removed, challan upload navigates to `/challan`, status-aware GRN edit routing
- `style-tracker-mvp/frontend/src/pages/VerifyGRN.jsx` — full rewrite as Screen 1 with PO dropdown, parse-failed banner, image/PDF detection
- `style-tracker-mvp/frontend/src/App.jsx` — 3 new GRN routes added

**Next Steps (pick up here in Session 16):**
1. End-to-end test: upload challan → Screen 1 opens, AI items visible → confirm → Screen 2 opens with items locked → lower one gate count → Log GRN → Screen 3 shows comparison.
2. Test parse-failed path: upload blurry photo → Screen 1 shows red banner → manually enter items from PO dropdown → confirm.
3. Verify CHALLAN_CONFIRMED status badge shows in GRN list after Step 1.
4. Verify edit icon routes correctly: CHALLAN_CONFIRMED → /grn-entry, VERIFIED+discrepancy → /debit-note.
5. Test clean GRN (no shortage): Step 2 routes directly back to Supplier Room.

---

### Session 14 — 2026-06-04

**Status:** Two-phase GRN entry wizard, dynamic PO dropdown matching, and contract reconciliation engine implemented. GRN parse prompt stripped to header-only. Rate ceiling enforcement and fallback pricing math added.

**What was done:**

1. **`services/openrouter_ai.py` — `GRN_PARSE_PROMPT` stripped to header-only:**
   - Removed all `line_items` extraction from the GRN prompt. Line items are now logged manually through the frontend PO dropdown — AI no longer attempts row extraction.
   - Retained the legibility check (`success: false` for messy/blurry documents) and the 6 header fields: `challan_no`, `challan_date`, `vehicle_no`, `party_name`, `grn_number`, `received_date`.
   - Added explicit note: "Do NOT extract line items — those are logged manually against the linked Supplier PO items."

2. **`api/supplier_rooms.py` — `ingest_detailed_grn` (POST /grns) simplified:**
   - Removed all line-item normalisation loop (no more `qty_value`/`qty_unit` building at ingest time).
   - Now stores `line_items: []` (empty) in JSONB — the two-phase PATCH/verify step populates items.
   - Kept MIME normalisation, Supabase upload, AI header parse, `parse_failed`/`parse_error_reason`, `file_mime` in metadata.

3. **`api/supplier_rooms.py` — `verify_grn` (PATCH) — Contract Reconciliation Engine:**
   - Added `func` to `from sqlalchemy import func, select`.
   - **Historical cumulative query:** uses `func.coalesce(func.sum(GRN.received_quantity), 0.0)` to get the total received from all OTHER GRNs for the same `supplier_po_id`. Stored in JSONB as `historical_cumulative_qty` and `cumulative_after_grn`.
   - **Rate ceiling check:** per item, reads `challan_rate` (from payload) and `po_rate` (from payload). If `po_rate > 0 && challan_rate > po_rate` → `is_rate_discrepancy: True`. Computes `rate_excess` and `overcharge_amount = challan_qty × (challan_rate − po_rate)`.
   - **Qty discrepancy check:** `variance = actual − challan_qty`. If negative → `is_qty_discrepancy: True`. Computes `shortage_qty = abs(variance)` and `penalty_amount = shortage_qty × (po_rate or challan_rate)`.
   - **`debit_note_draft`** now contains two separate arrays: `shortage_items[]` and `rate_inflated_items[]`, plus `total_penalty_amount`, `total_overcharge_amount`.
   - `is_discrepancy` is true if EITHER rate or qty discrepancy is present.
   - Backward compat: still reads `item.get("qty_value") or item.get("expected_challan_qty") or item.get("incoming_qty")` for legacy GRNs.

4. **`frontend/src/pages/SupplierRoom.jsx` — Two-Phase Entry Wizard:**
   - **Phase lock mechanism:** `detailedGRNMode.phase` (1 or 2). Users cannot reach Phase 2 without completing Phase 1 validation (≥1 row with non-empty item name and `qty_value > 0`).
   - **Dynamic PO dropdown matching:** `poLineItems = selectedPO?.metadata_?.line_items || []`. Each Phase 1 row has a `<select>` populated from the master PO. Selecting an item auto-fills `item_name`, `qty_unit`, and `po_rate`. An "— Other —" option enables free-text manual entry.
   - **Phase 1 (Challan Log):** 5-column grid — Item selector, Challan Qty, Challan Rate ₹/unit, Line Value ₹, Rate Status. "+ Add Item Row" button. Row ✕ remove button. Totals footer.
   - **Fallback Pricing Math:** `effectiveChallanRate(row)` = if `line_value > 0 && qty_value > 0`: `line_value / qty_value`; else `challan_rate`. This allows the operator to enter total line value instead of unit rate; rate is derived dynamically. When `line_value` is entered with a qty, the computed rate is shown as a small sub-label.
   - **`[RATE_INFLATED]` badge:** appears inline on Phase 1 row when `effectiveChallanRate > po_rate`. Does not block progress.
   - **Phase transition:** "Next: Log Physical Counts →" advances; `advanceToPhase2()` defaults `actual_received_qty = qty_value` so operator only corrects shortages. "← Back" returns to Phase 1 without data loss.
   - **Phase 2 (Gate Count):** Phase 1 columns become read-only. 5-column grid — Item, Challan Qty (locked), Rate (locked + `INFLATED` badge), Actual Count (input), Variance (computed). Footer row shows total challan vs actual. Separate cumulative row: `existingGRNTotal + totalActualQty` vs `selectedPO.ordered_quantity`; `OVER BUDGET` badge if exceeded.
   - **Debit Note Draft Summary card:** auto-appears in Phase 2 when any shortage OR rate inflation exists. Two sections: "Qty Shortages" (per-item shortage × PO rate = penalty) and "Rate Inflations" (per-item excess rate × challan qty = overcharge). Separate subtotals. Gatekeeper comments textarea with auto-generated placeholder.
   - **`handleLogGRN`:** compiles `{ po_item_idx, item_name, qty_unit, po_rate, qty_value, challan_rate (derived), actual_received_qty }` per row and PATCH /verify. Sends `challan_date`, `vehicle_no`, `supplier_name` in payload.
   - **Commit button:** "Confirm & Log GRN + Debit Note" (red) when discrepancies exist; "Confirm & Log GRN" (indigo) when clean.
   - **Right panel:** unchanged from Session 13 (`<img>` for images, `<iframe>` for PDFs, detected by `fileMime`).
   - **Helper functions** at module top: `poItemUnit`, `poItemRate`, `poItemName`, `effectiveChallanRate`, `isRateInflated`, `itemVariance`, `emptyRow`.

**Changed files (no new files, no migrations):**
- `style-tracker-mvp/services/openrouter_ai.py` — GRN_PARSE_PROMPT stripped to header-only; line_items removed from AI scope
- `style-tracker-mvp/api/supplier_rooms.py` — `ingest_detailed_grn`: line-item loop removed; `verify_grn`: added `func` import, historical cumulative query, rate ceiling + qty discrepancy reconciliation, dual `debit_note_draft` structure
- `style-tracker-mvp/frontend/src/pages/SupplierRoom.jsx` — complete two-phase wizard: PO dropdown, Phase 1 challan log, fallback pricing math, phase lock, Phase 2 gate count, cumulative budget tracker, rate inflation + shortage debit note card

**No API contract changes. No table migrations. All 4-vector tracking (challan, gate count, rate, cumulative) stored in `grns.metadata_` JSONB.**

**Next Steps (pick up here in Session 15):**
1. End-to-end: upload challan photo → Phase 1: pick items from PO dropdown, enter qty + rate → advance → Phase 2: lower one gate count → confirm debit note card appears with both shortage and rate sections.
2. Verify `challan_rate > po_rate` triggers `[RATE_INFLATED]` badge inline in Phase 1.
3. Verify `rate_inflated_items` and `shortage_items` both appear in `grns.metadata_.debit_note_draft` after commit.
4. Test `cumulative_after_grn` stored in JSONB matches `historical_qty + actual_total`.
5. Test "— Other —" dropdown option for items not in PO (manual item name entry).

---

### Session 13 — 2026-06-03

**Status:** Advanced 3-stream GRN subsystem upgraded — image upload support, messy-data parse fallback, `qty_value`/`qty_unit` UOM segregation, editable header fields, and manual-entry override gate added.

**What was done:**

1. **`services/openrouter_ai.py` — `GRN_PARSE_PROMPT` refactored:**
   - Added `"success": true` top-level key to the expected JSON output shape.
   - Renamed line-item field `expected_challan_qty` → `qty_value` (number) and `unit` → `qty_unit` (string), matching the `qty_value`/`qty_unit` convention already used in Supplier PO and Invoice line items (established Session 11).
   - Added a CRITICAL LEGIBILITY CHECK instruction at the top of the prompt: if the document is a phone photograph of a handwritten challan, ink-stamped form, or any illegible/overlapping/blurry document, the model must immediately return `{"success": false, "reason": "data is too messy to read", "line_items": []}` and not attempt to guess values.
   - `_call_deepseek` updated: when `mime_type` starts with `image/`, DeepSeek (text-only model) now returns the structured fallback `{"success": False, "reason": "image content requires a vision model; DeepSeek cannot process it", "line_items": []}` directly instead of crashing or returning a garbled response.

2. **`api/supplier_rooms.py` — `ingest_detailed_grn` (POST /grns):**
   - Added image MIME type normalisation: if `content_type` is not `application/pdf`/`image/jpeg`/`image/png`, the filename extension (`.jpg`, `.jpeg`, `.png`) is used as a fallback to set the correct MIME before calling the AI service.
   - Added `parse_failed = not parsed.get("success", True)` check. When `True` (messy data or DeepSeek image fallback): `raw_items = []`, and `parse_failed: True` + `parse_error_reason` are stored in the JSONB `metadata_` column — no table migration needed.
   - Line items now stored with `qty_value` and `qty_unit` keys (previously `expected_challan_qty` and `unit`). Backward compat fallbacks (`item.get("qty_value") or item.get("expected_challan_qty") or item.get("incoming_qty")`) ensure old GRN records continue to work.
   - `file_mime` stored in `metadata_` so the frontend can render `<img>` vs `<iframe>` correctly.

3. **`api/supplier_rooms.py` — `verify_grn` (PATCH .../verify):**
   - `expected` now reads `item.get("qty_value") or item.get("expected_challan_qty") or item.get("incoming_qty") or 0` — supports both new and legacy GRN records.
   - `unit` now reads `item.get("qty_unit") or item.get("unit") or item.get("uom")`.
   - `shortage_items` built with `qty_unit` and `qty_value` keys.
   - `item_summary` in auto-justification string uses `s.get('qty_unit', s.get('unit', ''))` for backward compat.
   - `received_quantity` sum uses `actual_received_qty or qty_value or expected_challan_qty or incoming_qty` fallback chain.

4. **`components/UploadModal.jsx` — file type validation added:**
   - Added `ALLOWED_MIME` set and `ALLOWED_EXT` regex constants.
   - `handleFile` and `handleDrop` now call `isAllowed(f)` before accepting a file. Unsupported types show a red inline error message.
   - Drop zone description updated to "PDF, PNG, JPG, Excel — including hardcopy phone photos".
   - File icon: shows 🖼 for images, 📄 for documents.

5. **`frontend/src/pages/SupplierRoom.jsx` — split-screen GRN layout fully refactored:**
   - **Button renamed:** "+ Ingest Detailed GRN" → "+ Ingest Gate Challan".
   - **`detailedGRNMode` shape extended:** added `fileMime` (for image vs PDF render), `vehicleNo`, `parseFailed` fields. Line items use `qty_value`/`qty_unit` instead of `expected_challan_qty`/`unit`.
   - **Messy-data banner:** if `parseFailed === true`, a high-visibility red bordered banner appears at the top of the left panel: "Data is too messy to read, fill details manually".
   - **Editable header fields:** Challan No and Vehicle No are now editable `<input>` fields in the left panel (previously displayed as static subtitle text).
   - **Row-level editing:** item name is now an always-editable inline input. `qty_value` (challan expected qty) is an editable number input (critical for manual mode). `qty_unit` is a `<select>` dropdown populated from `UOM_OPTIONS = ['CONE', 'BOX', 'GRS', 'PCS', 'MTR', 'KG', 'SET', 'ROLL']`.
   - **Add / Remove rows:** "+ Add Row" button appends an empty item. ✕ button on each row removes it. Both work in auto (AI-populated) and manual modes.
   - **Right panel image rendering:** detects `fileMime.startsWith('image/')` and renders `<img>` (with `object-contain`) for phone photos; falls back to `<iframe>` for PDFs.
   - **`itemVariance`** updated to compute `gate - item.qty_value` (was `item.expected_challan_qty`).
   - **Debit Note Summary card:** updated to use `item.qty_value` and `item.qty_unit` throughout.
   - **Commit button:** renamed "Log GRN & Create Debit Note" → "Log GRN & Commit Debit Note".
   - **`handleLogGRN`:** now sends `qty_value`, `qty_unit` in line items (was `expected_challan_qty`, `unit`). Also sends `vehicle_no` from `detailedGRNMode.vehicleNo`.

**Changed files (no new files, no migrations):**
- `style-tracker-mvp/services/openrouter_ai.py` — GRN_PARSE_PROMPT (qty_value/qty_unit, success flag, messy-data fallback); `_call_deepseek` image guard
- `style-tracker-mvp/api/supplier_rooms.py` — `ingest_detailed_grn`: image MIME normalisation, parse_failed handling, qty_value/qty_unit; `verify_grn`: backward-compat field reads
- `style-tracker-mvp/frontend/src/components/UploadModal.jsx` — explicit MIME/ext validation, image icon, error message
- `style-tracker-mvp/frontend/src/pages/SupplierRoom.jsx` — full split-screen refactor: parse-failed banner, editable header, image render, add/remove rows, qty_value/qty_unit, "Log GRN & Commit Debit Note"

**No API contract changes. No table migrations. All new fields stored in existing `grns.metadata_` JSONB column.**

**Next Steps (pick up here in Session 14):**
1. End-to-end test: upload a phone photo of a handwritten challan → confirm red "too messy" banner appears + manual entry grid activates.
2. Upload a clean printed challan photo (JPG) → confirm `<img>` renders in right panel instead of iframe.
3. Test manual row entry: add rows from scratch, fill qty_value + actual count → confirm Debit Note card computes correctly.
4. Confirm `parse_failed: true` is stored in JSONB and does not break the GRN list view.
5. Test backward compat: open an existing GRN created before Session 13 (has `expected_challan_qty`/`unit`) in the verify page — confirm it still renders correctly.

---

### Session 12 — 2026-06-02

**Status:** Redundant boto3 dependency removed; Agreed Rate field removed from Supplier PO verification, and Ordered Quantity auto-sync added.

**What was done:**
1. **`requirements.txt`:**
   - Removed `boto3==1.35.27` as it is no longer used since storage has been refactored to use Supabase REST API via `httpx`.
2. **`style-tracker-mvp/frontend/src/pages/VerifySupplierPO.jsx`:**
   - Removed the obsolete "Agreed Rate (₹/unit)" input field from the Supplier PO verification workspace (since rates are item-specific).
   - Added auto-calculating "Ordered Quantity" derived from the sum of line items' quantities, locking it to read-only when items are present.
   - Wired `handleConfirm` to submit `agreed_rate: null` and the final quantity to the API.
3. **`style-tracker-mvp/api/supplier_rooms.py` — `verify_supplier_po` (PATCH):**
   - Refactored `agreed_rate` and `ordered_quantity` updates to check `model_fields_set` instead of `is not None`. This allows the front-end to explicitly set `agreed_rate` to `null` to clear it in the database.

---

### Session 11 — 2026-06-02

**Status:** Split-screen verification tables refactored across VerifySupplierPO and VerifyInvoice. Unified quantity strings (`664 GRS`) broken into separate, mutable `qty_value` (number input) and `qty_unit` (select dropdown) columns. Live `Value = Qty × Rate` recalculation added. Invoice taxable value auto-syncs from line items total.

**What was done:**

1. **`api/supplier_rooms.py` — `verify_supplier_invoice` (PATCH):**
   - Changed `invoice.metadata_ = payload.metadata_` (replace) to `invoice.metadata_ = {**invoice.metadata_, **payload.metadata_}` (merge).
   - Matches the existing behaviour of `verify_supplier_po`, which already merges. Prevents AI-extracted metadata fields not present in the verify payload from being silently wiped on confirm.

2. **`frontend/src/pages/VerifySupplierPO.jsx` — line items table refactored:**
   - `lineItems` state added. On load: normalises existing AI-extracted items from old format (`quantity`/`uom`) or new format (`qty_value`/`qty_unit`) — both shapes handled.
   - Static read-only Qty column replaced with two interactive columns: `[Qty]` (number input bound to `qty_value`) and `[Unit]` (`<select>` bound to `qty_unit`, populated from `UOM_OPTIONS`). Unknown units extracted by AI appear as an extra `<option>` to preserve them.
   - `[Rate]` column is now also an editable number input (was static text).
   - `[Value]` column is a live read-only computed cell: `Value = qty_value × rate`, recalculated on every `onChange`.
   - Summary footer row below the table: total qty sum + total ₹ value across all rows.
   - `handleConfirm` now sends `metadata_: { ...existingMeta, line_items: cleanedItems }` where each item carries `qty_value`, `qty_unit`, `rate`, and the recomputed `taxable_value`.

3. **`frontend/src/pages/VerifyInvoice.jsx` — line items table added + taxable_value auto-sync:**
   - `lineItems` state added with same normalisation logic as VerifySupplierPO.
   - Identical editable table rendered when `invoice.metadata_.line_items` is non-empty: `[Qty]` + `[Unit]` + `[Rate]` + `[Value]` columns, same live recalculation.
   - `Taxable Value (₹)` field: when line items compute a positive total, the field locks read-only and shows the computed sum with an `"auto"` label. Falls back to manual entry when no line items are present or none have valid qty/rate.
   - `handleConfirm`: `taxable_value` is set to the computed total if available, else form value. Updated `metadata_` with cleaned `line_items` is merged into invoice metadata.
   - Raw JSON metadata dump removed; replaced with structured key-value cards for scalar extra fields.

**Changed files (no new files, no migrations):**
- `style-tracker-mvp/api/supplier_rooms.py` — `verify_supplier_invoice`: metadata replace → merge
- `style-tracker-mvp/frontend/src/pages/VerifySupplierPO.jsx` — editable qty_value/qty_unit/rate columns, live value, footer, metadata on confirm
- `style-tracker-mvp/frontend/src/pages/VerifyInvoice.jsx` — line items table added, taxable_value auto-sync, raw JSON dump removed

**Next Steps (pick up here in Session 12):**
1. Test VerifySupplierPO with a real PO — confirm qty/unit/rate columns populate and Value column recomputes on edit.
2. Test VerifyInvoice — confirm taxable_value locks to computed total when line items are present.
3. Confirm PATCH /verify stores `qty_value`/`qty_unit` inside JSONB and doesn't corrupt old `quantity`/`uom` records.

---

### Session 10 — 2026-06-01

**Status:** Sub-buyer tracking and dynamic size-wise quantity breakdown added to the Buyer PO inception workflow. No schema migrations; all new fields stored in existing `metadata_` JSONB.

**What was done:**

1. **`services/openrouter_ai.py` — `DOCUMENT_PARSE_PROMPT` extended:**
   - Added `"sub_buyer_name": null` — AI extracts any third-party brand, buying agent, or middleman distinct from the primary buyer.
   - Added `"size_breakdown": {}` — AI extracts the full quantity grid (size token → integer qty), aggregating across colours if needed.
   - Added enforcement rule: if `size_breakdown` is populated, `total_quantity` must equal the mathematical sum of all breakdown values.

2. **`schemas/style_case.py` — `BuyerPOListItem` updated:**
   - Added `metadata_: dict[str, Any] = {}` so the `GET /cases/` list response carries metadata to the Dashboard for sub-buyer display without an extra per-case request.

3. **`api/cases.py` — `POST /cases/` and `PATCH /cases/{style_number}/verify` updated:**
   - `create_case`: computes `total_qty` from `sum(size_breakdown.values())` when AI provides a grid but no explicit total.
   - `verify_case`: changed from `case.metadata_ = payload.metadata_` (replace) to `{**case.metadata_, **payload.metadata_}` (merge) so fields not touched by the verify form are preserved.
   - Both `sub_buyer_name` and `size_breakdown` flow naturally through the `meta` dict into `metadata_` JSONB — no additional column writes.

4. **`frontend/src/pages/VerifyCase.jsx` — split-screen left panel updated:**
   - New "Sub-Buyer / Agent" optional text input, pre-filled from `metadata_.sub_buyer_name`.
   - Size breakdown section: loops through `metadata_.size_breakdown` keys, renders an editable numeric input per size token with a % distribution aside. Live read-only footer shows the rolling total (`sizeTotal`).
   - When a size breakdown is present, the Total Order Qty field becomes read-only and auto-syncs to `sizeTotal`.
   - "+ Add Size" button and per-row ✕ delete for manual edits.
   - On confirm: sends `metadata_: { ...existing, sub_buyer_name, size_breakdown }` and uses `sizeTotal` as `total_order_quantity` when a breakdown exists.

5. **`frontend/src/pages/Dashboard.jsx` — Buyer column updated:**
   - Sub-buyer name rendered as an indigo sub-text line under buyer name (`via <sub_buyer_name>`) when present in `metadata_`.

6. **`frontend/src/pages/StyleRoom.jsx` — PO Details section restructured:**
   - PO details card and a new `SizeBreakdownCard` now sit in a 2-column grid.
   - `SizeBreakdownCard`: renders each size with a proportional bar chart (CSS flex bar), qty, and % share. Total footer with formatted pcs count. Falls back to a plain total display when no breakdown is present.
   - Sub-Buyer / Agent shown as a `<Detail>` row in the PO card when present.
   - Raw JSON metadata dump removed (was replaced by the structured size card).

**Changed files (no new files, no migrations):**
- `style-tracker-mvp/services/openrouter_ai.py` — `DOCUMENT_PARSE_PROMPT` extended with `sub_buyer_name`, `size_breakdown`, and extraction rules
- `style-tracker-mvp/schemas/style_case.py` — `BuyerPOListItem.metadata_` added
- `style-tracker-mvp/api/cases.py` — size_breakdown fallback for `total_quantity`; metadata merge on verify
- `style-tracker-mvp/frontend/src/pages/VerifyCase.jsx` — sub-buyer input, size breakdown table, live total
- `style-tracker-mvp/frontend/src/pages/Dashboard.jsx` — sub-buyer sub-text in Buyer column
- `style-tracker-mvp/frontend/src/pages/StyleRoom.jsx` — `SizeBreakdownCard` component, sub-buyer detail, PO details restructured

**Next Steps (pick up here in Session 11):**
1. Test with a real buyer PO that has a size grid — verify AI fills `size_breakdown` correctly.
2. Check `verify_case` metadata merge doesn't double-nest `size_breakdown` on re-verify.
3. Style the size bar chart with a fixed width container to prevent overflow on small screens.

---

### Session 9 — 2026-06-01 (branch: feature/advanced-grn)

**Status:** Single-upload GRN subsystem finalised — dual-upload requirement eliminated, financial penalty engine added to debit note, editable justification wired end-to-end.

**What was done:**

1. **`schemas/procurement.py`** — `GRNVerify.justification: str | None` added. Allows the frontend to pass a user-edited debit note justification at verify time; if omitted the backend auto-generates it.

2. **`api/supplier_rooms.py` — `ingest_detailed_grn` (POST /grns):**
   - Each line item now stores `"agreed_rate": po_rate` (inherited from `SupplierPO.agreed_rate`) at ingest time so the verify step can compute penalty amounts without a second DB round-trip.

3. **`api/supplier_rooms.py` — `verify_grn` (PATCH .../verify):**
   - Resolves `agreed_rate` per shortage item: uses value stored on the line item at ingest; falls back to a single SPO lookup for older GRNs.
   - Computes `penalty_amount = shortage_qty × rate` per shortage item.
   - `debit_note_draft` now includes `total_penalty_amount`, per-item `penalty_amount`, and uses `payload.justification` if supplied (auto-generates otherwise).

4. **`frontend/src/pages/SupplierRoom.jsx` — complete refactor:**
   - **Dual-upload eliminated.** Removed `uploadGRN` import, `showGRNUpload`/`uploadingGRN` states, `handleGRNUpload`, and the old "+ Upload GRN" modal. Single trigger: "+ Ingest Detailed GRN" (violet button).
   - **Upload modal** explicitly asks for the Supplier Delivery Challan PDF.
   - **Default gate count = expected challan qty** (`actual_received_qty` initialised to `String(expected_challan_qty)`). Operator only edits rows with actual shortages — rapid entry pattern.
   - **Debit Note Summary card** (auto-renders on any shortage):
     - Per-item breakdown: item name · shortage qty · rate · `penalty_amount` in ₹
     - Total Penalty Amount row (shown only when `agreed_rate > 0`)
     - Editable `<textarea>` for manual justification (pre-placeholder = auto-generated text)
   - **Commit button** label: `"Log GRN & Create Debit Note"` (red) when shortages exist; `"Log GRN"` (indigo) when clean.
   - `handleLogGRN` compiles header, manual counts, `agreed_rate`, and justification into a single JSON body and PATCHes `/verify`.

**Changed files (no new files, no migrations):**
- `style-tracker-mvp/schemas/procurement.py` — `GRNVerify.justification` added
- `style-tracker-mvp/api/supplier_rooms.py` — `ingest_detailed_grn` stores `agreed_rate` per line item; `verify_grn` computes penalty + accepts justification
- `style-tracker-mvp/frontend/src/pages/SupplierRoom.jsx` — single-upload flow, penalty card, justification textarea

**Next Steps (pick up here in Session 10):**
1. End-to-end test: upload a real challan PDF → verify AI extracts `expected_challan_qty` → lower one gate count → confirm Debit Note card appears with correct ₹ penalty.
2. Check `is_discrepancy` + `debit_note_draft.total_penalty_amount` are persisted in the GRN JSONB.
3. Wire the SHORTAGE badge in the GRN list to link/expand the saved debit note detail.
4. Revisit `VerifyGRN.jsx` — display `expected_challan_qty` / `actual_received_qty` columns (currently shows legacy `incoming_qty`).

---

### Session 8 — 2026-06-01 (branch: feature/advanced-grn)

**Status:** Advanced 3-stream GRN subsystem implemented — Supplier Challan vs. Manual Gate Count vs. Debit Note Reconciliation.

**What was done:**

1. **`services/openrouter_ai.py` — Targeted GRN parser prompt refactored:**
   - `GRN_PARSE_PROMPT` updated: `supplier_name` → `party_name` (challan party), `incoming_qty` → `expected_challan_qty`, `uom` → `unit`.
   - `parse_grn()` unchanged in signature — uses updated prompt automatically via same OpenRouter → DeepSeek+pypdf fallback chain.

2. **`api/supplier_rooms.py` — `POST /{supplier_id}/pos/{po_id}/grns` rebuilt as 3-stream ingest:**
   - Old `create_grn` (JSON body) replaced by `ingest_detailed_grn` (UploadFile).
   - Uploads to Supabase storage via httpx REST engine (no boto3), runs `parse_grn`, builds 3-stream line items: `{ item_name, unit, expected_challan_qty, actual_received_qty: null, variance: null }`. Saves draft into JSONB `metadata_`.
   - Generates presigned URL immediately in POST response (so frontend split-screen can render inline without a follow-up GET).
   - `verify_grn` (PATCH) extended with 3-stream reconciliation engine: for each item with `actual_received_qty` present, computes `variance = actual − expected`. Items with `variance < 0` are collected into a `debit_note_draft` object saved into JSONB: `{ challan_no, party_name, raised_on_style, shortage_items[], total_shortage_qty, justification, status: "DRAFT" }`. Sets `is_discrepancy: true` on the GRN if any shortage. `received_quantity` updated to reflect gate count total.

3. **`api/client.js` — `createGRN` replaced by `ingestDetailedGRN`:**
   - `createGRN` (JSON POST to `/grns`) removed — dead code (referenced undeclared state in SupplierRoom).
   - `ingestDetailedGRN(styleNumber, supplierId, poId, file)` added — multipart POST to `/grns`.

4. **`frontend/src/pages/SupplierRoom.jsx` — 3-stream split-screen confirmation layout:**
   - Added "+ Ingest Detailed GRN" button alongside existing "+ Upload GRN" in the GRN section header.
   - `handleDetailedGRNUpload`: calls `ingestDetailedGRN`, receives parsed challan + presigned URL, sets `detailedGRNMode` state (no page navigation — in-page split-screen activates).
   - `updateGateCount`: updates per-item actual_received_qty in local state.
   - `handleLogGRN`: calls `verifyGRN` with enriched line items (expected + actual), collapses split-screen on success.
   - Split-screen overlay (`fixed inset-0 z-50`):
     - **Right half:** iframe rendering challan PDF via presigned Supabase URL.
     - **Left half:** 3-stream validation grid: `[Challan Exp. Qty (AI)] | [Physical Gate Count (input)] | [Computed Variance]`. Shortage rows highlighted red. If `variance < 0` on any item: inline `RAW MATERIAL LOSS DETECTED` alert badge + pre-filled Debit Note panel showing shortage breakdown and auto-generated justification text.
   - "Log GRN" button label dynamically reads "Log GRN + Flag Shortage" when shortages are detected. Existing GRN list badge shows `SHORTAGE` tag on committed GRNs with `is_discrepancy: true`.

**Changed files (no new files, no migrations):**
- `style-tracker-mvp/services/openrouter_ai.py` — GRN_PARSE_PROMPT field names updated
- `style-tracker-mvp/api/supplier_rooms.py` — `create_grn` → `ingest_detailed_grn`; `verify_grn` extended with 3-stream reconciliation
- `style-tracker-mvp/frontend/src/api/client.js` — `createGRN` → `ingestDetailedGRN`
- `style-tracker-mvp/frontend/src/pages/SupplierRoom.jsx` — 3-stream split-screen GRN confirmation UI

**API changes:**
- `POST /cases/{style_number}/suppliers/{supplier_id}/pos/{po_id}/grns` — now accepts `multipart/form-data` file upload (was JSON). Returns GRN draft with `document_url` presigned URL.
- `PATCH .../grns/{grn_id}/verify` — now evaluates 3-stream variance, persists `debit_note_draft` and `is_discrepancy` in JSONB.

**No new routes, no schema migrations, no boto3. All storage via Supabase httpx REST.**

**Next Steps (pick up here in Session 9):**
1. Test `POST /grns` with a real challan PDF — verify `expected_challan_qty` is parsed correctly.
2. Test split-screen: enter gate counts, check variance + debit note panel appear correctly.
3. Confirm PATCH verify persists `debit_note_draft` in JSONB and `is_discrepancy` flag shows on GRN list.
4. Revisit `VerifyGRN.jsx` — update to display `expected_challan_qty`/`actual_received_qty` columns for GRNs ingested via the new route (currently shows old `incoming_qty` field).

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
- `_call_openrouter(file_bytes, mime_type, prompt)` → sends base64 image_url message to OpenRouter. Supports PDF and image/* MIME types.
- `_call_deepseek(file_bytes, mime_type, prompt)` → extracts PDF text via `pypdf.PdfReader`. For `image/*` MIME types, returns structured failure dict directly (DeepSeek is text-only).
- `parse_document(file_bytes, mime_type)` → general document parser (buyer POs, invoices). OpenRouter → DeepSeek.
- `parse_supplier_po(file_bytes, mime_type)` → Supplier PO-specific parser using `SUPPLIER_PO_PARSE_PROMPT`. Extracts: supplier_name, po_number, material_category, hsn_codes[], line_items[], agreed_rate, total_quantity, total_value, payment_terms. OpenRouter → DeepSeek.
- `parse_grn(file_bytes, mime_type)` → GRN/challan header-only parser using `GRN_PARSE_PROMPT`. Returns `{"success": true/false, challan_no, challan_date, vehicle_no, party_name, grn_number, received_date}`. NO line_items — those are logged via frontend PO dropdown. On illegible/messy documents returns `{"success": false, "reason": "data is too messy to read"}`. OpenRouter → DeepSeek.
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
  - `PATCH /{supplier_id}/pos/{po_id}/grns/{grn_id}/verify` → `verify_grn` — Contract Reconciliation Engine. Queries historical cumulative GRN qty for the PO (excluding current). Per item: rate ceiling check (`challan_rate > po_rate` → `is_rate_discrepancy`), qty discrepancy check (`variance < 0` → `is_qty_discrepancy`), computes `penalty_amount` and `overcharge_amount`. Builds `debit_note_draft` with `shortage_items[]` and `rate_inflated_items[]`. Stores `historical_cumulative_qty` + `cumulative_after_grn` in JSONB. Backward compat: reads `qty_value or expected_challan_qty or incoming_qty`.
  - `POST /{supplier_id}/pos/{po_id}/grns` → `ingest_detailed_grn` — accepts PDF or image (JPG/PNG), normalises MIME type from filename if needed, runs `parse_grn()` (header only — no line items), stores `parse_failed`/`parse_error_reason`/`file_mime` in JSONB `metadata_`. `line_items: []` (empty — populated by PATCH /verify two-phase payload).
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
- "+ Upload PO" → `UploadModal` → `uploadSupplierPO()` → navigates to `VerifySupplierPO`.
- Selecting a PO shows GRNs. GRN list shows per-row status badge: `VERIFIED` (green), `CHALLAN CONFIRMED` (blue), `PENDING` (orange).
- "+ Ingest Gate Challan" → `UploadModal` (PDF or image) → `ingestDetailedGRN()` → **navigate to `/challan`** (Screen 1, separate page — no split-screen).
- GRN edit icon uses `grnDestination()` to route by status: no `file_mime` → `/verify` (legacy), `PENDING_VERIFICATION` → `/challan`, `CHALLAN_CONFIRMED` → `/grn-entry`, `VERIFIED+discrepancy` → `/debit-note`, `VERIFIED` → `/grn-entry`.
- **Edit here when:** changing GRN status routing logic, adding invoice deletion, or modifying the PO list display.

#### `pages/VerifySupplierPO.jsx`
- Split-screen layout for reviewing AI-extracted Supplier PO data.
- Left: editable form (supplier name, PO#, material category dropdown, agreed rate, ordered qty) + HSN code badge row + line items table + extra metadata cards.
- Right: `<iframe>` rendering `document_url` (Supabase presigned URL from `get_supplier_po`).
- "Confirm & Save" calls `verifySupplierPO()` → marks `is_draft=False`, `verification_status=VERIFIED` in JSONB → navigates to SupplierRoom.
- **Edit here when:** adding more PO fields, changing line item display, or updating the confirm flow.

#### `pages/VerifyGRN.jsx` — Screen 1 of 3: Challan Confirm
- Route: `/grns/:grnId/challan` (and legacy `/grns/:grnId/verify`). Breadcrumb: "Step 1 of 3".
- Fetches GRN + SupplierPO in parallel. PO line items populate a "Match to PO item" dropdown per row that auto-fills `item_name`, `qty_unit`, `po_rate`.
- Parse-failed banner if `metadata_.parse_failed === true`.
- Right panel: `<img>` for image MIME types, `<iframe>` for PDFs (from `metadata_.file_mime`).
- Left: header form (GRN#, challan#, challan date, vehicle no, party name) + line items (PO dropdown + item name + challan qty + unit + challan rate).
- "Confirm Challan →" → PATCH /verify (no `actual_received_qty`) → navigate to `/grn-entry`.
- **Edit here when:** adding more challan header fields, changing item matching logic.

#### `pages/GRNEntry.jsx` — Screen 2 of 3: Actual Gate Count (NEW)
- Route: `/grns/:grnId/grn-entry`.
- Fetches GRN. Shows confirmed challan items locked (read-only). Actual received qty input per row.
- Defaults `actual_received_qty = qty_value`. Live variance column + totals footer.
- Gatekeeper justification textarea (shown only when discrepancy detected).
- "Log GRN & View Debit Note →" (if discrepancy) → PATCH /verify → navigate to `/debit-note`.
- "Confirm & Log GRN" (if clean) → PATCH /verify → navigate to Supplier Room.
- **Edit here when:** adding more gate count fields or changing the discrepancy routing logic.

#### `pages/DebitNote.jsx` — Screen 3 of 3: Debit Note Window (NEW)
- Route: `/grns/:grnId/debit-note`.
- Full-page (no split-screen). Fetches GRN, reads `metadata_.debit_note_draft`.
- Sections: DN header card (party, challan ref, grand total), comparison table (challan vs GRN vs variance vs flags), Shortage Penalty section, Rate Inflation Overcharge section, Justification, Grand Total card.
- "Acknowledge & Return to Supplier Room" → navigate to Supplier Room.
- **Edit here when:** changing debit note display format or adding acknowledgement tracking.

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
- Drag-and-drop file upload modal. Accepts PDF, PNG, JPG (hardcopy phone photos), Excel.
- Props: `title`, `description`, `onUpload(file)`, `onClose`, `loading`.
- `isAllowed(f)` validates against `ALLOWED_MIME` set and `ALLOWED_EXT` regex; shows inline red error for unsupported types.
- File icon: 🖼 for images, 📄 for documents.
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
