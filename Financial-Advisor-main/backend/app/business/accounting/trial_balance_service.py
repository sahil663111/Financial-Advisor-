"""
Trial Balance Service — Phase 2.

Generates a Trial Balance from current account balances.

Normal balance convention applied here:
    ASSET / EXPENSE accounts with positive balance → Debit column
    LIABILITY / EQUITY / REVENUE accounts with positive balance → Credit column
    Negative balances (contra accounts) go to the opposite column.

The report is balanced when: sum(debit_column) == sum(credit_column)
"""
from datetime import datetime

from app.business.accounting.ledger_service import get_all_account_balances
from app.business.accounting.journal_service import _DEBIT_NORMAL


async def get_trial_balance(org_id: str, db) -> dict:
    """
    Build Trial Balance as of now using current account balances.
    """
    now = datetime.utcnow()
    balances = await get_all_account_balances(org_id, db)

    lines = []
    total_debits = 0.0
    total_credits = 0.0

    for acc in balances:
        balance = acc["current_balance"]
        if balance == 0.0:
            # Include zero-balance accounts so the COA is fully visible
            lines.append({
                "account_code": acc["code"],
                "account_name": acc["name"],
                "account_type": acc["account_type"],
                "debit_balance": 0.0,
                "credit_balance": 0.0,
            })
            continue

        acc_type = acc["account_type"]

        if acc_type in _DEBIT_NORMAL:
            # Positive balance → Debit; negative → Credit (contra account)
            if balance >= 0:
                debit_bal = round(balance, 2)
                credit_bal = 0.0
            else:
                debit_bal = 0.0
                credit_bal = round(abs(balance), 2)
        else:
            # Credit-normal accounts
            if balance >= 0:
                debit_bal = 0.0
                credit_bal = round(balance, 2)
            else:
                debit_bal = round(abs(balance), 2)
                credit_bal = 0.0

        total_debits = round(total_debits + debit_bal, 2)
        total_credits = round(total_credits + credit_bal, 2)

        lines.append({
            "account_code": acc["code"],
            "account_name": acc["name"],
            "account_type": acc_type,
            "debit_balance": debit_bal,
            "credit_balance": credit_bal,
        })

    # Sort by account code for readability
    lines.sort(key=lambda x: x["account_code"])

    is_balanced = round(total_debits, 2) == round(total_credits, 2)

    return {
        "org_id": org_id,
        "as_of_date": now,
        "lines": lines,
        "total_debits": total_debits,
        "total_credits": total_credits,
        "is_balanced": is_balanced,
        "generated_at": now,
    }
