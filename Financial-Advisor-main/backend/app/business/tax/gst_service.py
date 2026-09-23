"""
GST Aggregation Service — Phase 6.

Computes GST summaries by reading from source-of-truth collections:
  • biz_invoices  → Output GST (collected on sales)
  • biz_bills     → Input Tax Credit (paid on purchases)
  • biz_expenses  → Input Tax Credit (paid on operational expenses)

NO data duplication — all figures derived via MongoDB aggregation pipelines.
All financial arithmetic is deterministic; no AI involved.
"""
from datetime import datetime
from typing import Optional


async def get_gst_summary(
    org_id: str,
    period_start: datetime,
    period_end: datetime,
    db,
) -> dict:
    """
    GST summary for a period.
    Returns output_gst, input_gst (ITC), and net_liability with CGST/SGST/IGST split.
    """
    output = await _aggregate_output_gst(org_id, period_start, period_end, db)
    input_bills = await _aggregate_input_gst_bills(org_id, period_start, period_end, db)
    input_expenses = await _aggregate_input_gst_expenses(org_id, period_start, period_end, db)

    total_input_cgst = round(input_bills["cgst"] + input_expenses["cgst"], 2)
    total_input_sgst = round(input_bills["sgst"] + input_expenses["sgst"], 2)
    total_input_igst = round(input_bills["igst"] + input_expenses["igst"], 2)
    total_input = round(total_input_cgst + total_input_sgst + total_input_igst, 2)

    net_cgst = round(output["cgst"] - total_input_cgst, 2)
    net_sgst = round(output["sgst"] - total_input_sgst, 2)
    net_igst = round(output["igst"] - total_input_igst, 2)
    net_liability = round(net_cgst + net_sgst + net_igst, 2)

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "output_gst": {
            "total": output["total"],
            "cgst": output["cgst"],
            "sgst": output["sgst"],
            "igst": output["igst"],
            "invoice_count": output["count"],
        },
        "input_tax_credit": {
            "total": total_input,
            "cgst": total_input_cgst,
            "sgst": total_input_sgst,
            "igst": total_input_igst,
            "from_bills": round(input_bills["total"], 2),
            "from_expenses": round(input_expenses["total"], 2),
        },
        "net_liability": {
            "total": max(net_liability, 0),     # Cannot be negative (carry-forward ITC not yet modelled)
            "cgst": max(net_cgst, 0),
            "sgst": max(net_sgst, 0),
            "igst": max(net_igst, 0),
            "itc_carryforward": abs(min(net_liability, 0)),
        },
    }


async def get_gst_return_data(
    org_id: str, month: int, year: int, db
) -> dict:
    """
    GSTR-1 / GSTR-3B style preparation data for a given month.
    Not an actual return — a summary for CA/filing reference.
    """
    period_start = datetime(year, month, 1)
    if month == 12:
        period_end = datetime(year + 1, 1, 1)
    else:
        period_end = datetime(year, month + 1, 1)

    summary = await get_gst_summary(org_id, period_start, period_end, db)

    # GSTR-1 style: outward supplies breakdown by rate
    rate_breakdown = await _get_rate_wise_summary(org_id, period_start, period_end, db)

    return {
        "month": month,
        "year": year,
        "gstr1_summary": {
            "total_outward_supplies": summary["output_gst"]["total"],
            "total_taxable_value": rate_breakdown.get("total_taxable", 0),
            "rate_wise": rate_breakdown.get("by_rate", []),
        },
        "gstr3b_summary": {
            "output_tax": summary["output_gst"],
            "input_tax_credit": summary["input_tax_credit"],
            "net_tax_payable": summary["net_liability"],
        },
        "disclaimer": (
            "This is an estimated summary for reference only. "
            "Verify against GST portal data before filing GSTR-1 or GSTR-3B."
        ),
    }


async def get_gst_by_month(
    org_id: str, db, months: int = 6
) -> list[dict]:
    """Backward-compatible alias used by the tax router."""
    return await get_monthly_trend(org_id, months, db)


async def get_monthly_trend(
    org_id: str, months: int, db
) -> list[dict]:
    """Monthly GST output vs input trend for the last N months."""
    now = datetime.utcnow()
    trend = []

    for i in range(months - 1, -1, -1):
        # Walk backwards month by month
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1

        start = datetime(y, m, 1)
        if m == 12:
            end = datetime(y + 1, 1, 1)
        else:
            end = datetime(y, m + 1, 1)

        output = await _aggregate_output_gst(org_id, start, end, db)
        input_bills = await _aggregate_input_gst_bills(org_id, start, end, db)
        input_expenses = await _aggregate_input_gst_expenses(org_id, start, end, db)
        total_input = round(input_bills["total"] + input_expenses["total"], 2)

        trend.append({
            "month": f"{y}-{m:02d}",
            "output_gst": output["total"],
            "input_gst": total_input,
            "net": round(output["total"] - total_input, 2),
        })

    return trend


