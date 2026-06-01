import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class MaterialCategory(str, enum.Enum):
    FABRIC = "FABRIC"
    BUTTONS = "BUTTONS"
    THREAD = "THREAD"
    PACKING = "PACKING"
    LABELS = "LABELS"


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    contact_info: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SupplierPO(Base):
    __tablename__ = "supplier_pos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    style_number: Mapped[str] = mapped_column(
        String, ForeignKey("buyer_pos.style_number", ondelete="RESTRICT"), nullable=False
    )
    supplier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False
    )
    supplier_name: Mapped[str] = mapped_column(String, nullable=False)
    supplier_po_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    material_category: Mapped[MaterialCategory] = mapped_column(Enum(MaterialCategory), nullable=False)
    agreed_rate: Mapped[float | None] = mapped_column(Numeric(18, 4))
    ordered_quantity: Mapped[int | None] = mapped_column(Integer)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_supplier_pos_style_number", "style_number"),
        Index("ix_supplier_pos_supplier_id", "supplier_id"),
    )


class StyleSupplierRoom(Base):
    __tablename__ = "style_supplier_rooms"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    style_number: Mapped[str] = mapped_column(
        String, ForeignKey("buyer_pos.style_number", ondelete="CASCADE"), nullable=False
    )
    supplier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("style_number", "supplier_id"),
        Index("ix_ssr_style_number", "style_number"),
    )
