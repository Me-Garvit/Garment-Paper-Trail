from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from models.style_case import LifecycleStatus, VerificationStatus


class BuyerPOCreate(BaseModel):
    style_number: str
    buyer_name: str
    total_order_quantity: int | None = None
    total_order_value: float | None = None
    metadata_: dict[str, Any] = {}


class BuyerPOVerify(BaseModel):
    style_number: str | None = None
    buyer_name: str | None = None
    total_order_quantity: int | None = None
    total_order_value: float | None = None
    metadata_: dict[str, Any] | None = None


class BuyerPOResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    style_number: str
    buyer_name: str
    total_order_quantity: int | None
    total_order_value: float | None
    file_url: str | None
    document_url: str | None = None   # presigned URL, populated by API layer
    is_draft: bool
    verification_status: VerificationStatus
    lifecycle_status: LifecycleStatus
    metadata_: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class BuyerPOListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    style_number: str
    buyer_name: str
    total_order_quantity: int | None
    lifecycle_status: LifecycleStatus
    verification_status: VerificationStatus
    metadata_: dict[str, Any] = {}


class StyleFinancials(BaseModel):
    style_number: str
    total_revenue: float
    total_expenses: float
    net_profit_abs: float
    net_profit_pct: float | None