# ══════════════════════════════════════════════════════════════════════════════
# INTERNAL AGGREGATION PIPELINES
# ══════════════════════════════════════════════════════════════════════════════

async def _aggregate_output_gst(
    org_id: str, start: datetime, end: datetime, db
) -> dict:
    """Aggregate GST from invoices (output tax)."""
    pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "status": {"$nin": ["CANCELLED", "DRAFT"]},
                "issue_date": {"$gte": start, "$lt": end},
            }
        },
        {"$unwind": "$items"},
        {
            "$group": {
                "_id": None,
                "total_gst": {"$sum": "$items.gst_amount"},
                "cgst": {"$sum": "$items.cgst"},
                "sgst": {"$sum": "$items.sgst"},
                "igst": {"$sum": "$items.igst"},
                "count": {"$sum": 1},
            }
        },
    ]
    result = await db.biz_invoices.aggregate(pipeline).to_list(1)
    if result:
        r = result[0]
        return {
            "total": round(r.get("total_gst", 0), 2),
            "cgst": round(r.get("cgst", 0), 2),
            "sgst": round(r.get("sgst", 0), 2),
            "igst": round(r.get("igst", 0), 2),
            "count": r.get("count", 0),
        }
    return {"total": 0, "cgst": 0, "sgst": 0, "igst": 0, "count": 0}


async def _aggregate_input_gst_bills(
    org_id: str, start: datetime, end: datetime, db
) -> dict:
    """Aggregate input GST from vendor bills."""
    pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "status": {"$nin": ["DISPUTED"]},
                "bill_date": {"$gte": start, "$lt": end},
            }
        },
        {"$unwind": "$items"},
        {
            "$group": {
                "_id": None,
                "total_gst": {"$sum": "$items.gst_amount"},
                "cgst": {"$sum": {"$ifNull": ["$items.cgst", 0]}},
                "sgst": {"$sum": {"$ifNull": ["$items.sgst", 0]}},
                "igst": {"$sum": {"$ifNull": ["$items.igst", 0]}},
            }
        },
    ]
    result = await db.biz_bills.aggregate(pipeline).to_list(1)
    if result:
        r = result[0]
        return {
            "total": round(r.get("total_gst", 0), 2),
            "cgst": round(r.get("cgst", 0), 2),
            "sgst": round(r.get("sgst", 0), 2),
            "igst": round(r.get("igst", 0), 2),
        }
    return {"total": 0, "cgst": 0, "sgst": 0, "igst": 0}


async def _aggregate_input_gst_expenses(
    org_id: str, start: datetime, end: datetime, db
) -> dict:
    """Aggregate input GST from expenses that have GST data."""
    pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "approval_status": "APPROVED",
                "date": {"$gte": start, "$lt": end},
                "gst_amount": {"$exists": True, "$gt": 0},
            }
        },
        {
            "$group": {
                "_id": None,
                "total_gst": {"$sum": "$gst_amount"},
                "cgst": {"$sum": {"$ifNull": ["$cgst", 0]}},
                "sgst": {"$sum": {"$ifNull": ["$sgst", 0]}},
                "igst": {"$sum": {"$ifNull": ["$igst", 0]}},
            }
        },
    ]
    result = await db.biz_expenses.aggregate(pipeline).to_list(1)
    if result:
        r = result[0]
        return {
            "total": round(r.get("total_gst", 0), 2),
            "cgst": round(r.get("cgst", 0), 2),
            "sgst": round(r.get("sgst", 0), 2),
            "igst": round(r.get("igst", 0), 2),
        }
    return {"total": 0, "cgst": 0, "sgst": 0, "igst": 0}


async def _get_rate_wise_summary(
    org_id: str, start: datetime, end: datetime, db
) -> dict:
    """Break down output GST by rate slab (for GSTR-1)."""
    pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "status": {"$nin": ["CANCELLED", "DRAFT"]},
                "issue_date": {"$gte": start, "$lt": end},
            }
        },
        {"$unwind": "$items"},
        {
            "$group": {
                "_id": "$items.gst_rate_pct",
                "taxable_value": {"$sum": "$items.taxable_amount"},
                "gst_amount": {"$sum": "$items.gst_amount"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    results = await db.biz_invoices.aggregate(pipeline).to_list(50)
    total_taxable = 0
    by_rate = []

    for r in results:
        taxable = round(r["taxable_value"], 2)
        gst = round(r["gst_amount"], 2)
        total_taxable += taxable
        by_rate.append({
            "rate_pct": r["_id"],
            "taxable_value": taxable,
            "gst_amount": gst,
            "item_count": r["count"],
        })

    return {"total_taxable": round(total_taxable, 2), "by_rate": by_rate}
