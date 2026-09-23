"""
Receivables Service — Phase 3.
Aging analysis: 0-30, 31-60, 61-90, 90+ days overdue.
"""
from datetime import datetime, timedelta


_BUCKETS = [
    ("current",  0,  30),
    ("31_60",   31,  60),
    ("61_90",   61,  90),
    ("over_90", 91, None),
]


async def get_receivables_aging(org_id: str, db) -> dict:
    """
    Build receivables aging report.
    Groups open invoices by how many days past due_date they are.
    Current = not yet due or due today.
    """
    # Auto-mark overdue first
    await _mark_overdue(org_id, db)

    now = datetime.utcnow()
    cursor = db.biz_invoices.find(
        {
            "org_id": org_id,
            "status": {"$in": ["SENT", "PARTIALLY_PAID", "OVERDUE"]},
        }
    ).sort("due_date", 1)

    invoices = [{**doc, "_id": str(doc["_id"])} async for doc in cursor]

    buckets: dict[str, list] = {k: [] for k, _, _ in _BUCKETS}
    totals: dict[str, float] = {k: 0.0 for k, _, _ in _BUCKETS}

    for inv in invoices:
        due = inv["due_date"]
        if isinstance(due, str):
            due = datetime.fromisoformat(due)
        days_overdue = max(0, (now - due).days)

        bucket_key = "over_90"
        for key, low, high in _BUCKETS:
            if high is None or days_overdue <= high:
                if days_overdue >= low:
                    bucket_key = key
                    break

        inv["days_overdue"] = days_overdue
        buckets[bucket_key].append(inv)
        totals[bucket_key] = round(totals[bucket_key] + inv["amount_due"], 2)

    total_outstanding = round(sum(totals.values()), 2)
    high_risk = round(totals.get("61_90", 0) + totals.get("over_90", 0), 2)

    # Customer-level summary
    customer_summary: dict[str, dict] = {}
    for inv in invoices:
        cid = inv["customer_id"]
        if cid not in customer_summary:
            customer_summary[cid] = {
                "customer_id": cid,
                "customer_name": inv.get("customer_name", "Unknown"),
                "total_outstanding": 0.0,
                "invoice_count": 0,
            }
        customer_summary[cid]["total_outstanding"] = round(
            customer_summary[cid]["total_outstanding"] + inv["amount_due"], 2
        )
        customer_summary[cid]["invoice_count"] += 1

    top_customers = sorted(
        customer_summary.values(),
        key=lambda x: x["total_outstanding"],
        reverse=True,
    )[:10]

    return {
        "as_of": now.isoformat(),
        "total_outstanding": total_outstanding,
        "high_risk_amount": high_risk,
        "buckets": {
            "current":  {"label": "Current (0–30 days)",   "invoices": buckets["current"],  "total": totals["current"]},
            "31_60":    {"label": "31–60 days overdue",    "invoices": buckets["31_60"],    "total": totals["31_60"]},
            "61_90":    {"label": "61–90 days overdue",    "invoices": buckets["61_90"],    "total": totals["61_90"]},
            "over_90":  {"label": "90+ days overdue",      "invoices": buckets["over_90"], "total": totals["over_90"]},
        },
        "top_customers": top_customers,
        "insight": _generate_insight(total_outstanding, high_risk, len(invoices)),
    }


async def _mark_overdue(org_id: str, db) -> None:
    await db.biz_invoices.update_many(
        {
            "org_id": org_id,
            "status": {"$in": ["SENT", "PARTIALLY_PAID"]},
            "due_date": {"$lt": datetime.utcnow()},
        },
        {"$set": {"status": "OVERDUE", "updated_at": datetime.utcnow()}},
    )


def _generate_insight(total: float, high_risk: float, count: int) -> str:
    if total == 0:
        return "No outstanding receivables. All invoices are collected."
    pct = round(high_risk / total * 100) if total > 0 else 0
    if pct > 50:
        return f"⚠️ {pct}% of receivables (₹{high_risk:,.0f}) are overdue by more than 60 days — escalate collection immediately."
    if pct > 25:
        return f"₹{high_risk:,.0f} ({pct}%) of receivables are in the 61–90+ day bucket. Review collection status."
    return f"₹{total:,.0f} outstanding across {count} invoice(s). {pct}% is high-risk."
