from datetime import datetime
from typing import List, Tuple
import pandas as pd
import numpy as np
from dateutil.relativedelta import relativedelta

from app.business.ml.schemas import ForecastDataPoint, ForecastResponse, ScenarioRequest

async def fetch_monthly_history(org_id: str, db, months_back: int = 12) -> pd.DataFrame:
    """
    Fetches the historical revenue and expense totals grouped by month.
    """
    now = datetime.utcnow()
    start_date = now - relativedelta(months=months_back)
    start_date = start_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # We need to aggregate journal entries matching REVENUE or EXPENSE
    pipeline = [
        {"$match": {
            "org_id": org_id,
            "status": "POSTED",
            "date": {"$gte": start_date}
        }},
        {"$unwind": "$lines"},
        {
            "$lookup": {
                "from": "accounts",
                "let": {"code": "$lines.account_code", "org": "$org_id"},
                "pipeline": [
                    {"$match": {
                        "$expr": {
                            "$and": [
                                {"$eq": ["$org_id", "$$org"]},
                                {"$eq": ["$code", "$$code"]}
                            ]
                        }
                    }},
                    {"$project": {"account_type": 1}},
                ],
                "as": "account_info"
            }
        },
        {"$unwind": "$account_info"},
        {"$match": {
            "account_info.account_type": {"$in": ["REVENUE", "EXPENSE"]}
        }},
        {
            "$project": {
                "month_year": {"$dateToString": {"format": "%Y-%m", "date": "$date"}},
                "account_type": "$account_info.account_type",
                "debit": "$lines.debit",
                "credit": "$lines.credit"
            }
        },
        {
            "$group": {
                "_id": {
                    "month_year": "$month_year",
                    "account_type": "$account_type"
                },
                "total_debit": {"$sum": "$debit"},
                "total_credit": {"$sum": "$credit"}
            }
        }
    ]

    raw_data = [doc async for doc in db.journal_entries.aggregate(pipeline)]

    # Transform to a flat structure
    records = []
    for doc in raw_data:
        m_y = doc["_id"]["month_year"]
        acc_type = doc["_id"]["account_type"]
        # Revenue is credit normal, Expense is debit normal
        amount = 0.0
        if acc_type == "REVENUE":
            amount = doc["total_credit"] - doc["total_debit"]
        elif acc_type == "EXPENSE":
            amount = doc["total_debit"] - doc["total_credit"]
        
        records.append({
            "month": m_y,
            "type": acc_type,
            "amount": amount
        })

    if not records:
        # Return empty DF
        return pd.DataFrame(columns=["month", "type", "amount"])

    df = pd.DataFrame(records)
    # Pivot to have Revenue and Expense as columns
    df_pivot = df.pivot_table(index="month", columns="type", values="amount", aggfunc="sum", fill_value=0.0).reset_index()
    
    # Ensure both columns exist
    if "REVENUE" not in df_pivot.columns:
        df_pivot["REVENUE"] = 0.0
    if "EXPENSE" not in df_pivot.columns:
        df_pivot["EXPENSE"] = 0.0

    df_pivot.sort_values("month", inplace=True)
    return df_pivot

def compute_forecast(series: pd.Series, periods: int = 3) -> Tuple[List[float], List[float], List[float]]:
    """
    Computes a simple linear trend forecast using numpy.polyfit.
    Returns lists for (predictions, lower_bounds, upper_bounds).
    """
    y = series.values
    n = len(y)
    
    if n < 2:
        # Not enough data, just project the last value or 0
        val = y[-1] if n == 1 else 0.0
        return [val]*periods, [val*0.9]*periods, [val*1.1]*periods

    x = np.arange(n)
    coeffs = np.polyfit(x, y, 1)  # Linear fit: y = mx + c
    
    # Calculate historical standard deviation of residuals for confidence bounds
    residuals = y - (coeffs[0] * x + coeffs[1])
    std_resid = np.std(residuals) if n > 2 else y.mean() * 0.1

    preds, lowers, uppers = [], [], []
    for i in range(periods):
        future_x = n + i
        pred_y = max(0.0, float(coeffs[0] * future_x + coeffs[1]))
        preds.append(pred_y)
        lowers.append(max(0.0, pred_y - 1.96 * std_resid))
        uppers.append(pred_y + 1.96 * std_resid)
        
    return preds, lowers, uppers

