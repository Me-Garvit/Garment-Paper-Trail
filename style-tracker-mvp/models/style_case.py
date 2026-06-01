import enum
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, Index, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class VerificationStatus(str, enum.Enum):
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class LifecycleStatus(str, enum.Enum):
    INITIATED = "INITIATED"
    PRODUCTION_READY = "PRODUCTION_READY"
    SHIPPED = "SHIPPED"
    CLOSED = "CLOSED"


class BuyerPO(Base):
    __tablename__ = "buyer_pos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    style_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    buyer_name: Mapped[str] = mapped_column(String, nullable=False)
    total_order_quantity: Mapped[int | None] = mapped_column(Integer)
    total_order_value: Mapped[float | None] = mapped_column(Numeric(18, 4))
    file_url: Mapped[str | None] = mapped_column(String)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus), default=VerificationStatus.PENDING_VERIFICATION, nullable=False
    )
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(
        Enum(LifecycleStatus), default=LifecycleStatus.INITIATED, nullable=False
    )
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("ix_buyer_pos_style_number", "style_number"),)
