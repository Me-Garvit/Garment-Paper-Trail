from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.style_case import BuyerPO, LifecycleStatus, VerificationStatus
from schemas.style_case import BuyerPOListItem, BuyerPOResponse, BuyerPOVerify, StyleFinancials
from services import s3_storage, openrouter_ai
from services.matching_engine import compute_style_financials

router = APIRouter(prefix="/cases", tags=["cases"])


@router.get("/", response_model=list[BuyerPOListItem])
async def list_cases(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BuyerPO).order_by(BuyerPO.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=BuyerPOResponse, status_code=status.HTTP_201_CREATED)
async def create_case(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    mime = file.content_type or "application/pdf"

    s3_key = await s3_storage.upload_document(file, folder="buyer_pos")

    parsed = await openrouter_ai.parse_document(content, mime)

    style_number = parsed.get("style_number") or f"DRAFT-{id(parsed)}"
    meta = {k: v for k, v in parsed.items() if k not in ("style_number", "buyer_name", "total_quantity", "total_value")}

    result = await db.execute(select(BuyerPO).where(BuyerPO.style_number == style_number))
    case = result.scalar_one_or_none()

    if case:
        if not case.is_draft:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A verified case for style '{style_number}' already exists.",
            )
        # Re-upload: refresh the draft with latest parse
        case.buyer_name = parsed.get("buyer_name") or case.buyer_name
        case.total_order_quantity = parsed.get("total_quantity") or case.total_order_quantity
        case.total_order_value = parsed.get("total_value") or case.total_order_value
        case.file_url = s3_key
        case.metadata_ = meta
    else:
        case = BuyerPO(
            style_number=style_number,
            buyer_name=parsed.get("buyer_name") or "UNKNOWN",
            total_order_quantity=parsed.get("total_quantity"),
            total_order_value=parsed.get("total_value"),
            file_url=s3_key,
            is_draft=True,
            verification_status=VerificationStatus.PENDING_VERIFICATION,
            lifecycle_status=LifecycleStatus.INITIATED,
            metadata_=meta,
        )
        db.add(case)

    await db.flush()
    await db.refresh(case)
    return case


@router.get("/{style_number}", response_model=BuyerPOResponse)
async def get_case(style_number: str, db: AsyncSession = Depends(get_db)):
    case = await _get_or_404(db, style_number)
    resp = BuyerPOResponse.model_validate(case)
    if case.file_url:
        try:
            resp.document_url = s3_storage.generate_presigned_url(case.file_url)
        except Exception:
            pass
    return resp


@router.get("/{style_number}/financials", response_model=StyleFinancials)
async def get_financials(style_number: str, db: AsyncSession = Depends(get_db)):
    await _get_or_404(db, style_number)
    return await compute_style_financials(db, style_number)


@router.patch("/{style_number}/verify", response_model=BuyerPOResponse)
async def verify_case(
    style_number: str,
    payload: BuyerPOVerify,
    db: AsyncSession = Depends(get_db),
):
    case = await _get_or_404(db, style_number)
    if payload.style_number:
        case.style_number = payload.style_number
    if payload.buyer_name:
        case.buyer_name = payload.buyer_name
    if payload.total_order_quantity is not None:
        case.total_order_quantity = payload.total_order_quantity
    if payload.total_order_value is not None:
        case.total_order_value = payload.total_order_value
    if payload.metadata_ is not None:
        case.metadata_ = payload.metadata_
    case.is_draft = False
    case.verification_status = VerificationStatus.VERIFIED
    await db.flush()
    await db.refresh(case)
    return case


@router.patch("/{style_number}/lifecycle", response_model=BuyerPOResponse)
async def update_lifecycle(
    style_number: str,
    lifecycle_status: LifecycleStatus,
    db: AsyncSession = Depends(get_db),
):
    case = await _get_or_404(db, style_number)
    if lifecycle_status == LifecycleStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use the /close endpoint to close a case after balance verification.",
        )
    case.lifecycle_status = lifecycle_status
    await db.flush()
    await db.refresh(case)
    return case


async def _get_or_404(db: AsyncSession, style_number: str) -> BuyerPO:
    result = await db.execute(select(BuyerPO).where(BuyerPO.style_number == style_number))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{style_number}' not found.")
    return case
