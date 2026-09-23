"""
Tax & Compliance Router — Phase 6.
Prefix: /api/v1/business/organizations/{org_id}/tax

Covers:
  • Configurable, versioned Tax Rules (GST rates, TDS sections, thresholds)
  • GST aggregation, return preparation, ITC reconciliation, and monthly trends
  • TDS tracking (vendor deductions, payroll salary TDS, deposit challans)
  • Statutory Compliance Calendar (GST, TDS, Advance Tax, ITR)
  • Consolidated Tax Dashboard & Actionable Alerts
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, Path

from app.database import get_db
from app.business.rbac.dependencies import OrgContext, require_org_member, require_permission
from app.business.tax.schemas import (
    CreateTaxRuleRequest,
    UpdateTaxRuleRequest,
    RecordTDSRequest,
    MarkTDSDepositedRequest,
)
from app.business.tax import rules_engine
from app.business.tax import gst_service
from app.business.tax import tds_service
from app.business.tax import calendar_service
from app.business.tax import dashboard_service

router = APIRouter(tags=["Business - GST, TDS & Tax Management"])


# ══════════════════════════════════════════════════════════════════════════════
# TAX DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/tax/dashboard")
async def get_tax_dashboard(
    org_id: str,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """
    Consolidated tax dashboard:
    Current month GST, current quarter TDS, upcoming 45-day deadlines, and tax alerts.
    """
    return await dashboard_service.get_tax_dashboard(ctx.org_id, db)


# ══════════════════════════════════════════════════════════════════════════════
# TAX RULES ENGINE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/tax/rules")
async def list_tax_rules(
    org_id: str,
    tax_type: Optional[str] = None,
    active_only: bool = True,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """List configured tax rules (GST rates, TDS sections, thresholds)."""
    return await rules_engine.list_tax_rules(
        ctx.org_id, db, tax_type=tax_type, active_only=active_only
    )


@router.post("/organizations/{org_id}/tax/rules")
async def create_tax_rule(
    org_id: str,
    data: CreateTaxRuleRequest,
    ctx: OrgContext = Depends(require_permission("manage_taxes")),
    db=Depends(get_db),
):
    """Create a new versioned tax rule."""
    return await rules_engine.create_tax_rule(ctx.org_id, data, ctx.user_id, db)


@router.put("/organizations/{org_id}/tax/rules/{rule_id}")
async def update_tax_rule(
    org_id: str,
    rule_id: str,
    data: UpdateTaxRuleRequest,
    ctx: OrgContext = Depends(require_permission("manage_taxes")),
    db=Depends(get_db),
):
    """Update an existing tax rule."""
    return await rules_engine.update_tax_rule(ctx.org_id, rule_id, data, ctx.user_id, db)


@router.delete("/organizations/{org_id}/tax/rules/{rule_id}")
async def deactivate_tax_rule(
    org_id: str,
    rule_id: str,
    ctx: OrgContext = Depends(require_permission("manage_taxes")),
    db=Depends(get_db),
):
    """Deactivate a tax rule."""
    return await rules_engine.deactivate_tax_rule(ctx.org_id, rule_id, ctx.user_id, db)


@router.post("/organizations/{org_id}/tax/rules/seed-defaults")
async def seed_tax_rules(
    org_id: str,
    ctx: OrgContext = Depends(require_permission("manage_taxes")),
    db=Depends(get_db),
):
    """Seed standard Indian GST rates and TDS sections if not already present."""
    count = await rules_engine.seed_default_rules(ctx.org_id, db)
    return {"message": f"Successfully seeded {count} default tax rules", "count": count}


# ══════════════════════════════════════════════════════════════════════════════
# GST AGGREGATION & REPORTING
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/tax/gst/summary")
async def get_gst_summary(
    org_id: str,
    period_start: Optional[datetime] = None,
    period_end: Optional[datetime] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """
    GST Summary: Output tax collected on sales, ITC paid on purchases/expenses, net liability.
    Defaults to current calendar month.
    """
    now = datetime.utcnow()
    if not period_start:
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if not period_end:
        period_end = now

    return await gst_service.get_gst_summary(ctx.org_id, period_start, period_end, db)


@router.get("/organizations/{org_id}/tax/gst/monthly")
async def get_gst_monthly(
    org_id: str,
    months: int = Query(6, ge=1, le=24),
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Monthly GST trend for visualization (Output vs ITC vs Net Liability)."""
    return await gst_service.get_gst_by_month(ctx.org_id, db, months=months)


