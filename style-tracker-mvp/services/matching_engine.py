from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.accounting import SupplierInvoice
from models.procurement import GRN
from models.style_case import BuyerPO, VerificationStatus
from models.supplier_room import SupplierPO


async def run_three_way_match(
    db: AsyncSession,
    invoice: SupplierInvoice,
    supplier_po: SupplierPO,
) -> list[str]:
    """
    Run 3-way match rules against a supplier invoice.
    Returns list of discrepancy flag strings (empty = clean).
    """
    flags: list[str] = []

    grn_total_qty_result = await db.execute(
        select(func.coalesce(func.sum(GRN.received_quantity), 0)).where(
            GRN.supplier_po_id == supplier_po.id
        )
    )
    cumulative_grn_qty = Decimal(str(grn_total_qty_result.scalar_one()))

    po_rate = Decimal(str(supplier_po.agreed_rate or 0))
    po_qty = Decimal(str(supplier_po.ordered_quantity or 0))
    inv_rate = Decimal(str(invoice.invoice_rate or 0))
    inv_qty = Decimal(str(invoice.invoice_quantity or 0))

    expected_cost = po_rate * cumulative_grn_qty

    if inv_rate > po_rate:
        flags.append("[RATE_MISMATCH]")

    if inv_qty > cumulative_grn_qty:
        flags.append("[BILLING_MISMATCH]")

    if cumulative_grn_qty > po_qty:
        flags.append("[EXCESS_DELIVERY]")

    return flags


async def compute_style_financials(db: AsyncSession, style_number: str) -> dict:
    """
    On-the-fly profitability calculation for a style room view.
    Only counts VERIFIED records.
    """
    expense_result = await db.execute(
        select(func.coalesce(func.sum(SupplierInvoice.taxable_value), 0)).where(
            SupplierInvoice.style_number == style_number,
            SupplierInvoice.verification_status == VerificationStatus.VERIFIED,
            SupplierInvoice.is_draft == False,
        )
    )
    total_expenses = Decimal(str(expense_result.scalar_one()))

    # NOTE: outbound (buyer) invoices are stored in metadata for now;
    # this will be wired to the outbound_invoices table when that model is added.
    total_revenue = Decimal("0")

    net_profit_abs = total_revenue - total_expenses
    net_profit_pct = (
        round(float(net_profit_abs / total_revenue * 100), 2)
        if total_revenue > 0
        else None
    )

    return {
        "style_number": style_number,
        "total_revenue": float(total_revenue),
        "total_expenses": float(total_expenses),
        "net_profit_abs": float(net_profit_abs),
        "net_profit_pct": net_profit_pct,
    }


async def check_closure_eligibility(db: AsyncSession, style_number: str) -> bool:
    """Returns True only when both buyer and vendor balances are zero."""
    # Vendor balance: sum(supplier invoices) - sum(payments issued)
    # Buyer balance: sum(outbound invoices) - sum(buyer receipts)
    # Until payment tables exist both are treated as non-zero → closure blocked.
    return False
