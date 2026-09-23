"""
Cash Flow Service — Phase 6.

Computes cash flow from actual accounting data (journal entries + account balances).

Three sections:
  Operating  → Revenue collections, expense payments, tax payments, payroll
  Investing  → Fixed asset purchases/sales (account type = FIXED_ASSET)
  Financing  → Loan proceeds/repayments, owner injections/withdrawals

Also calculates:
  Burn Rate  → Average monthly cash outflow (last 3 months)
  Runway     → Cash balance / monthly burn
  Free Cash Flow → Operating CF - CapEx
"""
from datetime import datetime, timedelta
from typing import Optional


async def get_cash_flow(
    org_id: str, db,
    start_date: datetime,
    end_date: datetime,
) -> dict:
    """
    Build cash flow statement from journal entries for the given period.
    Uses indirect method: starts with net income, adjusts for non-cash items.
    """
    # ── Fetch all POSTED journal lines for the period ─────────────────────────
    entry_pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "status": "POSTED",
                "date": {"$gte": start_date, "$lte": end_date},
            }
        },
        {"$unwind": "$lines"},
        {
            "$lookup": {
                "from": "accounts",
                "let": {"code": "$lines.account_code", "oid": "$org_id"},
                "pipeline": [
                    {"$match": {
                        "$expr": {
                            "$and": [
                                {"$eq": ["$code", "$$code"]},
                                {"$eq": ["$org_id", "$$oid"]},
                            ]
                        }
                    }},
                    {"$project": {"account_type": 1, "account_sub_type": 1, "name": 1}},
                ],
                "as": "account_info",
            }
        },
        {"$unwind": "$account_info"},
        {
            "$group": {
                "_id": {
                    "account_code":    "$lines.account_code",
                    "account_type":    "$account_info.account_type",
                    "account_sub_type":"$account_info.account_sub_type",
                    "account_name":    "$account_info.name",
                },
                "total_debit":  {"$sum": "$lines.debit"},
                "total_credit": {"$sum": "$lines.credit"},
            }
        },
    ]
    raw = [doc async for doc in db.journal_entries.aggregate(entry_pipeline)]

    operating_in  = 0.0
    operating_out = 0.0
    investing_out = 0.0
    investing_in  = 0.0
    financing_in  = 0.0
    financing_out = 0.0
    op_lines      = []
    inv_lines     = []
    fin_lines     = []

    for item in raw:
        acc_type    = item["_id"].get("account_type", "")
        acc_sub     = item["_id"].get("account_sub_type", "")
        name        = item["_id"].get("account_name", item["_id"]["account_code"])
        debit       = round(item["total_debit"], 2)
        credit      = round(item["total_credit"], 2)
        net         = round(credit - debit, 2)   # positive = cash inflow

        if acc_type == "REVENUE":
            operating_in  += credit
            op_lines.append({"label": name, "amount": credit, "type": "inflow"})
        elif acc_type == "EXPENSE":
            operating_out += debit
            op_lines.append({"label": name, "amount": debit, "type": "outflow"})
        elif acc_sub == "FIXED_ASSET":
            if net < 0:
                investing_out += abs(net)
                inv_lines.append({"label": f"Purchase: {name}", "amount": abs(net), "type": "outflow"})
            else:
                investing_in  += net
                inv_lines.append({"label": f"Sale: {name}", "amount": net, "type": "inflow"})
        elif acc_sub in ("LOANS", "LONG_TERM_LIABILITY"):
            if credit > debit:
                financing_in  += (credit - debit)
                fin_lines.append({"label": f"Loan proceeds: {name}", "amount": credit - debit, "type": "inflow"})
            else:
                financing_out += (debit - credit)
                fin_lines.append({"label": f"Loan repayment: {name}", "amount": debit - credit, "type": "outflow"})
        elif acc_sub == "OWNERS_EQUITY":
            if credit > debit:
                financing_in  += (credit - debit)
                fin_lines.append({"label": f"Capital injection: {name}", "amount": credit - debit, "type": "inflow"})
            else:
                financing_out += (debit - credit)
                fin_lines.append({"label": f"Owner withdrawal: {name}", "amount": debit - credit, "type": "outflow"})

    operating_cf = round(operating_in - operating_out, 2)
    investing_cf = round(investing_in - investing_out, 2)
    financing_cf = round(financing_in - financing_out, 2)
    net_cf       = round(operating_cf + investing_cf + financing_cf, 2)
    free_cf      = round(operating_cf - investing_out, 2)

    # ── Opening & closing cash balance ────────────────────────────────────────
    cash_accounts = await db.accounts.find(
        {"org_id": org_id, "account_sub_type": {"$in": ["CASH", "BANK"]}, "is_active": True}
    ).to_list(length=None)

    closing_cash = round(sum(a.get("current_balance", 0) for a in cash_accounts), 2)
    opening_cash = round(closing_cash - net_cf, 2)

    return {
        "period_start":   start_date.isoformat(),
        "period_end":     end_date.isoformat(),
        "opening_cash":   opening_cash,
        "closing_cash":   closing_cash,
        "operating": {
            "inflow":     round(operating_in, 2),
            "outflow":    round(operating_out, 2),
            "net":        operating_cf,
            "lines":      op_lines[:20],
        },
        "investing": {
            "inflow":     round(investing_in, 2),
            "outflow":    round(investing_out, 2),
            "net":        investing_cf,
            "lines":      inv_lines,
        },
        "financing": {
            "inflow":     round(financing_in, 2),
            "outflow":    round(financing_out, 2),
            "net":        financing_cf,
            "lines":      fin_lines,
        },
        "net_cash_flow":  net_cf,
        "free_cash_flow": free_cf,
    }


