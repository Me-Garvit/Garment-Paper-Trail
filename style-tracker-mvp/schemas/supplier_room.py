from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from models.supplier_room import MaterialCategory


class SupplierCreate(BaseModel):
    name: str
    contact_info: dict[str, Any] = {}


class SupplierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    contact_info: dict[str, Any]
    created_at: datetime


class SupplierPOCreate(BaseModel):
    supplier_id: int
    supplier_name: str
    supplier_po_number: str
    material_category: MaterialCategory
    agreed_rate: float | None = None
    ordered_quantity: int | None = None
    metadata_: dict[str, Any] = {}


class SupplierPOVerify(BaseModel):
    supplier_name: str | None = None
    supplier_po_number: str | None = None
    material_category: MaterialCategory | None = None
    agreed_rate: float | None = None
    ordered_quantity: int | None = None
    metadata_: dict[str, Any] | None = None


class SupplierPOResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    style_number: str
    supplier_id: int
    supplier_name: str
    supplier_po_number: str
    material_category: MaterialCategory
    agreed_rate: float | None
    ordered_quantity: int | None
    metadata_: dict[str, Any]
    document_url: str | None = None   # presigned URL, populated by API layer
    created_at: datetime
