from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class SupplierInvoiceVerify(BaseModel):
    invoice_number: str | None = None
    taxable_value: float | None = None
    invoice_rate: float | None = None
    invoice_quantity: float | None = None
    supplier_po_id: int | None = None
    metadata_: dict[str, Any] | None = None


class SupplierInvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    style_number: str
    supplier_id: int
    supplier_po_id: int
    invoice_number: str
    taxable_value: float | None
    invoice_rate: float | None
    invoice_quantity: float | None
    is_discrepancy: bool
    discrepancy_flags: list[str]
    file_url: str | None
    document_url: str | None = None   # presigned URL, populated by API layer
    is_draft: bool
    verification_status: str
    metadata_: dict[str, Any]
    created_at: datetime
    updated_at: datetime
