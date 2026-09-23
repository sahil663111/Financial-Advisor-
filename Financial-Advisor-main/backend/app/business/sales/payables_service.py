"""
Payables Service — Phase 3.
Aging analysis for vendor bills.
"""
from datetime import datetime


_BUCKETS = [
    ("current",  0,  30),
    ("31_60",   31,  60),
    ("61_90",   61,  90),
    ("over_90", 91, None),
]


async def get_payables_aging(org_id: str, db) -> dict:
    """Build payables aging report from open vendor bills."""
    await _mark_overdue(org_id, db)

    now = datetime.utcnow()
    cursor = db.biz_bills.find(
        {"org_id": org_id, "status": {"$in": ["PENDING", "PARTIAL", "OVERDUE"]}}
    ).sort("due_date", 1)

    bills = [{**doc, "_id": str(doc["_id"])} async for doc in cursor]

    buckets: dict[str, list] = {k: [] for k, _, _ in _BUCKETS}
    totals: dict[str, float] = {k: 0.0 for k, _, _ in _BUCKETS}

    for bill in bills:
        due = bill["due_date"]
        if isinstance(due, str):
            due = datetime.fromisoformat(due)
        days_overdue = max(0, (now - due).days)

        bucket_key = "over_90"
        for key, low, high in _BUCKETS:
            if high is None or days_overdue <= high:
                if days_overdue >= low:
                    bucket_key = key
                    break

        bill["days_overdue"] = days_overdue
        buckets[bucket_key].append(bill)
        totals[bucket_key] = round(totals[bucket_key] + bill["amount_due"], 2)

    total_payable = round(sum(totals.values()), 2)

    # Upcoming payments in next 7 days
    seven_days = datetime.utcnow().replace(hour=23, minute=59, second=59)
    from datetime import timedelta
    seven_days = datetime.utcnow() + timedelta(days=7)
    upcoming = [
        b for b in bills
        if isinstance(b.get("due_date"), datetime) and b["due_date"] <= seven_days
        and b["status"] in ("PENDING", "PARTIAL")
    ]

    # Vendor summary
    vendor_summary: dict[str, dict] = {}
    for bill in bills:
        vid = bill["vendor_id"]
        if vid not in vendor_summary:
            vendor_summary[vid] = {
                "vendor_id": vid,
                "vendor_name": bill.get("vendor_name", "Unknown"),
                "total_payable": 0.0,
                "bill_count": 0,
            }
        vendor_summary[vid]["total_payable"] = round(
            vendor_summary[vid]["total_payable"] + bill["amount_due"], 2
        )
        vendor_summary[vid]["bill_count"] += 1

    top_vendors = sorted(
        vendor_summary.values(), key=lambda x: x["total_payable"], reverse=True
    )[:10]

    return {
        "as_of": now.isoformat(),
        "total_payable": total_payable,
        "upcoming_7_days": round(sum(b["amount_due"] for b in upcoming), 2),
        "upcoming_bills": upcoming[:10],
        "buckets": {
            "current": {"label": "Current (0–30 days)",  "bills": buckets["current"],  "total": totals["current"]},
            "31_60":   {"label": "31–60 days overdue",   "bills": buckets["31_60"],    "total": totals["31_60"]},
            "61_90":   {"label": "61–90 days overdue",   "bills": buckets["61_90"],    "total": totals["61_90"]},
            "over_90": {"label": "90+ days overdue",     "bills": buckets["over_90"],  "total": totals["over_90"]},
        },
        "top_vendors": top_vendors,
    }


async def _mark_overdue(org_id: str, db) -> None:
    await db.biz_bills.update_many(
        {
            "org_id": org_id,
            "status": {"$in": ["PENDING", "PARTIAL"]},
            "due_date": {"$lt": datetime.utcnow()},
        },
        {"$set": {"status": "OVERDUE", "updated_at": datetime.utcnow()}},
    )