async def generate_cashflow_forecast(org_id: str, db, months_back: int = 12, forecast_months: int = 3) -> ForecastResponse:
    """
    Fetches historical data, runs the forecasting model, and returns a formatted ForecastResponse.
    Saves the forecast to the DB for persistence.
    """
    df = await fetch_monthly_history(org_id, db, months_back)

    # Initialize response structures
    rev_forecast, exp_forecast, net_forecast = [], [], []

    if df.empty:
        # Return empty/zero baseline
        return ForecastResponse(
            revenue_forecast=[],
            expense_forecast=[],
            net_cash_forecast=[],
            last_updated=datetime.utcnow()
        )

    # Prepare historical data points
    for _, row in df.iterrows():
        month_str = row["month"]
        rev_val = float(row["REVENUE"])
        exp_val = float(row["EXPENSE"])
        net_val = rev_val - exp_val
        
        rev_forecast.append(ForecastDataPoint(date=month_str, actual_value=rev_val))
        exp_forecast.append(ForecastDataPoint(date=month_str, actual_value=exp_val))
        net_forecast.append(ForecastDataPoint(date=month_str, actual_value=net_val))

    # Compute forecasts
    rev_preds, rev_lows, rev_highs = compute_forecast(df["REVENUE"], forecast_months)
    exp_preds, exp_lows, exp_highs = compute_forecast(df["EXPENSE"], forecast_months)

    # Determine future month strings
    last_month_str = df["month"].iloc[-1]
    last_date = datetime.strptime(last_month_str, "%Y-%m")
    
    for i in range(forecast_months):
        future_date = last_date + relativedelta(months=i+1)
        future_str = future_date.strftime("%Y-%m")
        
        rev_forecast.append(ForecastDataPoint(
            date=future_str, 
            forecast_value=rev_preds[i],
            lower_bound=rev_lows[i],
            upper_bound=rev_highs[i]
        ))
        
        exp_forecast.append(ForecastDataPoint(
            date=future_str, 
            forecast_value=exp_preds[i],
            lower_bound=exp_lows[i],
            upper_bound=exp_highs[i]
        ))
        
        net_pred = rev_preds[i] - exp_preds[i]
        # Net cash can be negative, bounds are approximated
        net_low = rev_lows[i] - exp_highs[i]
        net_high = rev_highs[i] - exp_lows[i]
        
        net_forecast.append(ForecastDataPoint(
            date=future_str, 
            forecast_value=net_pred,
            lower_bound=net_low,
            upper_bound=net_high
        ))

    response = ForecastResponse(
        revenue_forecast=rev_forecast,
        expense_forecast=exp_forecast,
        net_cash_forecast=net_forecast,
        last_updated=datetime.utcnow()
    )
    
    # Save a snapshot to the database
    await db.forecasts.insert_one({
        "org_id": org_id,
        "forecast_type": "CASHFLOW_REVENUE_EXPENSE",
        "data": response.model_dump(),
        "created_at": datetime.utcnow()
    })

    return response

async def simulate_scenario(org_id: str, db, req: ScenarioRequest, months_back: int = 12, forecast_months: int = 3) -> ForecastResponse:
    """
    Runs a scenario simulation by applying modifiers to the historical baseline before forecasting.
    Does NOT save to DB.
    """
    df = await fetch_monthly_history(org_id, db, months_back)

    if df.empty:
        return ForecastResponse(
            revenue_forecast=[],
            expense_forecast=[],
            net_cash_forecast=[],
            last_updated=datetime.utcnow()
        )

    # Apply scenario modifiers to history
    rev_multiplier = 1.0 + (req.revenue_change_pct / 100.0)
    exp_multiplier = 1.0 + (req.expense_change_pct / 100.0)
    fixed_cost = req.new_fixed_cost_monthly

    df["REVENUE"] = df["REVENUE"] * rev_multiplier
    df["EXPENSE"] = (df["EXPENSE"] * exp_multiplier) + fixed_cost

    rev_forecast, exp_forecast, net_forecast = [], [], []

    # Historical data points (now simulated)
    for _, row in df.iterrows():
        month_str = row["month"]
        rev_val = float(row["REVENUE"])
        exp_val = float(row["EXPENSE"])
        net_val = rev_val - exp_val
        
        rev_forecast.append(ForecastDataPoint(date=month_str, actual_value=rev_val))
        exp_forecast.append(ForecastDataPoint(date=month_str, actual_value=exp_val))
        net_forecast.append(ForecastDataPoint(date=month_str, actual_value=net_val))

    # Compute forecasts
    rev_preds, rev_lows, rev_highs = compute_forecast(df["REVENUE"], forecast_months)
    exp_preds, exp_lows, exp_highs = compute_forecast(df["EXPENSE"], forecast_months)

    last_month_str = df["month"].iloc[-1]
    last_date = datetime.strptime(last_month_str, "%Y-%m")
    
    for i in range(forecast_months):
        future_date = last_date + relativedelta(months=i+1)
        future_str = future_date.strftime("%Y-%m")
        
        rev_forecast.append(ForecastDataPoint(
            date=future_str, 
            forecast_value=rev_preds[i],
            lower_bound=rev_lows[i],
            upper_bound=rev_highs[i]
        ))
        
        exp_forecast.append(ForecastDataPoint(
            date=future_str, 
            forecast_value=exp_preds[i],
            lower_bound=exp_lows[i],
            upper_bound=exp_highs[i]
        ))
        
        net_pred = rev_preds[i] - exp_preds[i]
        net_low = rev_lows[i] - exp_highs[i]
        net_high = rev_highs[i] - exp_lows[i]
        
        net_forecast.append(ForecastDataPoint(
            date=future_str, 
            forecast_value=net_pred,
            lower_bound=net_low,
            upper_bound=net_high
        ))

    return ForecastResponse(
        revenue_forecast=rev_forecast,
        expense_forecast=exp_forecast,
        net_cash_forecast=net_forecast,
        last_updated=datetime.utcnow()
    )
