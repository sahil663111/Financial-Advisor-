"""
Business Financial Health Score Service — Phase 6 completion.

Composite score 0–100 across 7 dimensions:
  Profitability  (20 pts): net margin
  Liquidity      (20 pts): current ratio
  Debt           (15 pts): debt-to-equity
  Cash Runway    (15 pts): months of runway
  Receivables    (10 pts): DSO — days sales outstanding
  Expense Growth (10 pts): MoM expense trend
  Revenue Stability (10 pts): revenue consistency

Each component is scored, weighted, and explained.
All calculations are deterministic — LLM only explains results.
"""
from datetime import datetime, timedelta
from typing import Optional


async def compute_business_health_score(org_id: str, db) -> dict:
    now = datetime.utcnow()
    three_months_ago = now - timedelta(days=90)
    six_months_ago   = now - timedelta(days=180)

    components: dict[str, dict] = {}

    # ── 1. Profitability (20 pts) ─────────────────────────────────────────────
    # Net margin = net_profit / revenue
    rev_pipeline = [
        {"$match": {"org_id": org_id, "account_type": "REVENUE", "is_active": True}},
        {"$group": {"_id": None, "total": {"$sum": "$current_balance"}}},
    ]
    exp_pipeline = [
        {"$match": {"org_id": org_id, "account_type": "EXPENSE", "is_active": True}},
        {"$group": {"_id": None, "total": {"$sum": "$current_balance"}}},
    ]
    rev_r  = [d async for d in db.accounts.aggregate(rev_pipeline)]
    exp_r  = [d async for d in db.accounts.aggregate(exp_pipeline)]
    revenue  = rev_r[0]["total"] if rev_r else 0.0
    expenses = exp_r[0]["total"] if exp_r else 0.0
    net_profit  = revenue - expenses
    net_margin  = (net_profit / revenue * 100) if revenue > 0 else 0.0

    if net_margin >= 20:
        prof_score, prof_note = 20, "Excellent net margin (≥20%)"
    elif net_margin >= 10:
        prof_score, prof_note = 15, "Healthy net margin (10–20%)"
    elif net_margin >= 0:
        prof_score, prof_note = 8,  "Positive but low net margin (<10%)"
    else:
        prof_score, prof_note = 0,  "Negative net margin — business losing money"

    components["profitability"] = {
        "score": prof_score, "max": 20,
        "value": round(net_margin, 1), "unit": "%",
        "label": "Net Profit Margin",
        "note": prof_note,
    }

    # ── 2. Liquidity (20 pts) ────────────────────────────────────────────────
    current_asset_subs = ["CURRENT_ASSET","CASH","BANK","ACCOUNTS_RECEIVABLE","INVENTORY"]
    current_liab_subs  = ["CURRENT_LIABILITY","ACCOUNTS_PAYABLE","TAX_PAYABLE"]

    ca_pipeline = [
        {"$match": {"org_id": org_id, "account_sub_type": {"$in": current_asset_subs}, "is_active": True}},
        {"$group": {"_id": None, "total": {"$sum": "$current_balance"}}},
    ]
    cl_pipeline = [
        {"$match": {"org_id": org_id, "account_sub_type": {"$in": current_liab_subs}, "is_active": True}},
        {"$group": {"_id": None, "total": {"$sum": "$current_balance"}}},
    ]
    ca_r = [d async for d in db.accounts.aggregate(ca_pipeline)]
    cl_r = [d async for d in db.accounts.aggregate(cl_pipeline)]
    current_assets = ca_r[0]["total"] if ca_r else 0.0
    current_liabs  = cl_r[0]["total"] if cl_r else 0.0
    current_ratio  = round(current_assets / current_liabs, 2) if current_liabs > 0 else None

    if current_ratio is None or current_ratio >= 2.0:
        liq_score, liq_note = 20, "Strong liquidity (current ratio ≥2.0)"
    elif current_ratio >= 1.5:
        liq_score, liq_note = 15, "Good liquidity (current ratio 1.5–2.0)"
    elif current_ratio >= 1.0:
        liq_score, liq_note = 8,  "Adequate liquidity (current ratio 1.0–1.5)"
    else:
        liq_score, liq_note = 0,  "Poor liquidity — current assets below current liabilities"

    components["liquidity"] = {
        "score": liq_score, "max": 20,
        "value": current_ratio, "unit": "x",
        "label": "Current Ratio",
        "note": liq_note,
    }

    # ── 3. Debt (15 pts) ─────────────────────────────────────────────────────
    debt_subs = ["LOANS","LONG_TERM_LIABILITY"]
    eq_pipeline = [
        {"$match": {"org_id": org_id, "account_type": "EQUITY", "is_active": True}},
        {"$group": {"_id": None, "total": {"$sum": "$current_balance"}}},
    ]
    debt_pipeline = [
        {"$match": {"org_id": org_id, "account_sub_type": {"$in": debt_subs}, "is_active": True}},
        {"$group": {"_id": None, "total": {"$sum": "$current_balance"}}},
    ]
    eq_r   = [d async for d in db.accounts.aggregate(eq_pipeline)]
    debt_r = [d async for d in db.accounts.aggregate(debt_pipeline)]
    equity     = (eq_r[0]["total"] if eq_r else 0.0) + net_profit
    total_debt = debt_r[0]["total"] if debt_r else 0.0
    de_ratio   = round(total_debt / equity, 2) if equity > 0 else None

    if de_ratio is None or de_ratio < 0.3:
        debt_score, debt_note = 15, "Very low leverage (D/E <0.3)"
    elif de_ratio < 0.7:
        debt_score, debt_note = 12, "Conservative leverage (D/E 0.3–0.7)"
    elif de_ratio < 1.5:
        debt_score, debt_note = 7,  "Moderate leverage (D/E 0.7–1.5)"
    elif de_ratio < 3.0:
        debt_score, debt_note = 3,  "High leverage (D/E 1.5–3.0) — monitor debt burden"
    else:
        debt_score, debt_note = 0,  "Very high leverage (D/E >3.0) — significant financial risk"

    components["debt"] = {
        "score": debt_score, "max": 15,
        "value": de_ratio, "unit": "x",
        "label": "Debt-to-Equity Ratio",
        "note": debt_note,
    }

    # ── 4. Cash Runway (15 pts) ──────────────────────────────────────────────
    cash_accounts = await db.accounts.find(
        {"org_id": org_id, "account_sub_type": {"$in": ["CASH","BANK"]}, "is_active": True}
    ).to_list(length=None)
    cash_balance = sum(a.get("current_balance", 0) for a in cash_accounts)

    # Burn rate from last 3 months of approved expenses
    burn_pipeline = [
        {"$match": {"org_id": org_id, "approval_status": "APPROVED",
                    "date": {"$gte": three_months_ago}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    burn_r = [d async for d in db.biz_expenses.aggregate(burn_pipeline)]
    monthly_burn = round((burn_r[0]["total"] / 3), 2) if burn_r else 0.0
    runway = round(cash_balance / monthly_burn, 1) if monthly_burn > 0 else None

    if runway is None or runway >= 12:
        run_score, run_note = 15, "Excellent runway (≥12 months)"
    elif runway >= 6:
        run_score, run_note = 11, "Comfortable runway (6–12 months)"
    elif runway >= 3:
        run_score, run_note = 6,  "Adequate runway (3–6 months) — plan for more capital"
    elif runway >= 1:
        run_score, run_note = 2,  "Short runway (<3 months) — urgent action needed"
    else:
        run_score, run_note = 0,  "Critical — cash reserves depleted or negative"

    components["cash_runway"] = {
        "score": run_score, "max": 15,
        "value": runway, "unit": "months",
        "label": "Cash Runway",
        "note": run_note,
    }

    # ── 5. Receivables Health (10 pts) ───────────────────────────────────────
    rec_pipeline = [
        {"$match": {"org_id": org_id, "status": {"$in": ["SENT","PARTIALLY_PAID","OVERDUE"]}}},
        {"$group": {"_id": None, "total_due": {"$sum": "$amount_due"},
                    "overdue_count": {"$sum": {"$cond": [{"$eq": ["$status","OVERDUE"]}, 1, 0]}},
                    "total_count": {"$sum": 1}}},
    ]
    rec_r = [d async for d in db.biz_invoices.aggregate(rec_pipeline)]
    total_receivables = rec_r[0]["total_due"] if rec_r else 0.0
    overdue_count     = rec_r[0]["overdue_count"] if rec_r else 0
    total_inv_count   = rec_r[0]["total_count"] if rec_r else 0
    overdue_pct       = (overdue_count / total_inv_count * 100) if total_inv_count > 0 else 0

    if overdue_pct == 0:
        rec_score, rec_note = 10, "Excellent — no overdue invoices"
    elif overdue_pct < 10:
        rec_score, rec_note = 8,  f"Good — {overdue_pct:.0f}% of invoices overdue"
    elif overdue_pct < 25:
        rec_score, rec_note = 5,  f"Moderate — {overdue_pct:.0f}% of invoices overdue"
    elif overdue_pct < 50:
        rec_score, rec_note = 2,  f"Poor — {overdue_pct:.0f}% of invoices overdue, collection needed"
    else:
        rec_score, rec_note = 0,  f"Critical — {overdue_pct:.0f}% of invoices overdue"

    components["receivables"] = {
        "score": rec_score, "max": 10,
        "value": round(overdue_pct, 1), "unit": "% overdue",
        "label": "Receivables Health",
        "note": rec_note,
    }

    # ── 6. Expense Growth (10 pts) ───────────────────────────────────────────
    # Compare last 3 months vs previous 3 months
    exp_recent_pipeline = [
        {"$match": {"org_id": org_id, "approval_status": "APPROVED",
                    "date": {"$gte": three_months_ago}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    exp_prior_pipeline = [
        {"$match": {"org_id": org_id, "approval_status": "APPROVED",
                    "date": {"$gte": six_months_ago, "$lt": three_months_ago}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    recent_r = [d async for d in db.biz_expenses.aggregate(exp_recent_pipeline)]
    prior_r  = [d async for d in db.biz_expenses.aggregate(exp_prior_pipeline)]
    recent_exp = recent_r[0]["total"] if recent_r else 0.0
    prior_exp  = prior_r[0]["total"] if prior_r else 0.0
    exp_growth = ((recent_exp - prior_exp) / prior_exp * 100) if prior_exp > 0 else 0.0

    if exp_growth <= 0:
        expg_score, expg_note = 10, "Expenses decreasing or stable — efficient cost management"
    elif exp_growth <= 5:
        expg_score, expg_note = 8,  f"Expenses growing modestly ({exp_growth:.1f}%)"
    elif exp_growth <= 15:
        expg_score, expg_note = 5,  f"Expenses growing ({exp_growth:.1f}%) — watch cost trajectory"
    elif exp_growth <= 30:
        expg_score, expg_note = 2,  f"Expenses growing rapidly ({exp_growth:.1f}%) — review spending"
    else:
        expg_score, expg_note = 0,  f"Expenses surging ({exp_growth:.1f}%) — immediate cost review needed"

    components["expense_growth"] = {
        "score": expg_score, "max": 10,
        "value": round(exp_growth, 1), "unit": "%",
        "label": "Expense Growth (3M vs prior 3M)",
        "note": expg_note,
    }

    # ── 7. Revenue Stability (10 pts) ────────────────────────────────────────
    # Check monthly revenue consistency over last 6 months
    rev_monthly_pipeline = [
        {"$match": {"org_id": org_id, "status": {"$nin": ["CANCELLED","DRAFT"]},
                    "issue_date": {"$gte": six_months_ago}}},
        {"$group": {
            "_id": {"y": {"$year": "$issue_date"}, "m": {"$month": "$issue_date"}},
            "total": {"$sum": "$subtotal"},
        }},
        {"$sort": {"_id.y": 1, "_id.m": 1}},
    ]
    rev_months = [d async for d in db.biz_invoices.aggregate(rev_monthly_pipeline)]
    if len(rev_months) >= 3:
        import numpy as np
        rev_vals   = [m["total"] for m in rev_months]
        rev_mean   = sum(rev_vals) / len(rev_vals)
        rev_std    = (sum((v - rev_mean) ** 2 for v in rev_vals) / len(rev_vals)) ** 0.5
        cv         = (rev_std / rev_mean * 100) if rev_mean > 0 else 100
        if cv <= 10:
            rev_score, rev_note = 10, "Very stable revenue (CV ≤10%)"
        elif cv <= 25:
            rev_score, rev_note = 7,  f"Moderately stable revenue (CV {cv:.0f}%)"
        elif cv <= 50:
            rev_score, rev_note = 4,  f"Variable revenue (CV {cv:.0f}%) — focus on recurring contracts"
        else:
            rev_score, rev_note = 1,  f"Highly variable revenue (CV {cv:.0f}%) — high business risk"
    else:
        rev_score, rev_note = 5, "Insufficient data for revenue stability analysis"
        cv = None

    components["revenue_stability"] = {
        "score": rev_score, "max": 10,
        "value": round(cv, 1) if cv is not None else None, "unit": "% CV",
        "label": "Revenue Stability (6M)",
        "note": rev_note,
    }

    # ── Total score ───────────────────────────────────────────────────────────
    total_score = sum(c["score"] for c in components.values())
    total_max   = sum(c["max"]   for c in components.values())
    pct_score   = round((total_score / total_max) * 100)

    if pct_score >= 80:
        grade, summary = "A", "Excellent financial health"
    elif pct_score >= 65:
        grade, summary = "B", "Good financial health with some areas to improve"
    elif pct_score >= 50:
        grade, summary = "C", "Moderate financial health — several areas need attention"
    elif pct_score >= 35:
        grade, summary = "D", "Below average financial health — action required"
    else:
        grade, summary = "F", "Poor financial health — urgent remediation needed"

    # Identify top 2 strengths and top 2 risks
    ranked = sorted(
        [(k, v) for k, v in components.items()],
        key=lambda x: x[1]["score"] / x[1]["max"],
        reverse=True,
    )
    strengths = [f"{v['label']}: {v['note']}" for k, v in ranked[:2] if v["score"] / v["max"] >= 0.7]
    risks     = [f"{v['label']}: {v['note']}" for k, v in ranked[-2:] if v["score"] / v["max"] < 0.5]

    result = {
        "score":        total_score,
        "max_score":    total_max,
        "pct_score":    pct_score,
        "grade":        grade,
        "summary":      summary,
        "components":   components,
        "strengths":    strengths,
        "risks":        risks,
        "data_snapshot": {
            "revenue":        round(revenue, 2),
            "net_profit":     round(net_profit, 2),
            "net_margin_pct": round(net_margin, 1),
            "cash_balance":   round(cash_balance, 2),
            "monthly_burn":   round(monthly_burn, 2),
            "runway_months":  runway,
        },
        "generated_at": now.isoformat(),
    }

    # Save to history
    await db.biz_health_scores.insert_one({
        "org_id":     org_id,
        "score":      total_score,
        "pct_score":  pct_score,
        "grade":      grade,
        "components": {k: {"score": v["score"], "max": v["max"]} for k, v in components.items()},
        "computed_at": now,
    })

    return result


async def get_health_history(org_id: str, db, limit: int = 12) -> list[dict]:
    cursor = db.biz_health_scores.find(
        {"org_id": org_id}
    ).sort("computed_at", -1).limit(limit)
    history = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        history.append(doc)
    return list(reversed(history))