async def get_cash_metrics(org_id: str, db) -> dict:
    """
    Compute burn rate, runway, and monthly cash trend.
    Burn rate = avg monthly net cash outflow over last 3 months.
    Runway = current cash / monthly burn (in months).
    """
    now = datetime.utcnow()

    # Current cash balance
    cash_accounts = await db.accounts.find(
        {"org_id": org_id, "account_sub_type": {"$in": ["CASH", "BANK"]}, "is_active": True}
    ).to_list(length=None)
    cash_balance = round(sum(a.get("current_balance", 0) for a in cash_accounts), 2)

    # Monthly cash flow for last 6 months
    monthly = []
    for i in range(5, -1, -1):
        target      = now.replace(day=1) - timedelta(days=i * 30)
        m_start     = target.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        m_end_month = m_start.month + 1 if m_start.month < 12 else 1
        m_end_year  = m_start.year if m_start.month < 12 else m_start.year + 1
        m_end       = datetime(m_end_year, m_end_month, 1) - timedelta(seconds=1)

        cf = await get_cash_flow(org_id, db, m_start, m_end)
        monthly.append({
            "month":       m_start.strftime("%Y-%m"),
            "net_cf":      cf["net_cash_flow"],
            "operating":   cf["operating"]["net"],
            "cash_in":     cf["operating"]["inflow"],
            "cash_out":    cf["operating"]["outflow"],
        })

    # Burn rate = avg outflow last 3 months (where outflow > inflow)
    last_3 = monthly[-3:]
    burn_months = [abs(m["operating"]) for m in last_3 if m["operating"] < 0]
    burn_rate   = round(sum(burn_months) / len(burn_months), 2) if burn_months else 0.0

    runway_months = round(cash_balance / burn_rate, 1) if burn_rate > 0 else None

    return {
        "cash_balance":   cash_balance,
        "burn_rate":      burn_rate,
        "runway_months":  runway_months,
        "runway_label":   (
            f"~{runway_months:.1f} months" if runway_months
            else "Sufficient (positive cash flow)"
        ),
        "monthly_trend":  monthly,
    }
