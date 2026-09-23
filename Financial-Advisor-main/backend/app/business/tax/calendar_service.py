"""
Tax Compliance Calendar Service — Phase 6.

Generates statutory Indian tax compliance dates for:
  • GST: GSTR-1 (11th), GSTR-3B (20th), GSTR-9 (31st Dec)
  • TDS: Monthly deposit (7th), Quarterly 24Q/26Q filings
  • Advance Tax: 15 Jun, 15 Sep, 15 Dec, 15 Mar
  • Income Tax Return / Tax Audit filings

Dates are calculated dynamically relative to the current date and provide:
  - due_date
  - label & description
  - category (GST, TDS, ADVANCE_TAX, INCOME_TAX)
  - status (UPCOMING, DUE_SOON <= 7 days, OVERDUE, COMPLETED)
  - days_left
"""
from datetime import datetime, date, timedelta
from typing import Optional, List
import calendar


def _get_due_date_for_month(year: int, month: int, day: int) -> datetime:
    """Helper to return datetime clamped to maximum days in month."""
    max_days = calendar.monthrange(year, month)[1]
    return datetime(year, month, min(day, max_days), 23, 59, 59)


async def get_tax_calendar(
    org_id: str,
    db,
    months_ahead: int = 3,
) -> List[dict]:
    """
    Generate upcoming compliance obligations for the next `months_ahead` months.
    """
    now = datetime.utcnow()
    today = now.date()

    entries = []

    # Iterate from current month up to months_ahead
    current_year = now.year
    current_month = now.month

    for offset in range(months_ahead + 1):
        target_month = ((current_month - 1 + offset) % 12) + 1
        target_year = current_year + ((current_month - 1 + offset) // 12)

        # 1. GSTR-1: 11th of every month (for previous month supplies)
        gstr1_due = _get_due_date_for_month(target_year, target_month, 11)
        prev_m = 12 if target_month == 1 else target_month - 1
        prev_y = target_year - 1 if target_month == 1 else target_year
        prev_m_name = calendar.month_name[prev_m]

        entries.append({
            "id": f"gst_gstr1_{target_year}_{target_month}",
            "type": "GST",
            "code": "GSTR_1",
            "label": f"GSTR-1 ({prev_m_name} {prev_y})",
            "description": f"Monthly return of outward supplies for {prev_m_name} {prev_y}",
            "due_date": gstr1_due.isoformat(),
            "target_date": gstr1_due,
            "period": f"{prev_m_name} {prev_y}",
        })

        # 2. GSTR-3B: 20th of every month
        gstr3b_due = _get_due_date_for_month(target_year, target_month, 20)
        entries.append({
            "id": f"gst_gstr3b_{target_year}_{target_month}",
            "type": "GST",
            "code": "GSTR_3B",
            "label": f"GSTR-3B ({prev_m_name} {prev_y})",
            "description": f"Monthly summary return and tax payment for {prev_m_name} {prev_y}",
            "due_date": gstr3b_due.isoformat(),
            "target_date": gstr3b_due,
            "period": f"{prev_m_name} {prev_y}",
        })

        # 3. TDS Deposit: 7th of every month (April 30th for March)
        if target_month == 4:
            tds_due = _get_due_date_for_month(target_year, 4, 30)
            tds_label = f"TDS Payment Deposit (March {target_year})"
        else:
            tds_due = _get_due_date_for_month(target_year, target_month, 7)
            tds_label = f"TDS Payment Deposit ({prev_m_name} {prev_y})"

        entries.append({
            "id": f"tds_deposit_{target_year}_{target_month}",
            "type": "TDS",
            "code": "TDS_DEPOSIT",
            "label": tds_label,
            "description": f"Deposit of tax deducted at source for {prev_m_name}",
            "due_date": tds_due.isoformat(),
            "target_date": tds_due,
            "period": f"{prev_m_name} {prev_y}",
        })

        # 4. Quarterly TDS Return (26Q / 24Q)
        # Q1: 31 July, Q2: 31 Oct, Q3: 31 Jan, Q4: 31 May
        if target_month == 7:
            tds_q_due = _get_due_date_for_month(target_year, 7, 31)
            entries.append({
                "id": f"tds_return_q1_{target_year}",
                "type": "TDS",
                "code": "TDS_QUARTERLY_RETURN",
                "label": f"TDS Return Q1 (Apr-Jun {target_year})",
                "description": "Filing of quarterly TDS return Form 24Q / 26Q",
                "due_date": tds_q_due.isoformat(),
                "target_date": tds_q_due,
                "period": f"Q1 FY {target_year}-{str(target_year+1)[-2:]}",
            })
        elif target_month == 10:
            tds_q_due = _get_due_date_for_month(target_year, 10, 31)
            entries.append({
                "id": f"tds_return_q2_{target_year}",
                "type": "TDS",
                "code": "TDS_QUARTERLY_RETURN",
                "label": f"TDS Return Q2 (Jul-Sep {target_year})",
                "description": "Filing of quarterly TDS return Form 24Q / 26Q",
                "due_date": tds_q_due.isoformat(),
                "target_date": tds_q_due,
                "period": f"Q2 FY {target_year}-{str(target_year+1)[-2:]}",
            })
        elif target_month == 1:
            tds_q_due = _get_due_date_for_month(target_year, 1, 31)
            entries.append({
                "id": f"tds_return_q3_{target_year}",
                "type": "TDS",
                "code": "TDS_QUARTERLY_RETURN",
                "label": f"TDS Return Q3 (Oct-Dec {target_year-1})",
                "description": "Filing of quarterly TDS return Form 24Q / 26Q",
                "due_date": tds_q_due.isoformat(),
                "target_date": tds_q_due,
                "period": f"Q3 FY {target_year-1}-{str(target_year)[-2:]}",
            })
        elif target_month == 5:
            tds_q_due = _get_due_date_for_month(target_year, 5, 31)
            entries.append({
                "id": f"tds_return_q4_{target_year}",
                "type": "TDS",
                "code": "TDS_QUARTERLY_RETURN",
                "label": f"TDS Return Q4 (Jan-Mar {target_year})",
                "description": "Filing of quarterly TDS return Form 24Q / 26Q",
                "due_date": tds_q_due.isoformat(),
                "target_date": tds_q_due,
                "period": f"Q4 FY {target_year-1}-{str(target_year)[-2:]}",
            })

        # 5. Advance Tax Instalments (15th of Jun, Sep, Dec, Mar)
        if target_month in (3, 6, 9, 12):
            inst_num = {6: "1st (15%)", 9: "2nd (45%)", 12: "3rd (75%)", 3: "4th (100%)"}[target_month]
            adv_due = _get_due_date_for_month(target_year, target_month, 15)
            entries.append({
                "id": f"adv_tax_{target_year}_{target_month}",
                "type": "ADVANCE_TAX",
                "code": "ADVANCE_TAX",
                "label": f"Advance Tax {inst_num}",
                "description": f"Payment of {inst_num} instalment of estimated income tax",
                "due_date": adv_due.isoformat(),
                "target_date": adv_due,
                "period": f"FY {target_year if target_month != 3 else target_year - 1}",
            })

    # Sort entries by target date
    entries.sort(key=lambda x: x["target_date"])

    # Compute status and days_left
    results = []
    for item in entries:
        target_d = item.pop("target_date")
        diff_days = (target_d.date() - today).days

        if diff_days < 0:
            status = "OVERDUE"
        elif diff_days <= 7:
            status = "DUE_SOON"
        else:
            status = "UPCOMING"

        # Check if the deadline is within the relevant window
        # (show anything from 15 days overdue up to months_ahead in future)
        if -30 <= diff_days <= (months_ahead * 31):
            results.append({
                **item,
                "status": status,
                "days_left": max(diff_days, 0),
                "is_overdue": diff_days < 0,
                "due_date": target_d.strftime("%Y-%m-%d"),
            })

    return results
