import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.accounting import SupplierInvoice
from models.procurement import GRN
from models.style_case import BuyerPO, VerificationStatus
from models.supplier_room import MaterialCategory, Supplier, SupplierPO, StyleSupplierRoom
from schemas.accounting import SupplierInvoiceResponse, SupplierInvoiceVerify
from schemas.procurement import GRNCreate, GRNResponse, GRNVerify
from schemas.supplier_room import SupplierCreate, SupplierPOCreate, SupplierPOResponse, SupplierPOVerify, SupplierResponse
from services import s3_storage, openrouter_ai
from services.matching_engine import run_three_way_match

router = APIRouter(prefix="/cases/{style_number}/suppliers", tags=["supplier-rooms"])


# ── Supplier master ──────────────────────────────────────────────────────────

@router.post("/", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(style_number: str, payload: SupplierCreate, db: AsyncSession = Depends(get_db)):
    await _require_case(db, style_number)

    # get-or-create global supplier
    result = await db.execute(select(Supplier).where(Supplier.name == payload.name))
    supplier = result.scalar_one_or_none()
    if not supplier:
        supplier = Supplier(name=payload.name, contact_info=payload.contact_info)
        db.add(supplier)
        await db.flush()
        await db.refresh(supplier)

    # link supplier to this style room (idempotent)
    link_result = await db.execute(
        select(StyleSupplierRoom).where(
            StyleSupplierRoom.style_number == style_number,
            StyleSupplierRoom.supplier_id == supplier.id,
        )
    )
    if not link_result.scalar_one_or_none():
        db.add(StyleSupplierRoom(style_number=style_number, supplier_id=supplier.id))
        await db.flush()

    return supplier


@router.get("/", response_model=list[SupplierResponse])
async def list_suppliers(style_number: str, db: AsyncSession = Depends(get_db)):
    await _require_case(db, style_number)
    result = await db.execute(
        select(Supplier)
        .join(StyleSupplierRoom, StyleSupplierRoom.supplier_id == Supplier.id)
        .where(StyleSupplierRoom.style_number == style_number)
    )
    return result.scalars().all()


# ── Supplier POs ─────────────────────────────────────────────────────────────

def _parse_material_category(value: str | None) -> MaterialCategory:
    if not value:
        return MaterialCategory.FABRIC
    v = value.upper().strip()
    try:
        return MaterialCategory(v)
    except ValueError:
        for cat in MaterialCategory:
            if cat.value in v or v in cat.value:
                return cat
        return MaterialCategory.FABRIC


@router.post("/{supplier_id}/pos", response_model=SupplierPOResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier_po(
    style_number: str,
    supplier_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    await _require_case(db, style_number)
    supplier = await _require_supplier(db, supplier_id)

    content = await file.read()
    mime = file.content_type or "application/pdf"
    s3_key = await s3_storage.upload_document(file, folder="supplier_pos")
    parsed = await openrouter_ai.parse_supplier_po(content, mime)

    po_number = parsed.get("po_number") or f"DRAFT-{uuid.uuid4().hex[:8]}"
    meta = {
        **{k: v for k, v in parsed.items() if k not in (
            "supplier_name", "po_number", "material_category", "agreed_rate", "total_quantity"
        )},
        "file_url": s3_key,
        "is_draft": True,
        "verification_status": "PENDING_VERIFICATION",
    }

    # Upsert: re-uploading the same PO number refreshes the draft instead of crashing
    existing = await db.execute(
        select(SupplierPO).where(SupplierPO.supplier_po_number == po_number)
    )
    spo = existing.scalar_one_or_none()

    if spo:
        if not spo.metadata_.get("is_draft", True):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A verified Supplier PO '{po_number}' already exists.",
            )
        spo.supplier_name = parsed.get("supplier_name") or supplier.name
        spo.material_category = _parse_material_category(parsed.get("material_category"))
        spo.agreed_rate = parsed.get("agreed_rate")
        spo.ordered_quantity = parsed.get("total_quantity")
        spo.metadata_ = meta
    else:
        spo = SupplierPO(
            style_number=style_number,
            supplier_id=supplier_id,
            supplier_name=parsed.get("supplier_name") or supplier.name,
            supplier_po_number=po_number,
            material_category=_parse_material_category(parsed.get("material_category")),
            agreed_rate=parsed.get("agreed_rate"),
            ordered_quantity=parsed.get("total_quantity"),
            metadata_=meta,
        )
        db.add(spo)

    await db.flush()
    await db.refresh(spo)
    return spo


@router.get("/{supplier_id}/pos", response_model=list[SupplierPOResponse])
async def list_supplier_pos(
    style_number: str,
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupplierPO).where(
            SupplierPO.style_number == style_number,
            SupplierPO.supplier_id == supplier_id,
        )
    )
    return result.scalars().all()


@router.get("/{supplier_id}/pos/{po_id}", response_model=SupplierPOResponse)
async def get_supplier_po(
    style_number: str,
    supplier_id: int,
    po_id: int,
    db: AsyncSession = Depends(get_db),
):
    spo = await _require_supplier_po(db, po_id, style_number, supplier_id)
    resp = SupplierPOResponse.model_validate(spo)
    if spo.metadata_.get("file_url"):
        try:
            resp.document_url = s3_storage.generate_presigned_url(spo.metadata_["file_url"])
        except Exception:
            pass
    return resp


@router.patch("/{supplier_id}/pos/{po_id}/verify", response_model=SupplierPOResponse)
async def verify_supplier_po(
    style_number: str,
    supplier_id: int,
    po_id: int,
    payload: SupplierPOVerify,
    db: AsyncSession = Depends(get_db),
):
    spo = await _require_supplier_po(db, po_id, style_number, supplier_id)
    if payload.supplier_name:
        spo.supplier_name = payload.supplier_name
    if payload.supplier_po_number:
        spo.supplier_po_number = payload.supplier_po_number
    if payload.material_category:
        spo.material_category = payload.material_category
    if "agreed_rate" in payload.model_fields_set:
        spo.agreed_rate = payload.agreed_rate
    if "ordered_quantity" in payload.model_fields_set:
        spo.ordered_quantity = payload.ordered_quantity
    meta_update = payload.metadata_ or {}
    spo.metadata_ = {**spo.metadata_, **meta_update, "is_draft": False, "verification_status": "VERIFIED"}
    await db.flush()
    await db.refresh(spo)
    return spo


# ── GRNs ─────────────────────────────────────────────────────────────────────

from datetime import datetime as _dt


@router.post("/{supplier_id}/pos/{po_id}/grns/upload", response_model=GRNResponse, status_code=status.HTTP_201_CREATED)
async def upload_grn(
    style_number: str,
    supplier_id: int,
    po_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a delivery challan/GRN document. AI extracts header + line items into JSONB metadata."""
    spo = await _require_supplier_po(db, po_id, style_number, supplier_id)
    supplier = await _require_supplier(db, supplier_id)

    content = await file.read()
    mime = file.content_type or "application/pdf"
    s3_key = await s3_storage.upload_document(file, folder="grns")
    parsed = await openrouter_ai.parse_grn(content, mime)

    line_items = parsed.get("line_items") or []
    if not isinstance(line_items, list):
        line_items = []
    total_qty = sum(
        float(item.get("expected_challan_qty") or item.get("incoming_qty") or 0)
        for item in line_items
        if isinstance(item, dict)
    ) or None

    received_date_raw = parsed.get("received_date") or parsed.get("challan_date")
    try:
        received_date = _dt.fromisoformat(str(received_date_raw)) if received_date_raw else _dt.utcnow()
    except (ValueError, TypeError):
        received_date = _dt.utcnow()

    grn = GRN(
        style_number=style_number,
        supplier_id=supplier_id,
        supplier_po_id=spo.id,
        grn_number=parsed.get("grn_number") or f"DRAFT-{uuid.uuid4().hex[:8]}",
        received_date=received_date,
        received_quantity=total_qty,
        metadata_={
            "challan_no": parsed.get("challan_no"),
            "challan_date": parsed.get("challan_date"),
            "vehicle_no": parsed.get("vehicle_no"),
            "party_name": parsed.get("party_name") or supplier.name,
            "line_items": line_items,
            "extra_fields": parsed.get("extra_fields", {}),
            "file_url": s3_key,
            "is_draft": True,
            "verification_status": "PENDING_VERIFICATION",
        },
    )
    db.add(grn)
    await db.flush()
    await db.refresh(grn)
    return grn


@router.get("/{supplier_id}/pos/{po_id}/grns", response_model=list[GRNResponse])
async def list_grns(
    style_number: str,
    supplier_id: int,
    po_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GRN).where(
            GRN.style_number == style_number,
            GRN.supplier_id == supplier_id,
            GRN.supplier_po_id == po_id,
        )
    )
    return result.scalars().all()


@router.get("/{supplier_id}/pos/{po_id}/grns/{grn_id}", response_model=GRNResponse)
async def get_grn(
    style_number: str,
    supplier_id: int,
    po_id: int,
    grn_id: int,
    db: AsyncSession = Depends(get_db),
):
    grn = await _require_grn(db, grn_id, po_id, supplier_id, style_number)
    resp = GRNResponse.model_validate(grn)
    if grn.metadata_.get("file_url"):
        try:
            resp.document_url = s3_storage.generate_presigned_url(grn.metadata_["file_url"])
        except Exception:
            pass
    return resp


@router.patch("/{supplier_id}/pos/{po_id}/grns/{grn_id}/verify", response_model=GRNResponse)
async def verify_grn(
    style_number: str,
    supplier_id: int,
    po_id: int,
    grn_id: int,
    payload: GRNVerify,
    db: AsyncSession = Depends(get_db),
):
    grn = await _require_grn(db, grn_id, po_id, supplier_id, style_number)

    if payload.grn_number:
        grn.grn_number = payload.grn_number
    if payload.received_date:
        grn.received_date = payload.received_date

    raw_items = payload.line_items if payload.line_items is not None else grn.metadata_.get("line_items", [])

    # ── Challan-confirm mode (no actual_received_qty in payload) ────────────
    # Screen 1 sends only challan header + line items without gate counts.
    # Save them under status=CHALLAN_CONFIRMED and return early.
    is_full_verify = bool(raw_items) and any(
        item.get("actual_received_qty") is not None
        for item in raw_items if isinstance(item, dict)
    )

    if not is_full_verify:
        normalised = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            normalised.append({
                "item_name": item.get("item_name"),
                "qty_unit": item.get("qty_unit") or item.get("unit") or item.get("uom") or "",
                "qty_value": float(item.get("qty_value") or item.get("expected_challan_qty") or item.get("incoming_qty") or 0),
                "challan_rate": item.get("challan_rate"),
                "po_rate": item.get("po_rate") or item.get("agreed_rate"),
            })
        grn.metadata_ = {
            **grn.metadata_,
            "challan_no": payload.challan_no if payload.challan_no is not None else grn.metadata_.get("challan_no"),
            "challan_date": payload.challan_date if payload.challan_date is not None else grn.metadata_.get("challan_date"),
            "vehicle_no": payload.vehicle_no if payload.vehicle_no is not None else grn.metadata_.get("vehicle_no"),
            "party_name": payload.supplier_name if payload.supplier_name is not None else grn.metadata_.get("party_name"),
            "line_items": normalised,
            "is_draft": True,
            "verification_status": "CHALLAN_CONFIRMED",
        }
        await db.flush()
        await db.refresh(grn)
        return grn

    # ── Full GRN verify mode (actual_received_qty present) ──────────────────
    # Historical cumulative received quantity for this PO (all OTHER GRNs)
    hist_result = await db.execute(
        select(func.coalesce(func.sum(GRN.received_quantity), 0.0)).where(
            GRN.supplier_po_id == grn.supplier_po_id,
            GRN.id != grn.id,
        )
    )
    historical_qty = float(hist_result.scalar() or 0)

    # Contract reconciliation — rate ceiling + qty discrepancy per line item
    enriched_items = []
    shortage_items = []
    rate_inflated_items = []

    for item in raw_items:
        if not isinstance(item, dict):
            continue

        challan_qty = float(item.get("qty_value") or item.get("expected_challan_qty") or item.get("incoming_qty") or 0)
        qty_unit = item.get("qty_unit") or item.get("unit") or item.get("uom") or ""
        challan_rate = float(item.get("challan_rate") or 0)
        po_rate = float(item.get("po_rate") or item.get("agreed_rate") or 0)
        actual_raw = item.get("actual_received_qty")
        actual = float(actual_raw) if actual_raw is not None else challan_qty
        variance = actual - challan_qty

        is_rate_discrepancy = po_rate > 0 and challan_rate > po_rate
        is_qty_discrepancy = variance < 0
        shortage_qty = abs(variance) if is_qty_discrepancy else 0.0
        penalty = round(shortage_qty * (po_rate or challan_rate), 2)

        enriched = {
            **item,
            "qty_value": challan_qty,
            "actual_received_qty": actual,
            "variance": variance,
            "is_rate_discrepancy": is_rate_discrepancy,
            "is_qty_discrepancy": is_qty_discrepancy,
            "penalty_amount": penalty,
        }
        enriched_items.append(enriched)

        if is_qty_discrepancy:
            shortage_items.append({
                "item_name": item.get("item_name"),
                "qty_unit": qty_unit,
                "challan_qty": challan_qty,
                "actual_received_qty": actual,
                "shortage_qty": shortage_qty,
                "po_rate": po_rate,
                "penalty_amount": penalty,
            })

        if is_rate_discrepancy:
            rate_diff = challan_rate - po_rate
            rate_inflated_items.append({
                "item_name": item.get("item_name"),
                "qty_unit": qty_unit,
                "challan_qty": challan_qty,
                "challan_rate": challan_rate,
                "po_rate": po_rate,
                "rate_excess": round(rate_diff, 4),
                "overcharge_amount": round(challan_qty * rate_diff, 2),
            })

    is_discrepancy = len(shortage_items) > 0 or len(rate_inflated_items) > 0
    debit_note_draft = None

    if is_discrepancy:
        total_shortage = sum(s["shortage_qty"] for s in shortage_items)
        total_penalty = sum(s["penalty_amount"] for s in shortage_items)
        total_overcharge = sum(r["overcharge_amount"] for r in rate_inflated_items)

        challan_ref = payload.challan_no or grn.metadata_.get("challan_no") or grn.grn_number
        party = grn.metadata_.get("party_name") or ""

        parts = []
        if shortage_items:
            summary = ", ".join(
                f"{s['shortage_qty']} {s['qty_unit']} of {s['item_name']}" for s in shortage_items
            )
            parts.append(f"Short delivery: {summary}")
        if rate_inflated_items:
            summary = ", ".join(
                f"{r['item_name']} @ ₹{r['challan_rate']} vs PO ₹{r['po_rate']}" for r in rate_inflated_items
            )
            parts.append(f"Rate inflation: {summary}")

        auto_justification = (
            f"Challan {challan_ref}" + (f" from {party}" if party else "") +
            ": " + "; ".join(parts) +
            f". Total penalty: ₹{round(total_penalty + total_overcharge, 2)}."
        )

        debit_note_draft = {
            "challan_no": challan_ref,
            "party_name": party,
            "raised_on_style": style_number,
            "shortage_items": shortage_items,
            "rate_inflated_items": rate_inflated_items,
            "total_shortage_qty": total_shortage,
            "total_penalty_amount": round(total_penalty, 2),
            "total_overcharge_amount": round(total_overcharge, 2),
            "justification": payload.justification or auto_justification,
            "status": "DRAFT",
        }

    current_actual_total = sum(
        float(item.get("actual_received_qty") or 0) for item in enriched_items if isinstance(item, dict)
    )
    grn.received_quantity = current_actual_total or grn.received_quantity

    grn.metadata_ = {
        **grn.metadata_,
        "challan_no": payload.challan_no if payload.challan_no is not None else grn.metadata_.get("challan_no"),
        "challan_date": payload.challan_date if payload.challan_date is not None else grn.metadata_.get("challan_date"),
        "vehicle_no": payload.vehicle_no if payload.vehicle_no is not None else grn.metadata_.get("vehicle_no"),
        "party_name": payload.supplier_name if payload.supplier_name is not None else grn.metadata_.get("party_name"),
        "line_items": enriched_items,
        "debit_note_draft": debit_note_draft,
        "is_discrepancy": is_discrepancy,
        "historical_cumulative_qty": historical_qty,
        "cumulative_after_grn": historical_qty + current_actual_total,
        "is_draft": False,
        "verification_status": "VERIFIED",
    }
    await db.flush()
    await db.refresh(grn)
    return grn


@router.post("/{supplier_id}/pos/{po_id}/grns", response_model=GRNResponse, status_code=status.HTTP_201_CREATED)
async def ingest_detailed_grn(
    style_number: str,
    supplier_id: int,
    po_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    3-stream GRN ingest. Uploads challan to Supabase, runs targeted AI parser to extract
    header metadata and per-line expected_challan_qty. Returns a draft GRN with a presigned
    document_url so the frontend can render the split-screen confirmation view immediately.
    """
    spo = await _require_supplier_po(db, po_id, style_number, supplier_id)
    supplier = await _require_supplier(db, supplier_id)

    content = await file.read()
    # Normalise MIME type — browsers sometimes send wrong content-type for images
    mime = file.content_type or "application/pdf"
    fname = (file.filename or "").lower()
    if mime not in {"application/pdf", "image/jpeg", "image/png"}:
        if fname.endswith((".jpg", ".jpeg")):
            mime = "image/jpeg"
        elif fname.endswith(".png"):
            mime = "image/png"

    s3_key = await s3_storage.upload_document(file, folder="grns")
    parsed = await openrouter_ai.parse_grn(content, mime)

    parse_failed = not parsed.get("success", True)
    raw_items = [] if parse_failed else (parsed.get("line_items") or [])
    if not isinstance(raw_items, list):
        raw_items = []

    po_rate = float(spo.agreed_rate) if spo.agreed_rate else None

    line_items = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        line_items.append({
            "item_name": item.get("item_name"),
            "qty_unit": item.get("qty_unit") or item.get("unit") or item.get("uom"),
            "qty_value": float(item.get("qty_value") or item.get("expected_challan_qty") or item.get("incoming_qty") or 0),
            "challan_rate": None,
            "po_rate": po_rate,
            "actual_received_qty": None,
            "variance": None,
        })

    total_expected = sum(i["qty_value"] for i in line_items) or None

    received_date_raw = parsed.get("received_date") or parsed.get("challan_date")
    try:
        received_date = _dt.fromisoformat(str(received_date_raw)) if received_date_raw else _dt.utcnow()
    except (ValueError, TypeError):
        received_date = _dt.utcnow()

    grn = GRN(
        style_number=style_number,
        supplier_id=supplier_id,
        supplier_po_id=spo.id,
        grn_number=parsed.get("grn_number") or f"DRAFT-{uuid.uuid4().hex[:8]}",
        received_date=received_date,
        received_quantity=total_expected,
        metadata_={
            "challan_no": parsed.get("challan_no"),
            "challan_date": parsed.get("challan_date"),
            "vehicle_no": parsed.get("vehicle_no"),
            "party_name": parsed.get("party_name") or supplier.name,
            "line_items": line_items,
            "debit_note_draft": None,
            "is_discrepancy": False,
            "parse_failed": parse_failed,
            "parse_error_reason": parsed.get("reason") if parse_failed else None,
            "file_url": s3_key,
            "file_mime": mime,
            "is_draft": True,
            "verification_status": "PENDING_VERIFICATION",
        },
    )
    db.add(grn)
    await db.flush()
    await db.refresh(grn)

    resp = GRNResponse.model_validate(grn)
    try:
        resp.document_url = s3_storage.generate_presigned_url(s3_key)
    except Exception:
        pass
    return resp


# ── Supplier Invoices ─────────────────────────────────────────────────────────

@router.post(
    "/{supplier_id}/invoices/upload",
    response_model=SupplierInvoiceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_supplier_invoice(
    style_number: str,
    supplier_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Context inheritance: style_number and supplier_id are taken from URL.
    AI parses the document; draft row created immediately.
    """
    await _require_case(db, style_number)
    await _require_supplier(db, supplier_id)

    content = await file.read()
    mime = file.content_type or "application/pdf"
    s3_key = await s3_storage.upload_document(file, folder="supplier_invoices")
    parsed = await openrouter_ai.parse_document(content, mime)

    # If AI found a PO number, try to resolve it; otherwise leave supplier_po_id as 0 (pending manual link)
    po_id = parsed.get("po_id") or 0
    if not po_id:
        po_result = await db.execute(
            select(SupplierPO).where(
                SupplierPO.style_number == style_number,
                SupplierPO.supplier_id == supplier_id,
                SupplierPO.supplier_po_number == str(parsed.get("po_number", "")),
            )
        )
        matched_po = po_result.scalar_one_or_none()
        if matched_po:
            po_id = matched_po.id

    invoice = SupplierInvoice(
        style_number=style_number,
        supplier_id=supplier_id,
        supplier_po_id=po_id,
        invoice_number=str(parsed.get("invoice_number") or "DRAFT"),
        taxable_value=parsed.get("taxable_value"),
        invoice_rate=parsed.get("invoice_rate"),
        invoice_quantity=parsed.get("invoice_quantity"),
        file_url=s3_key,
        is_draft=True,
        verification_status="PENDING_VERIFICATION",
        metadata_={k: v for k, v in parsed.items() if k not in (
            "invoice_number", "taxable_value", "invoice_rate", "invoice_quantity", "po_number"
        )},
    )
    db.add(invoice)
    await db.flush()
    await db.refresh(invoice)
    return invoice


@router.patch("/{supplier_id}/invoices/{invoice_id}/verify", response_model=SupplierInvoiceResponse)
async def verify_supplier_invoice(
    style_number: str,
    supplier_id: int,
    invoice_id: int,
    payload: SupplierInvoiceVerify,
    db: AsyncSession = Depends(get_db),
):
    invoice = await _require_invoice(db, invoice_id, style_number, supplier_id)

    if payload.invoice_number:
        invoice.invoice_number = payload.invoice_number
    if payload.taxable_value is not None:
        invoice.taxable_value = payload.taxable_value
    if payload.invoice_rate is not None:
        invoice.invoice_rate = payload.invoice_rate
    if payload.invoice_quantity is not None:
        invoice.invoice_quantity = payload.invoice_quantity
    if payload.supplier_po_id is not None:
        invoice.supplier_po_id = payload.supplier_po_id
    if payload.metadata_ is not None:
        # Merge so AI-extracted fields not present in the verify form are preserved
        invoice.metadata_ = {**invoice.metadata_, **payload.metadata_}

    invoice.is_draft = False
    invoice.verification_status = VerificationStatus.VERIFIED

    if invoice.supplier_po_id:
        spo_result = await db.execute(select(SupplierPO).where(SupplierPO.id == invoice.supplier_po_id))
        spo = spo_result.scalar_one_or_none()
        if spo:
            flags = await run_three_way_match(db, invoice, spo)
            invoice.discrepancy_flags = flags
            invoice.is_discrepancy = len(flags) > 0

    await db.flush()
    await db.refresh(invoice)
    return invoice


@router.get("/{supplier_id}/invoices", response_model=list[SupplierInvoiceResponse])
async def list_invoices(
    style_number: str,
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupplierInvoice).where(
            SupplierInvoice.style_number == style_number,
            SupplierInvoice.supplier_id == supplier_id,
        )
    )
    return result.scalars().all()


@router.get("/{supplier_id}/invoices/{invoice_id}", response_model=SupplierInvoiceResponse)
async def get_invoice(
    style_number: str,
    supplier_id: int,
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
):
    invoice = await _require_invoice(db, invoice_id, style_number, supplier_id)
    resp = SupplierInvoiceResponse.model_validate(invoice)
    if invoice.file_url:
        try:
            resp.document_url = s3_storage.generate_presigned_url(invoice.file_url)
        except Exception:
            pass
    return resp


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _require_case(db: AsyncSession, style_number: str) -> BuyerPO:
    result = await db.execute(select(BuyerPO).where(BuyerPO.style_number == style_number))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{style_number}' not found.")
    return case


async def _require_supplier(db: AsyncSession, supplier_id: int) -> Supplier:
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = result.scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail=f"Supplier {supplier_id} not found.")
    return supplier


async def _require_supplier_po(
    db: AsyncSession, po_id: int, style_number: str, supplier_id: int
) -> SupplierPO:
    result = await db.execute(
        select(SupplierPO).where(
            SupplierPO.id == po_id,
            SupplierPO.style_number == style_number,
            SupplierPO.supplier_id == supplier_id,
        )
    )
    spo = result.scalar_one_or_none()
    if not spo:
        raise HTTPException(status_code=404, detail=f"Supplier PO {po_id} not found.")
    return spo


async def _require_invoice(
    db: AsyncSession, invoice_id: int, style_number: str, supplier_id: int
) -> SupplierInvoice:
    result = await db.execute(
        select(SupplierInvoice).where(
            SupplierInvoice.id == invoice_id,
            SupplierInvoice.style_number == style_number,
            SupplierInvoice.supplier_id == supplier_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found.")
    return invoice


async def _require_grn(
    db: AsyncSession, grn_id: int, po_id: int, supplier_id: int, style_number: str
) -> GRN:
    result = await db.execute(
        select(GRN).where(
            GRN.id == grn_id,
            GRN.supplier_po_id == po_id,
            GRN.supplier_id == supplier_id,
            GRN.style_number == style_number,
        )
    )
    grn = result.scalar_one_or_none()
    if not grn:
        raise HTTPException(status_code=404, detail=f"GRN {grn_id} not found.")
    return grn
