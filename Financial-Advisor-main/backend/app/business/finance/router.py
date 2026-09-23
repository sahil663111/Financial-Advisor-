"""
Phase 6 Finance router.
Prefix: /api/v1/business/organizations/{org_id}

Covers:
  Cash flow statement + metrics (burn rate, runway)
  P&L Statement
  Balance Sheet
  Financial Ratios
  Reports summary (dashboard aggregation)
  CSV exports for P&L, Balance Sheet, Trial Balance

NOTE: GST routes live in app.business.tax.router (/tax/gst/*).
"""
import csv
import io
import openpyxl
from fpdf import FPDF
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.database import get_db
from app.business.rbac.dependencies import OrgContext, require_org_member, require_permission
from app.business.finance import cashflow_service, statements_service, health_service
from app.business.accounting.trial_balance_service import get_trial_balance

router = APIRouter(tags=["Business - Finance & Reports"])


# ══════════════════════════════════════════════════════════════════════════════
# CASH FLOW
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/cashflow")
async def get_cash_flow(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """
    Cash Flow Statement (Operating / Investing / Financing).
    Defaults to current financial year (April 1 → today).
    """
    now = datetime.utcnow()
    if not start_date:
        fy_start_year = now.year if now.month >= 4 else now.year - 1
        start_date = datetime(fy_start_year, 4, 1)
    if not end_date:
        end_date = now
    return await cashflow_service.get_cash_flow(ctx.org_id, db, start_date, end_date)


@router.get("/organizations/{org_id}/cashflow/metrics")
async def get_cash_metrics(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Cash balance, burn rate, runway, and 6-month monthly trend."""
    return await cashflow_service.get_cash_metrics(ctx.org_id, db)


# ══════════════════════════════════════════════════════════════════════════════
# FINANCIAL STATEMENTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/reports/profit-loss")
async def get_profit_loss(
    ctx: OrgContext = Depends(require_permission("view_statements")),
    db=Depends(get_db),
):
    """P&L Statement from current account balances. Requires view_statements permission."""
    return await statements_service.get_profit_and_loss(ctx.org_id, db)


@router.get("/organizations/{org_id}/reports/balance-sheet")
async def get_balance_sheet(
    ctx: OrgContext = Depends(require_permission("view_statements")),
    db=Depends(get_db),
):
    """Balance Sheet. is_balanced flag alerts when Assets ≠ Liabilities + Equity."""
    return await statements_service.get_balance_sheet(ctx.org_id, db)


@router.get("/organizations/{org_id}/reports/ratios")
async def get_financial_ratios(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """11 financial ratios across Liquidity / Profitability / Leverage / Efficiency."""
    return await statements_service.get_financial_ratios(ctx.org_id, db)


@router.get("/organizations/{org_id}/reports/summary")
async def get_reports_summary(    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Quick aggregated summary used by the business dashboard."""
    pnl     = await statements_service.get_profit_and_loss(ctx.org_id, db)
    metrics = await cashflow_service.get_cash_metrics(ctx.org_id, db)
    return {
        "revenue":       pnl["revenue"]["total"],
        "expenses":      pnl["expenses"]["total"],
        "net_profit":    pnl["net_profit"],
        "profit_margin": pnl["profit_margin_pct"],
        "cash_balance":  metrics["cash_balance"],
        "burn_rate":     metrics["burn_rate"],
        "runway_months": metrics["runway_months"],
        "runway_label":  metrics["runway_label"],
        "generated_at":  pnl["generated_at"],
    }


# ══════════════════════════════════════════════════════════════════════════════
# BUSINESS HEALTH SCORE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/health-score")
async def get_business_health_score(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """
    Compute composite Business Financial Health Score (0–100).
    7 dimensions: profitability, liquidity, debt, cash runway,
    receivables health, expense growth, revenue stability.
    Saves to history on each call.
    """
    return await health_service.compute_business_health_score(ctx.org_id, db)


@router.get("/organizations/{org_id}/health-score/history")
async def get_health_score_history(
    limit: int = Query(12, ge=1, le=36),
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Historical health scores for trend charting."""
    return await health_service.get_health_history(ctx.org_id, db, limit=limit)

def _csv_response(rows: list[list], filename: str) -> StreamingResponse:
    """Build a streaming CSV response from a list of rows."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(row)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def _excel_response(rows: list[list], filename: str) -> StreamingResponse:
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def _pdf_response(rows: list[list], filename: str, title: str) -> StreamingResponse:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", "B", 16)
    pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("helvetica", "", 10)
    pdf.ln(5)
    
    max_cols = max((len(row) for row in rows), default=1)
    if max_cols > 1:
        col_w = [80] + [(190 - 80) / (max_cols - 1)] * (max_cols - 1)
    else:
        col_w = [190]
    
    for row in rows:
        if not row:
            pdf.ln(5)
            continue
        
        row_str = str(row[0])
        if row_str.isupper() or "TOTAL" in row_str.upper() or "Generated" in row_str or "Balance" in row_str:
            pdf.set_font("helvetica", "B", 10)
        else:
            pdf.set_font("helvetica", "", 10)
            
        for i, item in enumerate(row):
            w = col_w[i] if i < len(col_w) else 20
            val = str(item).strip() if item is not None else ""
            pdf.cell(w, 8, val, border=1 if val else 0)
        pdf.ln(8)
    
    pdf_bytes = bytes(pdf.output())
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/organizations/{org_id}/reports/profit-loss/export")
async def export_profit_loss(
    format: str = Query("csv", regex="^(csv|pdf|excel)$"),
    ctx: OrgContext = Depends(require_permission("export")),
    db=Depends(get_db),
):
    """Download P&L Statement as CSV."""
    pnl = await statements_service.get_profit_and_loss(ctx.org_id, db)
    rows = [
        ["AI Financial OS — Profit & Loss Statement"],
        [pnl["period_label"]],
        [],
        ["Section", "Account Code", "Account Name", "Amount (₹)"],
    ]
    # Revenue
    for sub, items in pnl["revenue"]["groups"].items():
        rows.append([f"Revenue — {sub}", "", "", ""])
        for item in items:
            rows.append(["", item["code"], item["name"], item["balance"]])
    rows.append(["TOTAL REVENUE", "", "", pnl["revenue"]["total"]])
    rows.append([])
    # Expenses
    for sub, items in pnl["expenses"]["groups"].items():
        rows.append([f"Expenses — {sub}", "", "", ""])
        for item in items:
            rows.append(["", item["code"], item["name"], item["balance"]])
    rows.append(["TOTAL EXPENSES", "", "", pnl["expenses"]["total"]])
    rows.append([])
    rows.append(["GROSS PROFIT", "", "", pnl["gross_profit"]])
    rows.append(["NET PROFIT / (LOSS)", "", "", pnl["net_profit"]])
    rows.append(["PROFIT MARGIN %", "", "", f"{pnl['profit_margin_pct']}%"])
    rows.append([])
    rows.append(["Generated", pnl["generated_at"]])

    date_str = datetime.utcnow().strftime('%Y%m%d')
    if format == "excel":
        fname = f"PnL_{ctx.org_id}_{date_str}.xlsx"
        return _excel_response(rows, fname)
    elif format == "pdf":
        fname = f"PnL_{ctx.org_id}_{date_str}.pdf"
        return _pdf_response(rows, fname, "Profit & Loss Statement")
    
    fname = f"PnL_{ctx.org_id}_{date_str}.csv"
    return _csv_response(rows, fname)


@router.get("/organizations/{org_id}/reports/balance-sheet/export")
async def export_balance_sheet(
    format: str = Query("csv", regex="^(csv|pdf|excel)$"),
    ctx: OrgContext = Depends(require_permission("export")),
    db=Depends(get_db),
):
    """Download Balance Sheet as CSV."""
    bs = await statements_service.get_balance_sheet(ctx.org_id, db)
    rows = [
        ["AI Financial OS — Balance Sheet"],
        [f"Generated: {bs['generated_at']}"],
        [],
        ["Section", "Sub-Type", "Account Code", "Account Name", "Balance (₹)"],
    ]
    for section, label in [("assets", "Assets"), ("liabilities", "Liabilities"), ("equity", "Equity")]:
        data = bs[section]
        rows.append([label.upper(), "", "", "", ""])
        for sub, items in data["groups"].items():
            for item in items:
                rows.append(["", sub, item["code"], item["name"], item["balance"]])
        rows.append([f"TOTAL {label.upper()}", "", "", "", data["total"]])
        rows.append([])
    rows.append(["Balanced", str(bs["is_balanced"])])
    rows.append(["Total Liabilities + Equity", "", "", "", bs["total_liabilities_equity"]])

    date_str = datetime.utcnow().strftime('%Y%m%d')
    if format == "excel":
        fname = f"BalanceSheet_{ctx.org_id}_{date_str}.xlsx"
        return _excel_response(rows, fname)
    elif format == "pdf":
        fname = f"BalanceSheet_{ctx.org_id}_{date_str}.pdf"
        return _pdf_response(rows, fname, "Balance Sheet")

    fname = f"BalanceSheet_{ctx.org_id}_{date_str}.csv"
    return _csv_response(rows, fname)


@router.get("/organizations/{org_id}/reports/trial-balance/export")
async def export_trial_balance(
    format: str = Query("csv", regex="^(csv|pdf|excel)$"),
    ctx: OrgContext = Depends(require_permission("export")),
    db=Depends(get_db),
):
    """Download Trial Balance as CSV."""
    tb = await get_trial_balance(ctx.org_id, db)
    rows = [
        ["AI Financial OS — Trial Balance"],
        [f"As of: {tb['as_of_date']}"],
        [],
        ["Account Code", "Account Name", "Account Type", "Debit (₹)", "Credit (₹)"],
    ]
    for line in tb["lines"]:
        rows.append([
            line["account_code"],
            line["account_name"],
            line["account_type"],
            line["debit_balance"] if line["debit_balance"] > 0 else "",
            line["credit_balance"] if line["credit_balance"] > 0 else "",
        ])
    rows.append([])
    rows.append(["TOTALS", "", "", tb["total_debits"], tb["total_credits"]])
    rows.append(["Balanced", "", "", str(tb["is_balanced"]), ""])

    date_str = datetime.utcnow().strftime('%Y%m%d')
    if format == "excel":
        fname = f"TrialBalance_{ctx.org_id}_{date_str}.xlsx"
        return _excel_response(rows, fname)
    elif format == "pdf":
        fname = f"TrialBalance_{ctx.org_id}_{date_str}.pdf"
        return _pdf_response(rows, fname, "Trial Balance")

    fname = f"TrialBalance_{ctx.org_id}_{date_str}.csv"
    return _csv_response(rows, fname)


@router.get("/organizations/{org_id}/reports/cashflow/export")
async def export_cashflow(
    format: str = Query("csv", regex="^(csv|pdf|excel)$"),
    ctx: OrgContext = Depends(require_permission("export")),
    db=Depends(get_db),
):
    """Download Cash Flow Statement as CSV."""
    now = datetime.utcnow()
    fy_start_year = now.year if now.month >= 4 else now.year - 1
    start = datetime(fy_start_year, 4, 1)
    cf = await cashflow_service.get_cash_flow(ctx.org_id, db, start, now)

    rows = [
        ["AI Financial OS — Cash Flow Statement"],
        [f"Period: {cf['period_start'][:10]} to {cf['period_end'][:10]}"],
        [],
        ["Section", "Description", "Amount (₹)"],
        ["Opening Cash Balance", "", cf["opening_cash"]],
        [],
    ]
    for section_key, section_label in [
        ("operating", "Operating Activities"),
        ("investing", "Investing Activities"),
        ("financing", "Financing Activities"),
    ]:
        sec = cf[section_key]
        rows.append([section_label, "", ""])
        rows.append(["", "Inflow", sec["inflow"]])
        rows.append(["", "Outflow", sec["outflow"]])
        for line in sec.get("lines", [])[:10]:
            rows.append(["", f"  {line['label']}", line["amount"] * (1 if line["type"] == "inflow" else -1)])
        rows.append([f"Net {section_label}", "", sec["net"]])
        rows.append([])

    rows.append(["Net Cash Flow", "", cf["net_cash_flow"]])
    rows.append(["Free Cash Flow", "", cf["free_cash_flow"]])
    rows.append(["Closing Cash Balance", "", cf["closing_cash"]])

    date_str = datetime.utcnow().strftime('%Y%m%d')
    if format == "excel":
        fname = f"CashFlow_{ctx.org_id}_{date_str}.xlsx"
        return _excel_response(rows, fname)
    elif format == "pdf":
        fname = f"CashFlow_{ctx.org_id}_{date_str}.pdf"
        return _pdf_response(rows, fname, "Cash Flow Statement")

    fname = f"CashFlow_{ctx.org_id}_{date_str}.csv"
    return _csv_response(rows, fname)
