"""
Unified Tax Dashboard Service — Phase 6.

Combines:
  • Current month GST summary (Output tax, ITC, Net liability)
  • TDS Summary (by section, deducted vs deposited vs pending)
  • Pending / Overdue TDS items requiring attention
  • Compliance Calendar (next 45 days)
  • Tax Alerts & Warnings
"""
from datetime import datetime, timedelta
from typing import Optional

from app.business.tax import gst_service
from app.business.tax import tds_service
from app.business.tax import calendar_service


DISCLAIMER_TEXT = (
    "Tax calculations and compliance dates are decision-support estimates. "
    "Always verify against official GSTN (gst.gov.in) and Income Tax "
    "(incometax.gov.in) portals before filing returns or making tax payments."
)


async def get_tax_dashboard(
    org_id: str,
    db,
) -> dict:
    """Consolidated tax dashboard data for the organization."""
    now = datetime.utcnow()
    # Current month start and end
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_end = now

    # Current FY calculation for India (April 1 to March 31)
    fy_start_year = now.year if now.month >= 4 else now.year - 1
    fy_str = f"{fy_start_year}-{str(fy_start_year + 1)[-2:]}"
    # Current quarter: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
    if 4 <= now.month <= 6:
        curr_quarter = 1
    elif 7 <= now.month <= 9:
        curr_quarter = 2
    elif 10 <= now.month <= 12:
        curr_quarter = 3
    else:
        curr_quarter = 4

    # Run aggregations concurrently / in sequence
    gst_summary = await gst_service.get_gst_summary(org_id, month_start, month_end, db)
    tds_summary = await tds_service.get_tds_summary(org_id, db, quarter=curr_quarter, fy=fy_str)
    pending_tds = await tds_service.get_pending_tds(org_id, db)
    calendar_entries = await calendar_service.get_tax_calendar(org_id, db, months_ahead=2)

    # Generate Actionable Alerts
    alerts = []
    # Check overdue or due soon in calendar
    for entry in calendar_entries[:5]:
        if entry.get("status") == "OVERDUE":
            alerts.append({
                "type": "ERROR",
                "title": f"Overdue: {entry['label']}",
                "message": f"Was due on {entry['due_date']}. Immediate action recommended.",
            })
        elif entry.get("status") == "DUE_SOON":
            alerts.append({
                "type": "WARNING",
                "title": f"Due Soon: {entry['label']}",
                "message": f"Due in {entry['days_left']} day(s) on {entry['due_date']}.",
            })

    # Check pending TDS
    if pending_tds:
        overdue_tds = [t for t in pending_tds if t.get("status") == "OVERDUE"]
        if overdue_tds:
            total_overdue = sum(t.get("tds_amount", 0) for t in overdue_tds)
            alerts.append({
                "type": "ERROR",
                "title": f"Overdue TDS Deposit: ₹{total_overdue:,.2f}",
                "message": f"{len(overdue_tds)} TDS deduction(s) past the 7th of the month deadline.",
            })
        elif len(pending_tds) > 0:
            total_pend = sum(t.get("tds_amount", 0) for t in pending_tds)
            alerts.append({
                "type": "INFO",
                "title": f"Pending TDS Deposit: ₹{total_pend:,.2f}",
                "message": f"{len(pending_tds)} TDS deduction(s) waiting to be deposited with challan.",
            })

    # Estimated Total Immediate Tax Obligation
    net_gst = gst_summary.get("net_liability", {}).get("total", 0.0)
    pending_tds_val = tds_summary.get("total_pending", 0.0)
    estimated_tax_payable = round(net_gst + pending_tds_val, 2)

    return {
        "period": {
            "month": now.strftime("%B %Y"),
            "financial_year": fy_str,
            "quarter": f"Q{curr_quarter}",
        },
        "disclaimer": DISCLAIMER_TEXT,
        "estimated_tax_payable": estimated_tax_payable,
        "gst": {
            "period_start": month_start.strftime("%Y-%m-%d"),
            "period_end": month_end.strftime("%Y-%m-%d"),
            "output_tax": gst_summary.get("output_gst", {}).get("total", 0.0),
            "input_credit": gst_summary.get("input_tax_credit", {}).get("total", 0.0),
            "net_liability": net_gst,
            "itc_excess": gst_summary.get("itc_excess", 0.0),
            "is_refund_eligible": gst_summary.get("is_refund_eligible", False),
            "details": gst_summary,
        },
        "tds": {
            "quarter": f"Q{curr_quarter}",
            "financial_year": fy_str,
            "total_deducted": tds_summary.get("total_tds", 0.0),
            "total_deposited": tds_summary.get("total_deposited", 0.0),
            "total_pending": pending_tds_val,
            "by_section": tds_summary.get("sections", []),
            "pending_records_count": len(pending_tds),
        },
        "calendar": calendar_entries[:8],
        "alerts": alerts,
        "generated_at": now.isoformat(),
    }
