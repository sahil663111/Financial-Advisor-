from datetime import datetime
from typing import List

from app.business.ml.schemas import CreditRiskResponse
from app.business.finance.statements_service import get_financial_ratios
from app.business.finance.cashflow_service import get_cash_metrics

async def calculate_credit_risk(org_id: str, db) -> CreditRiskResponse:
    """
    Calculates a v1 'Predicted Business Credit Risk Indicator'.
    Uses a weighted scoring model based on financial ratios and cash flow metrics.
    Output scale: 0 to 1000.
    """
    # 1. Fetch required data
    ratios_result = await get_financial_ratios(org_id, db)
    ratios = ratios_result.get("ratios", {})
    metrics = await get_cash_metrics(org_id, db)

    score = 500  # Base score
    positive_factors: List[str] = []
    risk_factors: List[str] = []

    # Helper function to parse ratio values which might be None
    def get_val(key):
        item = ratios.get(key, {})
        val = item.get("value")
        return float(val) if val is not None else None

    # --- Feature 1: Liquidity (Current Ratio) ---
    current_ratio = get_val("current_ratio")
    if current_ratio is not None:
        if current_ratio >= 2.0:
            score += 100
            positive_factors.append(f"Strong liquidity (Current Ratio: {current_ratio}) indicates excellent ability to cover short-term obligations.")
        elif current_ratio >= 1.0:
            score += 40
        else:
            score -= 100
            risk_factors.append(f"Poor liquidity (Current Ratio: {current_ratio}) suggests potential difficulty paying short-term liabilities.")

    # --- Feature 2: Leverage (Debt-to-Equity) ---
    debt_equity = get_val("debt_to_equity")
    if debt_equity is not None:
        if debt_equity < 0.5:
            score += 100
            positive_factors.append(f"Low leverage (Debt-to-Equity: {debt_equity}) indicates conservative financing and lower risk.")
        elif debt_equity > 2.0:
            score -= 100
            risk_factors.append(f"High leverage (Debt-to-Equity: {debt_equity}) increases financial risk in downturns.")

    # --- Feature 3: Profitability (Net Margin) ---
    net_margin = get_val("net_margin")
    if net_margin is not None:
        if net_margin > 15.0:
            score += 150
            positive_factors.append(f"Excellent profitability (Net Margin: {net_margin}%) shows strong bottom-line generation.")
        elif net_margin > 0.0:
            score += 50
            positive_factors.append(f"Positive profitability (Net Margin: {net_margin}%).")
        else:
            score -= 150
            risk_factors.append(f"Negative profitability (Net Margin: {net_margin}%) severely impacts creditworthiness.")

    # --- Feature 4: Efficiency (Receivable Days) ---
    rec_days = get_val("receivable_days")
    if rec_days is not None:
        if rec_days < 30:
            score += 50
            positive_factors.append("Fast collection of receivables (<30 days) improves cash flow reliability.")
        elif rec_days > 90:
            score -= 50
            risk_factors.append(f"Slow collection of receivables ({rec_days} days) risks cash flow crunches.")

    # --- Feature 5: Runway ---
    runway = metrics.get("runway_months", 0.0)
    if runway >= 12.0:
        score += 100
        positive_factors.append(f"Very strong cash runway ({runway} months) provides significant operational safety.")
    elif runway >= 6.0:
        score += 50
    elif runway > 0 and runway < 3.0:
        score -= 100
        risk_factors.append(f"Critically short cash runway ({runway} months) indicates high default risk.")

    # Normalize score to 0 - 1000
    score = max(0, min(1000, score))

    if score >= 750:
        category = "Low Risk"
    elif score >= 500:
        category = "Medium Risk"
    else:
        category = "High Risk"

    # Save to db for history
    doc = {
        "org_id": org_id,
        "score": score,
        "category": category,
        "positive_factors": positive_factors,
        "risk_factors": risk_factors,
        "created_at": datetime.utcnow()
    }
    await db.credit_risk.insert_one(doc)

    return CreditRiskResponse(
        score=score,
        risk_category=category,
        positive_factors=positive_factors,
        risk_factors=risk_factors,
        last_updated=datetime.utcnow()
    )
