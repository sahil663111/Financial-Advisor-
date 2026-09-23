# 11 — Financial Reports & Exports

## 11.1 Profit & Loss Statement

### How It Works
The P&L is generated **directly from account balances**, not by re-scanning journal entries:

```python
async def get_profit_and_loss(org_id, db):
    # Query all REVENUE and EXPENSE accounts
    cursor = db.accounts.find({
        "org_id": org_id,
        "account_type": {"$in": ["REVENUE", "EXPENSE"]},
        "is_active": True,
    })

    for account in accounts:
        balance = account.get("current_balance", 0.0)
        if account_type == "REVENUE":
            revenue_groups[sub_type].append({"code": ..., "name": ..., "balance": balance})
            total_revenue += balance
        elif account_type == "EXPENSE":
            expense_groups[sub_type].append(...)
            total_expenses += balance

    net_profit = total_revenue - total_expenses
    profit_margin = (net_profit / total_revenue * 100) if total_revenue > 0 else 0
```

### Output Structure
```json
{
    "period_label": "As of 23 Sep 2026",
    "revenue": {
        "groups": {
            "SALES": [
                {"code": "4000", "name": "Software Subscriptions", "balance": 60076140},
                {"code": "4100", "name": "Consulting Income", "balance": 0}
            ]
        },
        "total": 60076140
    },
    "expenses": {
        "groups": {
            "COGS": [{"code": "5100", "name": "Server Hosting AWS", "balance": 12187613}],
            "MARKETING": [{"code": "5200", "name": "Marketing Ads", "balance": 10438272}],
            "TRAVEL": [{"code": "5300", "name": "Travel & Meals", "balance": 12898173}]
        },
        "total": 35524058
    },
    "gross_profit": 47888527,
    "operating_profit": 47888527,
    "net_profit": 24552082,
    "profit_margin_pct": 40.87
}
```

---

## 11.2 Balance Sheet

### Fundamental Equation Check
```
Total Assets = Total Liabilities + Total Equity + Net Profit
```

The balance sheet automatically includes the current period's net profit as "Retained Earnings":

```python
async def get_balance_sheet(org_id, db):
    # Query ASSET, LIABILITY, EQUITY accounts
    # ...

    # Add net profit from P&L to retained earnings
    pnl = await get_profit_and_loss(org_id, db)
    equity_groups["RETAINED_EARNINGS"].append({
        "code": "RE",
        "name": "Net Profit / (Loss) — Current Period",
        "balance": pnl["net_profit"],
    })

    is_balanced = abs(total_assets - (total_liabilities + total_equity)) < 0.01
```

---

## 11.3 Financial Ratios

### Computed Ratios (8 ratios across 4 categories)

| Category | Ratio | Formula | Benchmark |
|----------|-------|---------|-----------|
| **Liquidity** | Current Ratio | Current Assets / Current Liabilities | ≥ 2.0 |
| **Liquidity** | Quick Ratio | (Current Assets - Inventory) / Current Liabilities | ≥ 1.0 |
| **Profitability** | Net Profit Margin | Net Profit / Revenue × 100 | ≥ 15% |
| **Profitability** | Return on Equity | Net Profit / Total Equity × 100 | ≥ 15% |
| **Leverage** | Debt-to-Equity | Total Debt / Total Equity | ≤ 2.0 |
| **Leverage** | Interest Coverage | Operating Profit / Interest Expense | ≥ 3.0 |
| **Efficiency** | Receivables Turnover | Revenue / Avg Accounts Receivable | Higher is better |
| **Efficiency** | Asset Turnover | Revenue / Total Assets | Higher is better |

Each ratio includes:
- **Value**: The computed number
- **Benchmark**: Industry standard for comparison
- **Explanation**: Plain-English interpretation

---

## 11.4 Cash Flow Statement

### Three-Section Format (Indian Accounting Standard)
```
OPERATING ACTIVITIES
  Cash from customers          +₹60,07,614
  Cash paid to vendors         -₹35,52,406
  Cash paid to employees       -₹15,20,000
  Taxes paid                   -₹1,85,000
  NET OPERATING                +₹7,50,208

INVESTING ACTIVITIES
  Equipment purchases          -₹0
  Investment income            +₹0
  NET INVESTING                ₹0

FINANCING ACTIVITIES
  Loan repayments              -₹0
  Owner drawings               -₹0
  NET FINANCING                ₹0

NET CASH FLOW                  +₹7,50,208
OPENING CASH                   ₹45,00,000
CLOSING CASH                   ₹2,45,52,082
```

### Implementation
```python
async def get_cash_flow(org_id, db, start_date, end_date):
    # Classify journal entries by account sub-type
    # BANK accounts → Cash movements
    # Revenue accounts → Operating inflow
    # Expense accounts → Operating outflow
    # Fixed asset accounts → Investing
    # Loan/equity accounts → Financing
```

---

## 11.5 Financial Health Score (0–100)

A composite score across 7 dimensions:

```
┌───────────────────────────────────────────────────┐
│          FINANCIAL HEALTH SCORE: 78/100           │
│          ████████████████████░░░░░ GOOD            │
├───────────────────────────────────────────────────┤
│                                                   │
│  Profitability (20 pts)     █████████████████ 15   │
│  Net margin: 40.9% — Healthy                     │
│                                                   │
│  Liquidity (20 pts)         ████████████████████ 20 │
│  Current ratio: N/A — Strong (no liabilities)     │
│                                                   │
│  Debt (15 pts)              ████████████████████ 15 │
│  Debt-to-equity: 0 — Excellent                    │
│                                                   │
│  Cash Runway (15 pts)       ████████████████████ 15 │
│  Runway: 16 months — Strong                       │
│                                                   │
│  Receivables (10 pts)       ████████████ 8         │
│  DSO: 15 days — Good                              │
│                                                   │
│  Expense Growth (10 pts)    ████████ 5             │
│  MoM growth: +8% — Watch                          │
│                                                   │
│  Revenue Stability (10 pts) ████████████████ 10    │
│  Consistency: 92% — Excellent                     │
└───────────────────────────────────────────────────┘
```

---

## 11.6 Export Functionality

### Supported Formats
| Format | Library | Use Case |
|--------|---------|----------|
| **CSV** | Python `csv` module | Spreadsheet analysis, data import |
| **Excel** | `openpyxl` | Formatted workbooks with sheets |
| **PDF** | `fpdf2` | Print-ready reports, compliance filing |

### Export Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /reports/profit-loss/export?format=csv` | P&L as CSV |
| `GET /reports/profit-loss/export?format=pdf` | P&L as PDF |
| `GET /reports/profit-loss/export?format=excel` | P&L as Excel |
| `GET /reports/balance-sheet/export?format=csv` | Balance Sheet |
| `GET /reports/trial-balance/export?format=csv` | Trial Balance |
| `GET /reports/cashflow/export?format=csv` | Cash Flow Statement |

### PDF Generation Example
```python
async def export_profit_loss(format, ctx, db):
    pnl = await statements_service.get_profit_and_loss(ctx.org_id, db)

    if format == "pdf":
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("helvetica", "B", 16)
        pdf.cell(190, 10, "AI Financial OS — Profit & Loss Statement")
        # ... add rows
        return StreamingResponse(
            iter([bytes(pdf.output())]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="PnL_{date}.pdf"'},
        )
```
