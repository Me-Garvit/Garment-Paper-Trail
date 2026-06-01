from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class SupplierInvoice(Base):
    __tablename__ = "supplier_invoices"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    style_number: Mapped[str] = mapped_column(
        String, ForeignKey("buyer_pos.style_number", ondelete="RESTRICT"), nullable=False
    )
    supplier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False
    )
    supplier_po_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("supplier_pos.id", ondelete="RESTRICT"), nullable=False
    )
    invoice_number: Mapped[str] = mapped_column(String, nullable=False)
    taxable_value: Mapped[float | None] = mapped_column(Numeric(18, 4))
    invoice_rate: Mapped[float | None] = mapped_column(Numeric(18, 4))
    invoice_quantity: Mapped[float | None] = mapped_column(Numeric(18, 4))
    is_discrepancy: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    discrepancy_flags: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    file_url: Mapped[str | None] = mapped_column(String)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    verification_status: Mapped[str] = mapped_column(String, default="PENDING_VERIFICATION", nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_supplier_invoices_style_number", "style_number"),
        Index("ix_supplier_invoices_supplier_po_id", "supplier_po_id"),
    )
