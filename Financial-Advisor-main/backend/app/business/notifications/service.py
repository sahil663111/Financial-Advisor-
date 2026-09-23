"""
Notification Service — generates business notifications from real data.
Called by the GET /notifications endpoint to auto-create alerts before returning.
Types: INVOICE_OVERDUE, PAYMENT_DUE, LOW_RUNWAY, BUDGET_EXCEEDED,
       ANOMALY_DETECTED, PAYROLL_DUE, TAX_DEADLINE
"""
from datetime import datetime, timedelta
from typing import Optional


async def generate_notifications(org_id: str, db) -> None:
    """
    Scan business data and create new unread notifications for actionable events.
    Idempotent: uses a dedup key so the same event is never created twice.
    """
    now = datetime.utcnow()

    async def _upsert(key: str, notif_type: str, title: str, message: str,
                      severity: str = "INFO", link: Optional[str] = None):
        existing = await db.notifications.find_one({"org_id": org_id, "dedup_key": key})
        if not existing:
            await db.notifications.insert_one({
                "org_id":    org_id,
                "dedup_key": key,
                "type":      notif_type,
                "title":     title,
                "message":   message,
                "severity":  severity,   # INFO | WARNING | CRITICAL
                "link":      link,
                "is_read":   False,
                "created_at": now,
            })

    # ── Overdue invoices ──────────────────────────────────────────────────────
    overdue_pipeline = [
        {"$match": {"org_id": org_id, "status": "OVERDUE"}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "total": {"$sum": "$amount_due"}}},
    ]
    overdue = [d async for d in db.biz_invoices.aggregate(overdue_pipeline)]
    if overdue and overdue[0]["count"] > 0:
        c, t = overdue[0]["count"], overdue[0]["total"]
        week = now.isocalendar()[1]
        await _upsert(
            f"overdue_invoices_{now.year}_{now.month}_{week}",
            "INVOICE_OVERDUE",
            f"{c} Invoice{'s' if c > 1 else ''} Overdue",
            f"₹{t:,.0f} outstanding across {c} overdue invoice{'s' if c > 1 else ''}. Follow up with customers.",
            "WARNING", "/business/receivables",
        )

    # ── Low cash runway ───────────────────────────────────────────────────────
    cash_accounts = await db.accounts.find(
        {"org_id": org_id, "account_sub_type": {"$in": ["CASH", "BANK"]}, "is_active": True}
    ).to_list(length=None)
    cash = sum(a.get("current_balance", 0) for a in cash_accounts)

    # Simple burn: avg monthly expense last 3 months
    three_ago = now - timedelta(days=90)
    exp_pipeline = [
        {"$match": {"org_id": org_id, "approval_status": "APPROVED", "date": {"$gte": three_ago}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    exp_result = [d async for d in db.biz_expenses.aggregate(exp_pipeline)]
    total_exp = exp_result[0]["total"] if exp_result else 0
    monthly_burn = total_exp / 3 if total_exp > 0 else 0

    if monthly_burn > 0 and cash > 0:
        runway = cash / monthly_burn
        if runway < 3:
            await _upsert(
                f"low_runway_{now.year}_{now.month}",
                "LOW_RUNWAY",
                "⚠️ Low Cash Runway",
                f"At current burn rate of ₹{monthly_burn:,.0f}/month, cash reserves last ~{runway:.1f} months.",
                "CRITICAL", "/business/cashflow",
            )
        elif runway < 6:
            await _upsert(
                f"runway_warning_{now.year}_{now.month}",
                "LOW_RUNWAY",
                "Cash Runway Below 6 Months",
                f"Cash runway is approximately {runway:.1f} months. Review expenses or plan fundraising.",
                "WARNING", "/business/cashflow",
            )

    # ── Budget exceeded ───────────────────────────────────────────────────────
    budgets = await db.biz_budgets.find({"org_id": org_id}).to_list(length=None)
    for b in budgets:
        util = b.get("utilization_pct", 0)
        if util >= 100:
            await _upsert(
                f"budget_exceeded_{b['category']}_{now.year}_{now.month}",
                "BUDGET_EXCEEDED",
                f"Budget Exceeded: {b['category'].replace('_', ' ')}",
                f"{b['category'].replace('_', ' ')} spending has exceeded the ₹{b['amount']:,.0f} monthly limit ({util:.0f}% used).",
                "WARNING", "/business/budgets",
            )
        elif util >= 85:
            await _upsert(
                f"budget_near_{b['category']}_{now.year}_{now.month}",
                "BUDGET_EXCEEDED",
                f"Budget Near Limit: {b['category'].replace('_', ' ')}",
                f"{b['category'].replace('_', ' ')} is at {util:.0f}% of the monthly ₹{b['amount']:,.0f} budget.",
                "INFO", "/business/budgets",
            )

    # ── Unresolved anomalies ──────────────────────────────────────────────────
    anomaly_count = await db.anomalies.count_documents({"org_id": org_id, "is_resolved": False})
    if anomaly_count > 0:
        week = now.isocalendar()[1]
        await _upsert(
            f"anomalies_{now.year}_{week}",
            "ANOMALY_DETECTED",
            f"{anomaly_count} Expense Anomal{'y' if anomaly_count == 1 else 'ies'} Detected",
            f"ML system flagged {anomaly_count} unusual expense{'s' if anomaly_count > 1 else ''}. Review in ML Intelligence.",
            "WARNING", "/business/intelligence",
        )

    # ── Payroll due ───────────────────────────────────────────────────────────
    # If today is between 20th and end of month and no payroll run this month
    if now.day >= 20:
        this_month_run = await db.payroll_runs.find_one({
            "org_id": org_id,
            "period_year": now.year,
            "period_month": now.month,
        })
        if not this_month_run:
            emp_count = await db.employees.count_documents({"org_id": org_id, "status": "ACTIVE"})
            if emp_count > 0:
                await _upsert(
                    f"payroll_due_{now.year}_{now.month}",
                    "PAYROLL_DUE",
                    "Payroll Due This Month",
                    f"Monthly payroll for {now.strftime('%B %Y')} has not been run yet. {emp_count} active employees.",
                    "WARNING", "/business/payroll",
                )

    # ── Upcoming vendor bill payments ─────────────────────────────────────────
    seven_days = now + timedelta(days=7)
    upcoming_pipeline = [
        {"$match": {"org_id": org_id, "status": {"$in": ["PENDING", "PARTIAL"]},
                    "due_date": {"$gte": now, "$lte": seven_days}}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "total": {"$sum": "$amount_due"}}},
    ]
    upcoming = [d async for d in db.biz_bills.aggregate(upcoming_pipeline)]
    if upcoming and upcoming[0]["count"] > 0:
        c, t = upcoming[0]["count"], upcoming[0]["total"]
        await _upsert(
            f"bills_due_{now.year}_{now.month}_{now.day // 7}",
            "PAYMENT_DUE",
            f"{c} Vendor Bill{'s' if c > 1 else ''} Due in 7 Days",
            f"₹{t:,.0f} due to vendors within the next 7 days.",
            "INFO", "/business/payables",
        )
