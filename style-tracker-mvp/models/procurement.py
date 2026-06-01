from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class GRN(Base):
    __tablename__ = "grns"

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
    grn_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    received_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_quantity: Mapped[float | None] = mapped_column(Numeric(18, 4))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_grns_style_number", "style_number"),
        Index("ix_grns_supplier_po_id", "supplier_po_id"),
    )
