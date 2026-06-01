from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class GRNCreate(BaseModel):
    grn_number: str
    received_date: datetime
    received_quantity: float | None = None
    metadata_: dict[str, Any] = {}


class GRNVerify(BaseModel):
    grn_number: str | None = None
    received_date: datetime | None = None
    challan_no: str | None = None
    challan_date: str | None = None
    vehicle_no: str | None = None
    supplier_name: str | None = None
    line_items: list[dict[str, Any]] | None = None   # [{item_name, expected_challan_qty, actual_received_qty, unit}]
    justification: str | None = None                  # manual override for debit note justification


class GRNResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    style_number: str
    supplier_id: int
    supplier_po_id: int
    grn_number: str
    received_date: datetime
    received_quantity: float | None
    document_url: str | None = None   # presigned URL, populated by API layer
    metadata_: dict[str, Any]
    created_at: datetime