@router.get("/organizations/{org_id}/tax/gst/return-data")
async def get_gst_return_data(
    org_id: str,
    month: Optional[int] = None,
    year: Optional[int] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """GSTR-1 (sales schedule) and GSTR-3B (tax liability summary) preparation figures."""
    now = datetime.utcnow()
    m = month or now.month
    y = year or now.year
    return await gst_service.get_gst_return_data(ctx.org_id, m, y, db)


@router.get("/organizations/{org_id}/tax/gst/itc-reconciliation")
async def get_itc_reconciliation(
    org_id: str,
    period_start: Optional[datetime] = None,
    period_end: Optional[datetime] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Input Tax Credit reconciliation across vendor bills and operational expenses."""
    now = datetime.utcnow()
    if not period_start:
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if not period_end:
        period_end = now
    return await gst_service.get_itc_reconciliation(ctx.org_id, period_start, period_end, db)


# ══════════════════════════════════════════════════════════════════════════════
# TDS (TAX DEDUCTED AT SOURCE)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/tax/tds")
async def list_tds_records(
    org_id: str,
    section: Optional[str] = None,
    status: Optional[str] = None,
    deductee_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """List TDS deduction records with filtering and pagination."""
    return await tds_service.list_tds_records(
        ctx.org_id, db,
        section=section,
        status=status,
        deductee_type=deductee_type,
        page=page,
        limit=limit,
    )


@router.post("/organizations/{org_id}/tax/tds")
async def record_tds_deduction(
    org_id: str,
    data: RecordTDSRequest,
    ctx: OrgContext = Depends(require_permission("manage_taxes")),
    db=Depends(get_db),
):
    """Record a new TDS deduction on a vendor/contractor payment."""
    return await tds_service.record_tds_deduction(ctx.org_id, data, ctx.user_id, db)


@router.post("/organizations/{org_id}/tax/tds/mark-deposited")
async def mark_tds_deposited(
    org_id: str,
    data: MarkTDSDepositedRequest,
    ctx: OrgContext = Depends(require_permission("manage_taxes")),
    db=Depends(get_db),
):
    """Record challan payment and mark TDS deductions as deposited."""
    return await tds_service.mark_tds_deposited(ctx.org_id, data, ctx.user_id, db)


@router.get("/organizations/{org_id}/tax/tds/summary")
async def get_tds_summary(
    org_id: str,
    quarter: Optional[int] = Query(None, ge=1, le=4),
    financial_year: Optional[str] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Quarterly summary of TDS deductions by section (Form 26Q / 24Q preparation)."""
    return await tds_service.get_tds_summary(ctx.org_id, db, quarter=quarter, fy=financial_year)


@router.get("/organizations/{org_id}/tax/tds/pending")
async def get_pending_tds(
    org_id: str,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """List outstanding TDS deductions awaiting deposit."""
    return await tds_service.get_pending_tds(ctx.org_id, db)


# ══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE CALENDAR
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/tax/calendar")
async def get_tax_calendar(
    org_id: str,
    months_ahead: int = Query(3, ge=1, le=12),
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Upcoming GST, TDS, Advance Tax, and ITR compliance calendar."""
    return await calendar_service.get_tax_calendar(ctx.org_id, db, months_ahead=months_ahead)
