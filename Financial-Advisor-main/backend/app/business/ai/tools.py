"""
AI Tool Registry for the Business Virtual CFO.
These functions fetch real business data and feed it to Gemini.
Every tool returns a plain dict — the LLM explains it, never invents it.
"""
from datetime import datetime
from typing import Dict, Any

from app.database import get_db
from app.business.finance.statements_service import (
    get_profit_and_loss,
    get_balance_sheet,
    get_financial_ratios,
)
from app.business.finance.cashflow_service import get_cash_flow, get_cash_metrics
from app.business.ml.forecasting_service import generate_cashflow_forecast
from app.business.ml.anomaly_service import fetch_unresolved_anomalies
from app.business.ml.credit_risk_service import calculate_credit_risk


async def tool_get_financial_summary(org_id: str) -> Dict[str, Any]:
    """High-level executive summary: revenue, expenses, profit, cash, burn, runway."""
    db = get_db()
    try:
        pnl     = await get_profit_and_loss(org_id, db)
        metrics = await get_cash_metrics(org_id, db)
        return {
            "total_revenue_inr":     pnl.get("revenue", {}).get("total", 0),
            "total_expenses_inr":    pnl.get("expenses", {}).get("total", 0),
            "net_profit_inr":        pnl.get("net_profit", 0),
            "gross_profit_inr":      pnl.get("gross_profit", 0),
            "profit_margin_pct":     pnl.get("profit_margin_pct", 0),
            "current_cash_balance_inr": metrics.get("cash_balance", 0),
            "monthly_burn_rate_inr": metrics.get("burn_rate", 0),
            "cash_runway_months":    metrics.get("runway_months"),
            "runway_label":          metrics.get("runway_label", "—"),
        }
    except Exception as e:
        return {"error": str(e)}


async def tool_get_financial_ratios(org_id: str) -> Dict[str, Any]:
    """Liquidity, profitability, leverage and efficiency ratios with plain-English explanations."""
    db = get_db()
    try:
        result = await get_financial_ratios(org_id, db)
        ratios = result.get("ratios", {})
        return {
            key: {
                "label":       r["label"],
                "value":       r["value"],
                "unit":        r.get("unit", ""),
                "benchmark":   r["benchmark"],
                "explanation": r["explanation"],
                "category":    r["category"],
            }
            for key, r in ratios.items()
        }
    except Exception as e:
        return {"error": str(e)}


async def tool_get_cashflow(org_id: str) -> Dict[str, Any]:
    """Cash Flow Statement — operating, investing, financing, net change, free cash flow."""
    db = get_db()
    try:
        now = datetime.utcnow()
        fy_start_year = now.year if now.month >= 4 else now.year - 1
        start = datetime(fy_start_year, 4, 1)
        cf = await get_cash_flow(org_id, db, start, now)
        return {
            "period":                  f"FY {fy_start_year}–{fy_start_year + 1}",
            "opening_cash":            cf.get("opening_cash", 0),
            "closing_cash":            cf.get("closing_cash", 0),
            "operating_net":           cf.get("operating", {}).get("net", 0),
            "investing_net":           cf.get("investing", {}).get("net", 0),
            "financing_net":           cf.get("financing", {}).get("net", 0),
            "net_cash_flow":           cf.get("net_cash_flow", 0),
            "free_cash_flow":          cf.get("free_cash_flow", 0),
        }
    except Exception as e:
        return {"error": str(e)}


async def tool_get_balance_sheet(org_id: str) -> Dict[str, Any]:
    """Balance Sheet — total assets, liabilities, equity, and is_balanced flag."""
    db = get_db()
    try:
        bs = await get_balance_sheet(org_id, db)
        # Flatten asset sub-groups into readable totals
        def _group_totals(groups: dict) -> dict:
            return {sub: sum(a["balance"] for a in items) for sub, items in groups.items()}

        return {
            "total_assets":         bs["assets"]["total"],
            "total_liabilities":    bs["liabilities"]["total"],
            "total_equity":         bs["equity"]["total"],
            "is_balanced":          bs["is_balanced"],
            "asset_breakdown":      _group_totals(bs["assets"].get("groups", {})),
            "liability_breakdown":  _group_totals(bs["liabilities"].get("groups", {})),
            "equity_breakdown":     _group_totals(bs["equity"].get("groups", {})),
        }
    except Exception as e:
        return {"error": str(e)}


