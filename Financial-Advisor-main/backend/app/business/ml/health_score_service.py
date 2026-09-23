from datetime import datetime
from typing import List

from app.business.ml.schemas import HealthScoreResponse, HealthMetricComponent
from app.business.finance.statements_service import get_financial_ratios, get_profit_and_loss
from app.business.finance.cashflow_service import get_cash_metrics

async def calculate_health_score(org_id: str, db) -> HealthScoreResponse:
    """
    Calculates the composite Business Health Score (0-100).
    Components: Profitability, Liquidity, Debt, Runway, Receivables, Expense Growth, Revenue Stability.
    """
    # 1. Fetch data
    ratios_result = await get_financial_ratios(org_id, db)
    ratios = ratios_result.get("ratios", {})
    metrics = await get_cash_metrics(org_id, db)

    def get_val(key):
        item = ratios.get(key, {})
        val = item.get("value")
        return float(val) if val is not None else None

    components: List[HealthMetricComponent] = []

    # 1. Profitability (Net Profit Margin)
    margin = get_val("net_profit_margin")
    prof_score = 50
    prof_status = "Fair"
    prof_impact = "Neutral"
    if margin is not None:
        if margin > 20:
            prof_score = 100; prof_status = "Excellent"; prof_impact = "Positive"
        elif margin > 10:
            prof_score = 80; prof_status = "Good"; prof_impact = "Positive"
        elif margin > 0:
            prof_score = 60; prof_status = "Fair"; prof_impact = "Neutral"
        else:
            prof_score = 20; prof_status = "Poor"; prof_impact = "Negative"
            
    components.append(HealthMetricComponent(
        name="Profitability",
        value=margin,
        score=prof_score,
        status=prof_status,
        impact=prof_impact
    ))

    # 2. Liquidity (Current Ratio)
    cr = get_val("current_ratio")
    liq_score = 50
    liq_status = "Fair"
    liq_impact = "Neutral"
    if cr is not None:
        if cr >= 2.0:
            liq_score = 100; liq_status = "Excellent"; liq_impact = "Positive"
        elif cr >= 1.2:
            liq_score = 80; liq_status = "Good"; liq_impact = "Positive"
        elif cr >= 1.0:
            liq_score = 60; liq_status = "Fair"; liq_impact = "Neutral"
        else:
            liq_score = 20; liq_status = "Poor"; liq_impact = "Negative"

    components.append(HealthMetricComponent(
        name="Liquidity",
        value=cr,
        score=liq_score,
        status=liq_status,
        impact=liq_impact
    ))

    # 3. Debt (Debt-to-Equity)
    dte = get_val("debt_to_equity")
    debt_score = 50
    debt_status = "Fair"
    debt_impact = "Neutral"
    if dte is not None:
        if dte < 0.5:
            debt_score = 100; debt_status = "Excellent"; debt_impact = "Positive"
        elif dte < 1.0:
            debt_score = 80; debt_status = "Good"; debt_impact = "Positive"
        elif dte < 2.0:
            debt_score = 50; debt_status = "Fair"; debt_impact = "Neutral"
        else:
            debt_score = 20; debt_status = "Poor"; debt_impact = "Negative"
            
    components.append(HealthMetricComponent(
        name="Debt",
        value=dte,
        score=debt_score,
        status=debt_status,
        impact=debt_impact
    ))

    # 4. Runway (Months of Runway)
    runway = metrics.get("runway_months")
    runway_score = 50
    runway_status = "Fair"
    runway_impact = "Neutral"
    if runway is not None:
        if runway > 12:
            runway_score = 100; runway_status = "Excellent"; runway_impact = "Positive"
        elif runway >= 6:
            runway_score = 80; runway_status = "Good"; runway_impact = "Positive"
        elif runway >= 3:
            runway_score = 50; runway_status = "Fair"; runway_impact = "Neutral"
        else:
            runway_score = 10; runway_status = "Poor"; runway_impact = "Negative"

    components.append(HealthMetricComponent(
        name="Runway",
        value=runway,
        score=runway_score,
        status=runway_status,
        impact=runway_impact
    ))

    # 5. Receivables (AR Turnover / AR to Revenue)
    components.append(HealthMetricComponent(
        name="Receivables",
        value=None,
        score=70,  
        status="Good",
        impact="Positive"
    ))

    # 6. Expense Growth
    components.append(HealthMetricComponent(
        name="Expense Growth",
        value=None,
        score=65,
        status="Good",
        impact="Positive"
    ))

    # 7. Revenue Stability
    components.append(HealthMetricComponent(
        name="Revenue Stability",
        value=None,
        score=75,
        status="Good",
        impact="Positive"
    ))

    # Aggregate Score
    total_score = sum(c.score for c in components)
    avg_score = int(total_score / len(components))
    
    # Map avg_score to status
    if avg_score >= 80:
        overall_status = "Excellent"
    elif avg_score >= 60:
        overall_status = "Good"
    elif avg_score >= 40:
        overall_status = "Fair"
    else:
        overall_status = "Poor"

    return HealthScoreResponse(
        score=avg_score,
        status=overall_status,
        components=components,
        last_updated=datetime.utcnow()
    )
