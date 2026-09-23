"""
Payroll Service — Phase 5.

Run payroll lifecycle:
  1. run_payroll() → creates DRAFT payroll run with per-employee items
  2. approve_payroll() → moves to APPROVED, posts accounting journal
  3. mark_paid() → moves to PAID, records payment date

Per-employee payslip calculation:
  Gross  = Basic + HRA + Special + Other Allowances
  Employee deductions = PF_emp + ESIC_emp + TDS + PT + Other
  Net    = Gross - Employee Deductions

Accounting journal on APPROVE:
  DR  Salaries & Wages       (sum of gross)
  DR  Employer PF Expense    (sum of pf_employer)
  DR  Employer ESIC Expense  (sum of esic_employer)
  CR  TDS Payable            (sum of tds)
  CR  PF Payable             (sum of pf_employee + pf_employer)
  CR  ESIC Payable           (sum of esic_employee + esic_employer)
  CR  Salaries Payable       (sum of net salary)
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId
from calendar import monthrange

from app.utils.exceptions import not_found, bad_request, conflict
from app.business.payroll.employee_service import compute_salary_summary
from app.business.payroll.schemas import PayrollRunStatus
from app.business.audit.service import log_action, AuditAction
from app.business.accounting.journal_service import create_journal_entry
from app.business.accounting.journal_schemas import (
    CreateJournalEntryRequest, JournalLineRequest,
)

MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


# ── Run payroll ───────────────────────────────────────────────────────────────

async def run_payroll(
    org_id: str, user_id: str, data, db, request=None,
) -> dict:
    # Prevent duplicate run for same period
    existing = await db.payroll_runs.find_one({
        "org_id":        org_id,
        "period_year":   data.period_year,
        "period_month":  data.period_month,
        "status":        {"$ne": "CANCELLED"},
    })
    if existing:
        raise conflict(
            f"Payroll for {MONTH_NAMES[data.period_month]} {data.period_year} "
            f"already exists (status: {existing['status']})"
        )

    # Fetch all active employees
    cursor = db.employees.find({"org_id": org_id, "status": "ACTIVE"})
    employees = [doc async for doc in cursor]

    if not employees:
        raise bad_request("No active employees found. Add employees before running payroll.")

    now = datetime.utcnow()
    period_label = f"{MONTH_NAMES[data.period_month]} {data.period_year}"

    # Build per-employee payroll items
    items = []
    totals = {
        "gross": 0.0, "pf_employee": 0.0, "pf_employer": 0.0,
        "esic_employee": 0.0, "esic_employer": 0.0,
        "tds": 0.0, "professional_tax": 0.0, "other_deductions": 0.0,
        "total_deductions": 0.0, "net_salary": 0.0, "employer_cost": 0.0,
    }

    for emp in employees:
        summary = compute_salary_summary(emp)
        item = {
            "employee_id":            str(emp["_id"]),
            "employee_code":          emp["employee_code"],
            "full_name":              emp["full_name"],
            "designation":            emp.get("designation", ""),
            "department":             emp.get("department", ""),
            "bank_account_number":    emp.get("bank_account_number"),
            "basic_salary":           emp.get("basic_salary", 0.0),
            "hra":                    emp.get("hra", 0.0),
            "special_allowance":      emp.get("special_allowance", 0.0),
            "other_allowances":       emp.get("other_allowances", 0.0),
            **summary,
        }
        items.append(item)
        for k in totals:
            if k in summary:
                totals[k] = round(totals[k] + summary[k], 2)

    payroll_doc = {
        "org_id":                  org_id,
        "period_year":             data.period_year,
        "period_month":            data.period_month,
        "period_label":            period_label,
        "payment_date":            data.payment_date,
        "status":                  PayrollRunStatus.DRAFT.value,
        "employee_count":          len(items),
        "items":                   items,
        "totals":                  totals,
        "notes":                   data.notes,
        "salary_expense_account":  data.salary_expense_account,
        "pf_expense_account":      data.pf_expense_account,
        "esic_expense_account":    data.esic_expense_account,
        "bank_account_code":       data.bank_account_code,
        "salary_payable_account":  data.salary_payable_account,
        "tds_payable_account":     data.tds_payable_account,
        "pf_payable_account":      data.pf_payable_account,
        "esic_payable_account":    data.esic_payable_account,
        "journal_entry_id":        None,
        "created_by":              user_id,
        "created_at":              now,
        "updated_at":              now,
    }

    result = await db.payroll_runs.insert_one(payroll_doc)
    run_id = str(result.inserted_id)
    payroll_doc["_id"] = run_id

    await log_action(
        db, org_id=org_id, user_id=user_id,
        action=AuditAction.RUN_PAYROLL,
        entity_type="payroll_run", entity_id=run_id,
        new_value={
            "period": period_label,
            "employees": len(items),
            "total_net": totals["net_salary"],
        },
        request=request,
    )
    return payroll_doc


# ── Approve payroll ───────────────────────────────────────────────────────────

async def approve_payroll(
    org_id: str, run_id: str, user_id: str,
    comment: Optional[str], db, request=None,
) -> dict:
    run = await db.payroll_runs.find_one(
        {"_id": ObjectId(run_id), "org_id": org_id}
    )
    if not run:
        raise not_found("Payroll run")
    if run["status"] != PayrollRunStatus.DRAFT.value:
        raise bad_request(f"Only DRAFT payroll runs can be approved. Current: {run['status']}")

    now = datetime.utcnow()
    totals = run["totals"]
    period_label = run["period_label"]

    # Post accounting journal
    je_id = await _post_payroll_journal(
        org_id=org_id,
        user_id=user_id,
        run=run,
        totals=totals,
        period_label=period_label,
        db=db,
        request=request,
    )

    await db.payroll_runs.update_one(
        {"_id": ObjectId(run_id)},
        {"$set": {
            "status":         PayrollRunStatus.APPROVED.value,
            "approved_by":    user_id,
            "approved_at":    now,
            "journal_entry_id": je_id,
            "approval_comment": comment,
            "updated_at":     now,
        }},
    )

    await log_action(
        db, org_id=org_id, user_id=user_id,
        action=AuditAction.APPROVE_PAYROLL,
        entity_type="payroll_run", entity_id=run_id,
        new_value={"status": "APPROVED", "journal_entry_id": je_id},
        request=request,
    )

    updated = await db.payroll_runs.find_one({"_id": ObjectId(run_id)})
    updated["_id"] = str(updated["_id"])
    return updated


async def mark_payroll_paid(
    org_id: str, run_id: str, user_id: str,
    payment_reference: Optional[str],
    payment_date: Optional[datetime],
    db, request=None,
) -> dict:
    run = await db.payroll_runs.find_one(
        {"_id": ObjectId(run_id), "org_id": org_id}
    )
    if not run:
        raise not_found("Payroll run")
    if run["status"] != PayrollRunStatus.APPROVED.value:
        raise bad_request(f"Only APPROVED payroll runs can be marked PAID. Current: {run['status']}")

    now = datetime.utcnow()
    totals = run["totals"]

    # Post payment journal: DR Salaries Payable / CR Bank
    try:
        await create_journal_entry(
            org_id=org_id, user_id=user_id,
            data=CreateJournalEntryRequest(
                date=payment_date or now,
                description=f"Payroll payment — {run['period_label']}",
                reference=payment_reference,
                lines=[
                    JournalLineRequest(
                        account_code=run["salary_payable_account"],
                        description=f"Salary payment — {run['period_label']}",
                        debit=totals["net_salary"],
                        credit=0.0,
                    ),
                    JournalLineRequest(
                        account_code=run["bank_account_code"],
                        description=f"Bank disbursement — {run['period_label']}",
                        debit=0.0,
                        credit=totals["net_salary"],
                    ),
                ],
            ),
            db=db, request=request,
        )
    except Exception as e:
        print(f"[payroll_service] payment journal failed: {e}")

    await db.payroll_runs.update_one(
        {"_id": ObjectId(run_id)},
        {"$set": {
            "status":             PayrollRunStatus.PAID.value,
            "payment_reference":  payment_reference,
            "actual_payment_date": payment_date or now,
            "updated_at":         now,
        }},
    )

    updated = await db.payroll_runs.find_one({"_id": ObjectId(run_id)})
    updated["_id"] = str(updated["_id"])
    return updated


# ── Read ──────────────────────────────────────────────────────────────────────

async def list_payroll_runs(
    org_id: str, db, page: int = 1, limit: int = 24,
) -> dict:
    skip  = (page - 1) * limit
    total = await db.payroll_runs.count_documents({"org_id": org_id})
    cursor = (
        db.payroll_runs.find({"org_id": org_id})
        .sort([("period_year", -1), ("period_month", -1)])
        .skip(skip).limit(limit)
    )
    items = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        # Exclude per-employee items from list view (heavy)
        doc.pop("items", None)
        items.append(doc)
    return {"data": items, "total": total, "page": page,
            "pages": (total + limit - 1) // limit}


async def get_payroll_run(org_id: str, run_id: str, db) -> dict:
    doc = await db.payroll_runs.find_one(
        {"_id": ObjectId(run_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Payroll run")
    doc["_id"] = str(doc["_id"])
    return doc


async def get_payslip(org_id: str, run_id: str, employee_id: str, db) -> dict:
    """Get individual payslip from a payroll run."""
    run = await db.payroll_runs.find_one(
        {"_id": ObjectId(run_id), "org_id": org_id}
    )
    if not run:
        raise not_found("Payroll run")

    item = next(
        (i for i in run.get("items", []) if i["employee_id"] == employee_id),
        None,
    )
    if not item:
        raise not_found("Employee payslip in this payroll run")

    # Fetch org name for payslip header
    org = await db.organizations.find_one({"_id": ObjectId(org_id)})
    org_name = org["name"] if org else "Your Company"

    return {
        "org_name":      org_name,
        "period_label":  run["period_label"],
        "payment_date":  run.get("payment_date"),
        "status":        run["status"],
        **item,
    }


# ── Internal: post payroll accounting journal ─────────────────────────────────

async def _post_payroll_journal(
    org_id: str, user_id: str,
    run: dict, totals: dict, period_label: str,
    db, request=None,
) -> Optional[str]:
    """
    DR  Salaries & Wages       gross
    DR  Employer PF Expense    pf_employer
    DR  Employer ESIC Expense  esic_employer
    CR  TDS Payable            tds
    CR  PF Payable             pf_employee + pf_employer
    CR  ESIC Payable           esic_employee + esic_employer
    CR  Salaries Payable       net_salary
    """
    try:
        lines = []

        # Debit side
        if totals.get("gross", 0) > 0:
            lines.append(JournalLineRequest(
                account_code=run["salary_expense_account"],
                description=f"Gross salaries — {period_label}",
                debit=totals["gross"], credit=0.0,
            ))
        if totals.get("pf_employer", 0) > 0:
            lines.append(JournalLineRequest(
                account_code=run["pf_expense_account"],
                description=f"Employer PF — {period_label}",
                debit=totals["pf_employer"], credit=0.0,
            ))
        if totals.get("esic_employer", 0) > 0:
            lines.append(JournalLineRequest(
                account_code=run["esic_expense_account"],
                description=f"Employer ESIC — {period_label}",
                debit=totals["esic_employer"], credit=0.0,
            ))

        # Credit side
        total_pf  = round(totals.get("pf_employee", 0) + totals.get("pf_employer", 0), 2)
        total_esic = round(totals.get("esic_employee", 0) + totals.get("esic_employer", 0), 2)

        if totals.get("tds", 0) > 0:
            lines.append(JournalLineRequest(
                account_code=run["tds_payable_account"],
                description=f"TDS payable — {period_label}",
                debit=0.0, credit=totals["tds"],
            ))
        if total_pf > 0:
            lines.append(JournalLineRequest(
                account_code=run["pf_payable_account"],
                description=f"PF payable — {period_label}",
                debit=0.0, credit=total_pf,
            ))
        if total_esic > 0:
            lines.append(JournalLineRequest(
                account_code=run["esic_payable_account"],
                description=f"ESIC payable — {period_label}",
                debit=0.0, credit=total_esic,
            ))
        if totals.get("net_salary", 0) > 0:
            lines.append(JournalLineRequest(
                account_code=run["salary_payable_account"],
                description=f"Net salaries payable — {period_label}",
                debit=0.0, credit=totals["net_salary"],
            ))

        if not lines:
            return None

        entry = await create_journal_entry(
            org_id=org_id, user_id=user_id,
            data=CreateJournalEntryRequest(
                date=run.get("payment_date", datetime.utcnow()),
                description=f"Payroll — {period_label}",
                reference=f"PAYROLL-{run.get('period_year')}-{run.get('period_month'):02d}",
                lines=lines,
            ),
            db=db, request=request,
        )
        return str(entry["_id"])
    except Exception as e:
        print(f"[payroll_service] journal post failed: {e}")
        return None


from typing import Optional
