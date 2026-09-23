"""
Financial Statements Service — Phase 6.

Generates P&L and Balance Sheet directly from account balances
(which are updated by the journal entry engine).

P&L = Revenue accounts - Expense accounts
Balance Sheet = Assets vs Liabilities + Equity (+ retained earnings from P&L)

All calculations are deterministic — no AI involved.
"""
from datetime import datetime
from typing import Optional


# ── Account type routing ──────────────────────────────────────────────────────
_PNL_TYPES      = {"REVENUE", "EXPENSE"}
_BS_TYPES       = {"ASSET", "LIABILITY", "EQUITY"}
_REVENUE_TYPE   = "REVENUE"
_EXPENSE_TYPE   = "EXPENSE"
_ASSET_TYPE     = "ASSET"
_LIABILITY_TYPE = "LIABILITY"
_EQUITY_TYPE    = "EQUITY"


async def get_profit_and_loss(
    org_id: str, db,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> dict:
    """
    Generate P&L Statement from current account balances.
    Groups by account sub_type for readability.
    """
    now = datetime.utcnow()

    # Fetch all REVENUE and EXPENSE accounts
    cursor = db.accounts.find({
        "org_id": org_id,
        "account_type": {"$in": list(_PNL_TYPES)},
        "is_active": True,
    }).sort("code", 1)

    revenue_groups: dict[str, list] = {}
    expense_groups: dict[str, list] = {}
    total_revenue  = 0.0
    total_expenses = 0.0

    async for acc in cursor:
        balance = round(acc.get("current_balance", 0.0), 2)
        if balance == 0:
            continue
        entry = {
            "code":    acc["code"],
            "name":    acc["name"],
            "balance": balance,
        }
        sub = acc.get("account_sub_type", acc["account_type"])

        if acc["account_type"] == _REVENUE_TYPE:
            revenue_groups.setdefault(sub, []).append(entry)
            total_revenue  += balance
        elif acc["account_type"] == _EXPENSE_TYPE:
            expense_groups.setdefault(sub, []).append(entry)
            total_expenses += balance

    total_revenue  = round(total_revenue, 2)
    total_expenses = round(total_expenses, 2)
    net_profit     = round(total_revenue - total_expenses, 2)
    gross_profit   = round(
        total_revenue
        - sum(
            sum(e["balance"] for e in lines)
            for sub, lines in expense_groups.items()
            if sub == "COST_OF_GOODS"
        ),
        2,
    )

    return {
        "period_label":    "As of " + now.strftime("%d %b %Y"),
        "generated_at":    now.isoformat(),
        "revenue": {
            "groups":   revenue_groups,
            "total":    total_revenue,
        },
        "expenses": {
            "groups":   expense_groups,
            "total":    total_expenses,
        },
        "gross_profit":    gross_profit,
        "operating_profit": round(
            total_revenue
            - sum(
                sum(e["balance"] for e in lines)
                for sub, lines in expense_groups.items()
                if sub not in ("INTEREST_EXPENSE", "TAX_EXPENSE", "DEPRECIATION")
            ),
            2,
        ),
        "net_profit":      net_profit,
        "profit_margin_pct": round((net_profit / total_revenue * 100), 2) if total_revenue > 0 else 0.0,
    }


async def get_balance_sheet(org_id: str, db) -> dict:
    """
    Generate Balance Sheet from current account balances.
    Verifies: Total Assets = Total Liabilities + Total Equity (+ Net Profit)
    """
    now = datetime.utcnow()

    cursor = db.accounts.find({
        "org_id": org_id,
        "account_type": {"$in": list(_BS_TYPES)},
        "is_active": True,
    }).sort("code", 1)

    asset_groups:     dict[str, list] = {}
    liability_groups: dict[str, list] = {}
    equity_groups:    dict[str, list] = {}
    total_assets      = 0.0
    total_liabilities = 0.0
    total_equity      = 0.0

    async for acc in cursor:
        balance = round(acc.get("current_balance", 0.0), 2)
        if balance == 0:
            continue
        entry = {"code": acc["code"], "name": acc["name"], "balance": balance}
        sub   = acc.get("account_sub_type", acc["account_type"])

        if acc["account_type"] == _ASSET_TYPE:
            asset_groups.setdefault(sub, []).append(entry)
            total_assets += balance
        elif acc["account_type"] == _LIABILITY_TYPE:
            liability_groups.setdefault(sub, []).append(entry)
            total_liabilities += balance
        elif acc["account_type"] == _EQUITY_TYPE:
            equity_groups.setdefault(sub, []).append(entry)
            total_equity += balance

    # Add net profit to retained earnings
    pnl = await get_profit_and_loss(org_id, db)
    net_profit = pnl["net_profit"]
    if net_profit != 0:
        equity_groups.setdefault("RETAINED_EARNINGS", []).append({
            "code": "RE", "name": "Net Profit / (Loss) — Current Period",
            "balance": net_profit,
        })
        total_equity = round(total_equity + net_profit, 2)

    total_assets      = round(total_assets, 2)
    total_liabilities = round(total_liabilities, 2)
    total_equity      = round(total_equity, 2)
    total_l_plus_e    = round(total_liabilities + total_equity, 2)
    is_balanced       = abs(total_assets - total_l_plus_e) < 0.05

    return {
        "generated_at":       now.isoformat(),
        "assets": {
            "groups":          asset_groups,
            "total":           total_assets,
        },
        "liabilities": {
            "groups":          liability_groups,
            "total":           total_liabilities,
        },
        "equity": {
            "groups":          equity_groups,
            "total":           total_equity,
        },
        "total_liabilities_equity": total_l_plus_e,
        "is_balanced":         is_balanced,
        "balance_difference":  round(abs(total_assets - total_l_plus_e), 2),
    }


# ── Financial Ratios ──────────────────────────────────────────────────────────

async def get_financial_ratios(org_id: str, db) -> dict:
    """
    Compute key financial ratios from account balances.
    Every ratio includes a label, value, benchmark, and plain-English explanation.
    """
    # Fetch account balances grouped by sub_type
    cursor = db.accounts.find({"org_id": org_id, "is_active": True})
    sub_totals: dict[str, float] = {}
    type_totals: dict[str, float] = {}

    async for acc in cursor:
        bal  = acc.get("current_balance", 0.0)
        sub  = acc.get("account_sub_type", "")
        atype = acc.get("account_type", "")
        sub_totals[sub]   = round(sub_totals.get(sub, 0) + bal, 2)
        type_totals[atype] = round(type_totals.get(atype, 0) + bal, 2)

    # P&L for income statement ratios
    pnl = await get_profit_and_loss(org_id, db)
    revenue    = pnl["revenue"]["total"]
    expenses   = pnl["expenses"]["total"]
    net_profit = pnl["net_profit"]
    gross_profit = pnl["gross_profit"]

    # Balance sheet components
    current_assets  = round(
        sub_totals.get("CURRENT_ASSET", 0)
        + sub_totals.get("CASH", 0)
        + sub_totals.get("BANK", 0)
        + sub_totals.get("ACCOUNTS_RECEIVABLE", 0)
        + sub_totals.get("INVENTORY", 0),
        2,
    )
    current_liab    = round(
        sub_totals.get("CURRENT_LIABILITY", 0)
        + sub_totals.get("ACCOUNTS_PAYABLE", 0)
        + sub_totals.get("TAX_PAYABLE", 0),
        2,
    )
    cash            = round(sub_totals.get("CASH", 0) + sub_totals.get("BANK", 0), 2)
    inventory       = round(sub_totals.get("INVENTORY", 0), 2)
    total_assets    = round(type_totals.get("ASSET", 0), 2)
    total_equity    = round(type_totals.get("EQUITY", 0) + net_profit, 2)
    total_debt      = round(sub_totals.get("LOANS", 0) + sub_totals.get("LONG_TERM_LIABILITY", 0), 2)
    receivables     = round(sub_totals.get("ACCOUNTS_RECEIVABLE", 0), 2)
    payables        = round(sub_totals.get("ACCOUNTS_PAYABLE", 0), 2)

    def safe_div(a, b): return round(a / b, 2) if b != 0 else None
    def pct(a, b):      return round((a / b) * 100, 1) if b != 0 else None

    ratios = {
        # Liquidity
        "current_ratio": {
            "label":       "Current Ratio",
            "value":       safe_div(current_assets, current_liab),
            "benchmark":   "Ideal: >2.0",
            "category":    "Liquidity",
            "explanation": "Measures ability to pay short-term obligations. Higher is better.",
        },
        "quick_ratio": {
            "label":       "Quick Ratio (Acid Test)",
            "value":       safe_div(current_assets - inventory, current_liab),
            "benchmark":   "Ideal: >1.0",
            "category":    "Liquidity",
            "explanation": "Like current ratio but excludes inventory — a stricter liquidity test.",
        },
        "cash_ratio": {
            "label":       "Cash Ratio",
            "value":       safe_div(cash, current_liab),
            "benchmark":   "Acceptable: >0.5",
            "category":    "Liquidity",
            "explanation": "Most conservative liquidity measure — only counts cash.",
        },
        # Profitability
        "gross_margin": {
            "label":       "Gross Profit Margin",
            "value":       pct(gross_profit, revenue),
            "unit":        "%",
            "benchmark":   "Higher is better",
            "category":    "Profitability",
            "explanation": "Percentage of revenue remaining after direct costs.",
        },
        "net_margin": {
            "label":       "Net Profit Margin",
            "value":       pct(net_profit, revenue),
            "unit":        "%",
            "benchmark":   "Healthy: >10%",
            "category":    "Profitability",
            "explanation": "Overall profitability after all expenses.",
        },
        "roa": {
            "label":       "Return on Assets (ROA)",
            "value":       pct(net_profit, total_assets),
            "unit":        "%",
            "benchmark":   "Healthy: >5%",
            "category":    "Profitability",
            "explanation": "How efficiently assets are used to generate profit.",
        },
        "roe": {
            "label":       "Return on Equity (ROE)",
            "value":       pct(net_profit, total_equity),
            "unit":        "%",
            "benchmark":   "Healthy: >15%",
            "category":    "Profitability",
            "explanation": "Return generated for owners/shareholders.",
        },
        # Leverage
        "debt_to_equity": {
            "label":       "Debt-to-Equity",
            "value":       safe_div(total_debt, total_equity),
            "benchmark":   "Conservative: <1.0",
            "category":    "Leverage",
            "explanation": "How much debt is used relative to equity. Lower reduces financial risk.",
        },
        "debt_ratio": {
            "label":       "Debt Ratio",
            "value":       safe_div(total_debt, total_assets),
            "benchmark":   "Safe: <0.5",
            "category":    "Leverage",
            "explanation": "Proportion of assets financed by debt.",
        },
        # Efficiency
        "receivable_days": {
            "label":       "Receivable Days (DSO)",
            "value":       round(safe_div(receivables, revenue / 365), 0) if revenue > 0 else None,
            "unit":        "days",
            "benchmark":   "Lower is better (<45 days)",
            "category":    "Efficiency",
            "explanation": "Average days to collect payment after invoicing.",
        },
        "payable_days": {
            "label":       "Payable Days (DPO)",
            "value":       round(safe_div(payables, expenses / 365), 0) if expenses > 0 else None,
            "unit":        "days",
            "benchmark":   "Higher gives more cash flexibility",
            "category":    "Efficiency",
            "explanation": "Average days taken to pay vendors.",
        },
    }

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "ratios":       ratios,
        "data_note":    "Ratios calculated from current account balances. For period-specific analysis use date-range filters.",
    }
