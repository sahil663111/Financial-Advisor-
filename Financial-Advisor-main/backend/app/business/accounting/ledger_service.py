"""
Ledger Service — Phase 2.

Generates account-level transaction history with running balance.
The running balance is computed from the opening_balance + sorted journal lines,
so it is always consistent with the journal even after voids.
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId

from app.utils.exceptions import not_found, bad_request
from app.business.accounting.journal_service import _balance_delta


async def get_ledger(
    org_id: str,
    account_code: str,
    db,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> dict:
    """
    Build ledger for a specific account.
    Returns all POSTED journal lines affecting this account, sorted by date,
    with a running balance starting from the account's opening_balance.
    """
    # Resolve account
    account = await db.accounts.find_one(
        {"org_id": org_id, "code": account_code, "is_active": True}
    )
    if not account:
        raise not_found(f"Account '{account_code}'")

    # Fetch all POSTED journal entries that contain this account code
    entry_query: dict = {
        "org_id": org_id,
        "status": "POSTED",
        "lines.account_code": account_code,
    }
    if start_date or end_date:
        entry_query["date"] = {}
        if start_date:
            entry_query["date"]["$gte"] = start_date
        if end_date:
            entry_query["date"]["$lte"] = end_date

    cursor = db.journal_entries.find(entry_query).sort("date", 1)

    ledger_entries = []
    total_debits = 0.0
    total_credits = 0.0
    running_balance = account["opening_balance"]

    async for entry in cursor:
        for line in entry["lines"]:
            if line["account_code"] != account_code:
                continue

            debit = round(line.get("debit", 0.0), 2)
            credit = round(line.get("credit", 0.0), 2)
            delta = _balance_delta(account["account_type"], debit, credit)
            running_balance = round(running_balance + delta, 2)
            total_debits = round(total_debits + debit, 2)
            total_credits = round(total_credits + credit, 2)

            ledger_entries.append({
                "date": entry["date"],
                "entry_number": entry["entry_number"],
                "description": line.get("description") or entry["description"],
                "reference": entry.get("reference"),
                "debit": debit,
                "credit": credit,
                "balance": running_balance,
                "journal_entry_id": str(entry["_id"]),
            })

    return {
        "account_code": account["code"],
        "account_name": account["name"],
        "account_type": account["account_type"],
        "opening_balance": account["opening_balance"],
        "entries": ledger_entries,
        "closing_balance": running_balance,
        "total_debits": total_debits,
        "total_credits": total_credits,
    }


async def get_all_account_balances(org_id: str, db) -> list[dict]:
    """
    Return current_balance for every active account.
    Used by Trial Balance and financial statements.
    """
    cursor = db.accounts.find(
        {"org_id": org_id, "is_active": True}
    ).sort("code", 1)

    balances = []
    async for doc in cursor:
        balances.append({
            "code": doc["code"],
            "name": doc["name"],
            "account_type": doc["account_type"],
            "account_sub_type": doc["account_sub_type"],
            "current_balance": round(doc.get("current_balance", 0.0), 2),
            "opening_balance": round(doc.get("opening_balance", 0.0), 2),
        })
    return balances
