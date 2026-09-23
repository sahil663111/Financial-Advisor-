"""
TDS Service — Phase 6.

Tracks Tax Deducted at Source (TDS) for:
  • Vendor payments (Sec 194C, 194J, 194I, 194H, etc.)
  • Salary TDS (Sec 192, synchronized from payroll runs)

Provides deposit tracking with challan references, overdue detection,
and quarterly summary generation for Form 26Q / 24Q preparation.
"""
from datetime import datetime, date, timedelta
from typing import Optional
import math
import uuid

from app.business.tax.schemas import (
    RecordTDSRequest,
    MarkTDSDepositedRequest,
    TDSDepositStatus,
)
from app.business.audit.service import log_action, AuditAction


def _compute_tds_due_date(payment_date: datetime) -> datetime:
    """
    In India, TDS deducted in a month must be deposited by the 7th of the following month.
    Exception: TDS deducted in March must be deposited by April 30th.
    """
    year = payment_date.year
    month = payment_date.month

    if month == 3:
        # March deduction -> Due April 30
        return datetime(year, 4, 30, 23, 59, 59)
    elif month == 12:
        return datetime(year + 1, 1, 7, 23, 59, 59)
    else:
        return datetime(year, month + 1, 7, 23, 59, 59)


async def record_tds_deduction(
    org_id: str,
    data: RecordTDSRequest,
    user_id: str,
    db,
) -> dict:
    """Record a TDS deduction against a vendor or other payment."""
    tds_id = f"tds_{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow()
    due_date = _compute_tds_due_date(data.payment_date)

    doc = {
        "id": tds_id,
        "org_id": org_id,
        "section": data.section.value if hasattr(data.section, "value") else str(data.section),
        "deductee_type": data.deductee_type,
        "deductee_id": data.deductee_id,
        "deductee_name": data.deductee_name,
        "deductee_pan": data.deductee_pan.upper() if data.deductee_pan else None,
        "gross_amount": data.gross_amount,
        "tds_rate_pct": data.tds_rate_pct,
        "tds_amount": data.tds_amount,
        "payment_date": data.payment_date,
        "due_date": due_date,
        "status": TDSDepositStatus.DEDUCTED.value,
        "invoice_or_ref": data.invoice_or_ref,
        "description": data.description,
        "challan_number": None,
        "bsr_code": None,
        "deposit_date": None,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    await db.biz_tds_records.insert_one(doc)
    doc.pop("_id", None)

    await log_action(
        org_id=org_id,
        user_id=user_id,
        action="CREATE_TAX_RECORD",
        entity_type="tds_record",
        entity_id=tds_id,
        details={
            "section": doc["section"],
            "deductee_name": doc["deductee_name"],
            "tds_amount": doc["tds_amount"],
        },
        db=db,
    )

    return doc


async def list_tds_records(
    org_id: str,
    db,
    section: Optional[str] = None,
    status: Optional[str] = None,
    deductee_type: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> dict:
    """List TDS records with filtering and pagination."""
    query: dict = {"org_id": org_id}
    if section:
        query["section"] = section
    if status:
        query["status"] = status
    if deductee_type:
        query["deductee_type"] = deductee_type

    total = await db.biz_tds_records.count_documents(query)
    skip = (page - 1) * limit

    now = datetime.utcnow()
    cursor = db.biz_tds_records.find(query, {"_id": 0}).sort("payment_date", -1).skip(skip).limit(limit)
    items = []
    async for item in cursor:
        # Check overdue dynamically
        if item.get("status") == TDSDepositStatus.DEDUCTED.value and item.get("due_date"):
            if item["due_date"] < now:
                item["status"] = TDSDepositStatus.OVERDUE.value
        items.append(item)

    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": math.ceil(total / limit) if limit else 1,
    }


async def mark_tds_deposited(
    org_id: str,
    data: MarkTDSDepositedRequest,
    user_id: str,
    db,
) -> dict:
    """Mark one or more TDS records as deposited with challan details."""
    now = datetime.utcnow()
    update_data = {
        "status": TDSDepositStatus.DEPOSITED.value,
        "challan_number": data.challan_number,
        "bsr_code": data.bsr_code,
        "deposit_date": data.deposit_date,
        "deposit_amount": data.deposit_amount,
        "updated_at": now,
        "deposited_by": user_id,
    }

    result = await db.biz_tds_records.update_many(
        {"org_id": org_id, "id": {"$in": data.record_ids}},
        {"$set": update_data},
    )

    await log_action(
        org_id=org_id,
        user_id=user_id,
        action="UPDATE_TAX_RECORD",
        entity_type="tds_records",
        entity_id=data.challan_number,
        details={
            "record_ids": data.record_ids,
            "modified_count": result.modified_count,
            "deposit_amount": data.deposit_amount,
        },
        db=db,
    )

    return {
        "modified_count": result.modified_count,
        "challan_number": data.challan_number,
        "status": TDSDepositStatus.DEPOSITED.value,
    }


async def get_tds_summary(
    org_id: str,
    db,
    quarter: Optional[int] = None,
    fy: Optional[str] = None,
) -> dict:
    """
    Quarterly TDS summary grouped by section.
    Also aggregates employee salary TDS from payroll runs.
    """
    match_query: dict = {"org_id": org_id}

    now = datetime.utcnow()
    # Compute FY start and end if specified
    if fy:
        # format: "2024-25" -> 2024
        try:
            start_year = int(fy.split("-")[0])
            fy_start = datetime(start_year, 4, 1)
            fy_end = datetime(start_year + 1, 3, 31, 23, 59, 59)
            match_query["payment_date"] = {"$gte": fy_start, "$lte": fy_end}
        except Exception:
            pass

    pipeline = [
        {"$match": match_query},
        {
            "$group": {
                "_id": "$section",
                "count": {"$sum": 1},
                "total_gross": {"$sum": "$gross_amount"},
                "total_tds": {"$sum": "$tds_amount"},
                "total_deposited": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$status", TDSDepositStatus.DEPOSITED.value]},
                            "$tds_amount",
                            0,
                        ]
                    }
                },
                "total_pending": {
                    "$sum": {
                        "$cond": [
                            {"$ne": ["$status", TDSDepositStatus.DEPOSITED.value]},
                            "$tds_amount",
                            0,
                        ]
                    }
                },
            }
        },
        {"$sort": {"_id": 1}},
    ]

    by_section = []
    overall_gross = 0.0
    overall_tds = 0.0
    overall_deposited = 0.0
    overall_pending = 0.0

    async for row in db.biz_tds_records.aggregate(pipeline):
        sec = row["_id"] or "OTHER"
        gross = round(row["total_gross"], 2)
        tds = round(row["total_tds"], 2)
        dep = round(row["total_deposited"], 2)
        pend = round(row["total_pending"], 2)

        by_section.append({
            "section": sec,
            "count": row["count"],
            "gross_amount": gross,
            "tds_amount": tds,
            "deposited": dep,
            "pending": pend,
        })
        overall_gross += gross
        overall_tds += tds
        overall_deposited += dep
        overall_pending += pend

    # Also check payroll runs for Section 192 (Salary TDS)
    payroll_pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "status": {"$in": ["APPROVED", "PAID"]},
            }
        },
        {
            "$group": {
                "_id": None,
                "count": {"$sum": 1},
                "total_gross": {"$sum": "$total_gross_pay"},
                "total_tds": {"$sum": "$total_tds"},
                "total_paid_tds": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$status", "PAID"]},
                            "$total_tds",
                            0,
                        ]
                    }
                },
            }
        },
    ]

    payroll_docs = [doc async for doc in db.payroll_runs.aggregate(payroll_pipeline)]
    if not payroll_docs:
        # Also check biz_payroll_runs if that's the collection name
        payroll_docs = [doc async for doc in db.biz_payroll_runs.aggregate(payroll_pipeline)]

    if payroll_docs and payroll_docs[0].get("total_tds", 0) > 0:
        p_row = payroll_docs[0]
        p_gross = round(p_row.get("total_gross", 0), 2)
        p_tds = round(p_row.get("total_tds", 0), 2)
        p_dep = round(p_row.get("total_paid_tds", 0), 2)
        p_pend = round(p_tds - p_dep, 2)

        # Append or merge Section 192
        existing_192 = next((s for s in by_section if s["section"] == "192"), None)
        if existing_192:
            existing_192["gross_amount"] = round(existing_192["gross_amount"] + p_gross, 2)
            existing_192["tds_amount"] = round(existing_192["tds_amount"] + p_tds, 2)
            existing_192["deposited"] = round(existing_192["deposited"] + p_dep, 2)
            existing_192["pending"] = round(existing_192["pending"] + p_pend, 2)
            existing_192["count"] += p_row.get("count", 0)
        else:
            by_section.append({
                "section": "192",
                "count": p_row.get("count", 0),
                "gross_amount": p_gross,
                "tds_amount": p_tds,
                "deposited": p_dep,
                "pending": p_pend,
            })

        overall_gross += p_gross
        overall_tds += p_tds
        overall_deposited += p_dep
        overall_pending += p_pend

    return {
        "sections": by_section,
        "total_gross": round(overall_gross, 2),
        "total_tds": round(overall_tds, 2),
        "total_deposited": round(overall_deposited, 2),
        "total_pending": round(overall_pending, 2),
        "generated_at": now.isoformat(),
    }


async def get_pending_tds(org_id: str, db) -> list:
    """Get all outstanding TDS deductions waiting to be deposited."""
    now = datetime.utcnow()
    cursor = db.biz_tds_records.find(
        {
            "org_id": org_id,
            "status": {"$ne": TDSDepositStatus.DEPOSITED.value},
        },
        {"_id": 0},
    ).sort("due_date", 1)

    items = []
    async for item in cursor:
        if item.get("due_date") and item["due_date"] < now:
            item["status"] = TDSDepositStatus.OVERDUE.value
        items.append(item)
    return items
