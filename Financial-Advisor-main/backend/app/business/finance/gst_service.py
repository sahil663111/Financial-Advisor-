"""
GST Service — Phase 6.

Tracks:
  Output GST  → from invoices (CGST + SGST or IGST)
  Input GST   → from vendor bills (Input Tax Credit / ITC)
  Net GST Liability = Output GST - ITC

GST records are auto-populated from invoices and bills.
Manual GST records can also be added for adjustments.

Disclaimer: This is a decision-support tool.
Verify all figures against official GSTN portal before filing.
"""
from datetime import datetime, timedelta
from typing import Optional


async def get_gst_summary(org_id: str, db, period_start: datetime, period_end: datetime) -> dict:
    """
    Compute GST summary for a given period from invoices and bills.
    Returns output GST, input ITC, net liability, and line-level breakdown.
    """
    # ── Output GST from invoices ──────────────────────────────────────────────
    invoice_pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "status": {"$nin": ["CANCELLED", "DRAFT"]},
                "issue_date": {"$gte": period_start, "$lte": period_end},
            }
        },
        {
            "$group": {
                "_id": None,
                "total_taxable":  {"$sum": "$subtotal"},
                "total_cgst":     {"$sum": {"$divide": ["$total_gst", 2]}},
                "total_sgst":     {"$sum": {"$divide": ["$total_gst", 2]}},
                "total_igst":     {"$sum": 0},   # simplified: all intra-state for now
                "total_output_gst": {"$sum": "$total_gst"},
                "invoice_count":  {"$sum": 1},
            }
        },
    ]
    inv_result = [doc async for doc in db.biz_invoices.aggregate(invoice_pipeline)]
    output = inv_result[0] if inv_result else {}

    # ── Input Tax Credit from vendor bills ────────────────────────────────────
    bill_pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "status": {"$nin": ["DISPUTED"]},
                "bill_date": {"$gte": period_start, "$lte": period_end},
            }
        },
        {
            "$group": {
                "_id": None,
                "total_itc":       {"$sum": "$total_gst"},
                "total_expense":   {"$sum": "$subtotal"},
                "bill_count":      {"$sum": 1},
            }
        },
    ]
    bill_result = [doc async for doc in db.biz_bills.aggregate(bill_pipeline)]
    input_itc = bill_result[0] if bill_result else {}

    # ── Business expenses with GST ────────────────────────────────────────────
    exp_pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "approval_status": "APPROVED",
                "date": {"$gte": period_start, "$lte": period_end},
                "gst_amount": {"$gt": 0},
            }
        },
        {"$group": {"_id": None, "total_itc": {"$sum": "$gst_amount"}, "count": {"$sum": 1}}},
    ]
    exp_result = [doc async for doc in db.biz_expenses.aggregate(exp_pipeline)]
    expense_itc = exp_result[0] if exp_result else {}

    # ── Compute totals ────────────────────────────────────────────────────────
    total_output   = round(output.get("total_output_gst", 0), 2)
    total_itc      = round(
        input_itc.get("total_itc", 0) + expense_itc.get("total_itc", 0), 2
    )
    net_liability  = round(total_output - total_itc, 2)

    return {
        "period_start":  period_start.isoformat(),
        "period_end":    period_end.isoformat(),
        "output_gst": {
            "total":         total_output,
            "cgst":          round(output.get("total_cgst", 0), 2),
            "sgst":          round(output.get("total_sgst", 0), 2),
            "igst":          round(output.get("total_igst", 0), 2),
            "taxable_value": round(output.get("total_taxable", 0), 2),
            "invoice_count": output.get("invoice_count", 0),
        },
        "input_itc": {
            "total":           total_itc,
            "from_bills":      round(input_itc.get("total_itc", 0), 2),
            "from_expenses":   round(expense_itc.get("total_itc", 0), 2),
            "bill_count":      input_itc.get("bill_count", 0),
        },
        "net_liability":       max(0, net_liability),
        "itc_excess":          abs(min(0, net_liability)),
        "is_refund_eligible":  net_liability < 0,
        "disclaimer": (
            "This is a computed GST estimate for decision support only. "
            "Verify all figures on the GSTN portal before filing returns."
        ),
    }


async def get_gst_by_month(org_id: str, db, months: int = 6) -> list[dict]:
    """Monthly GST liability trend for charting."""
    result = []
    now = datetime.utcnow()
    for i in range(months - 1, -1, -1):
        # First day of month i months ago
        target = now.replace(day=1) - timedelta(days=i * 30)
        month_start = target.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1) - timedelta(seconds=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1) - timedelta(seconds=1)

        summary = await get_gst_summary(org_id, db, month_start, month_end)
        result.append({
            "month":           month_start.strftime("%Y-%m"),
            "output_gst":      summary["output_gst"]["total"],
            "input_itc":       summary["input_itc"]["total"],
            "net_liability":   summary["net_liability"],
        })
    return result


async def get_compliance_calendar(org_id: str, db) -> list[dict]:
    """
    Generate upcoming GST/TDS compliance deadlines.
    Dates are based on standard Indian tax calendar (FY 2024-25).
    NOT connected to official GSTN — for planning purposes only.
    """
    now = datetime.utcnow()
    year = now.year
    month = now.month

    # Standard deadlines — configurable in future
    deadlines = []

    # GSTR-1 (outward supplies): 11th of next month
    gstr1_month = month + 1 if month < 12 else 1
    gstr1_year  = year if month < 12 else year + 1
    gstr1_due   = datetime(gstr1_year, gstr1_month, 11)

    # GSTR-3B (monthly summary): 20th of next month
    gstr3b_month = month + 1 if month < 12 else 1
    gstr3b_year  = year if month < 12 else year + 1
    gstr3b_due   = datetime(gstr3b_year, gstr3b_month, 20)

    # TDS payment: 7th of next month
    tds_month = month + 1 if month < 12 else 1
    tds_year  = year if month < 12 else year + 1
    tds_due   = datetime(tds_year, tds_month, 7)

    # Advance tax: 15th of June, September, December, March
    advance_tax_months = [6, 9, 12, 3]
    for at_month in advance_tax_months:
        at_year = year if at_month >= month else year + 1
        at_due  = datetime(at_year, at_month, 15)
        if at_due >= now:
            days_left = (at_due - now).days
            deadlines.append({
                "type":       "ADVANCE_TAX",
                "label":      f"Advance Tax — {at_due.strftime('%b %Y')}",
                "due_date":   at_due.isoformat(),
                "days_left":  days_left,
                "status":     "UPCOMING" if days_left > 7 else "DUE_SOON",
                "note":       "Consult your CA for exact advance tax computation.",
            })

    for item in [
        ("GSTR_1",  "GSTR-1 (Outward Supplies)",  gstr1_due),
        ("GSTR_3B", "GSTR-3B (Monthly Summary)",   gstr3b_due),
        ("TDS",     "TDS Deposit",                  tds_due),
    ]:
        due = item[2]
        if due >= now:
            days_left = (due - now).days
            deadlines.append({
                "type":      item[0],
                "label":     item[1],
                "due_date":  due.isoformat(),
                "days_left": days_left,
                "status":    "UPCOMING" if days_left > 7 else "DUE_SOON",
                "note":      "Verify exact date on official tax portal.",
            })

    deadlines.sort(key=lambda x: x["due_date"])
    return deadlines