async def tool_get_ml_forecast(org_id: str) -> Dict[str, Any]:
    """3-month ML forecast for revenue, expenses, and net cash flow."""
    db = get_db()
    try:
        fc = await generate_cashflow_forecast(org_id, db, 12, 3)
        return {
            "model":            "Linear Trend (v1)",
            "forecast_months":  3,
            "revenue_forecast": [
                {"date": p.date, "forecast": p.forecast_value,
                 "lower": p.lower_bound, "upper": p.upper_bound}
                for p in fc.revenue_forecast if p.forecast_value is not None
            ],
            "expense_forecast": [
                {"date": p.date, "forecast": p.forecast_value}
                for p in fc.expense_forecast if p.forecast_value is not None
            ],
            "net_cash_forecast": [
                {"date": p.date, "forecast": p.forecast_value}
                for p in fc.net_cash_forecast if p.forecast_value is not None
            ],
            "disclaimer": "Forecast based on linear trend model. Actual results may differ.",
        }
    except Exception as e:
        return {"error": str(e)}


async def tool_get_credit_risk(org_id: str) -> Dict[str, Any]:
    """Predicted Business Credit Risk Indicator (0–1000 scale)."""
    db = get_db()
    try:
        cr = await calculate_credit_risk(org_id, db)
        return {
            "score":            cr.score,
            "category":         cr.risk_category,
            "positive_factors": cr.positive_factors,
            "risk_factors":     cr.risk_factors,
            "disclaimer":       "This is an estimated risk indicator, not an official credit score.",
        }
    except Exception as e:
        return {"error": str(e)}


async def tool_get_expense_anomalies(org_id: str) -> Dict[str, Any]:
    """Unusual expenses flagged by anomaly detection (Z-score > 2.5σ)."""
    db = get_db()
    try:
        anomalies = await fetch_unresolved_anomalies(org_id, db)
        if not anomalies:
            return {"message": "No anomalies detected in recent expenses.", "count": 0}
        return {
            "count": len(anomalies),
            "anomalies": [
                {
                    "date":        a.date.strftime("%Y-%m-%d") if a.date else "unknown",
                    "amount_inr":  a.amount,
                    "category":    a.category,
                    "description": a.description,
                    "severity":    a.severity,
                    "reason":      a.reason,
                }
                for a in anomalies
            ],
        }
    except Exception as e:
        return {"error": str(e)}


# ── Tool registry ─────────────────────────────────────────────────────────────
TOOL_FUNCTIONS: dict = {
    "get_financial_summary":  tool_get_financial_summary,
    "get_financial_ratios":   tool_get_financial_ratios,
    "get_cashflow":           tool_get_cashflow,
    "get_balance_sheet":      tool_get_balance_sheet,
    "get_ml_forecast":        tool_get_ml_forecast,
    "get_credit_risk":        tool_get_credit_risk,
    "get_expense_anomalies":  tool_get_expense_anomalies,
}

TOOL_DEFINITIONS = [
    {
        "name": "get_financial_summary",
        "description": (
            "Get a high-level executive financial summary: total revenue, expenses, net profit, "
            "gross profit, profit margin, current cash balance, monthly burn rate, and cash runway."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_financial_ratios",
        "description": (
            "Get calculated financial ratios including liquidity (current ratio, quick ratio, cash ratio), "
            "profitability (gross margin, net margin, ROA, ROE), leverage (debt-to-equity, debt ratio), "
            "and efficiency (receivable days, payable days). Each includes a value, benchmark, and explanation."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_cashflow",
        "description": (
            "Get the Cash Flow Statement for the current financial year: operating, investing, "
            "financing cash flows, net cash flow, and free cash flow."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_balance_sheet",
        "description": (
            "Get the Balance Sheet showing total assets, liabilities, equity, "
            "and sub-category breakdowns. Includes is_balanced flag."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_ml_forecast",
        "description": (
            "Get the 3-month ML forecast for revenue, expenses, and net cash flow. "
            "Uses a linear trend model on historical journal data."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_credit_risk",
        "description": (
            "Get the Predicted Business Credit Risk Indicator (0–1000 scale) with "
            "positive factors and risk factors. Not an official credit score."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_expense_anomalies",
        "description": (
            "Get the list of unusual or anomalous expenses flagged by the ML anomaly "
            "detection system (Z-score > 2.5 standard deviations above category average)."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
]
