"""
Journal Entry Service — Phase 2.

Core accounting invariant enforced here:
    sum(debits) == sum(credits)
    This is a HARD ERROR — no journal entry may be posted unless balanced.

Balance tracking:
    Every POSTED entry updates current_balance on each affected account.
    ASSET / EXPENSE: debit increases balance, credit decreases.
    LIABILITY / EQUITY / REVENUE: credit increases balance, debit decreases.

Voiding:
    Creates a reversing entry (all signs flipped) and marks original VOID.
    Financial records are never deleted — only voided.
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId

from app.utils.exceptions import not_found, bad_request, forbidden
from app.business.accounting.journal_schemas import (
    CreateJournalEntryRequest,
    JournalStatus,
)
from app.business.audit.service import log_action, AuditAction


# ── Normal-balance map ────────────────────────────────────────────────────────
# Accounts whose balance INCREASES on DEBIT
_DEBIT_NORMAL = {"ASSET", "EXPENSE"}
# Accounts whose balance INCREASES on CREDIT
_CREDIT_NORMAL = {"LIABILITY", "EQUITY", "REVENUE"}

_ROUNDING = 2   # All monetary values rounded to 2 decimal places


def _balance_delta(account_type: str, debit: float, credit: float) -> float:
    """
    Return the signed change to current_balance for an account given a line's
    debit/credit amounts.

    ASSET/EXPENSE  → debit adds, credit subtracts
    LIABILITY/EQUITY/REVENUE → credit adds, debit subtracts
    """
    if account_type in _DEBIT_NORMAL:
        return round(debit - credit, _ROUNDING)
    return round(credit - debit, _ROUNDING)


async def _next_entry_number(org_id: str, db) -> str:
    """Generate sequential JE number: JE-YYYY-NNNN."""
    year = datetime.utcnow().year
    count = await db.journal_entries.count_documents({"org_id": org_id})
    return f"JE-{year}-{count + 1:04d}"


# ── Create ────────────────────────────────────────────────────────────────────

async def create_journal_entry(
    org_id: str,
    user_id: str,
    data: CreateJournalEntryRequest,
    db,
    request=None,
) -> dict:
    """
    Validate, balance-check, persist a journal entry, and update account balances.
    Raises 400 if debits ≠ credits (hard accounting constraint).
    """
    # ── 1. Balance check ──────────────────────────────────────────────────────
    total_debit = round(sum(l.debit for l in data.lines), _ROUNDING)
    total_credit = round(sum(l.credit for l in data.lines), _ROUNDING)

    if total_debit != total_credit:
        raise bad_request(
            f"Journal entry is not balanced. "
            f"Total debits ₹{total_debit:,.2f} ≠ Total credits ₹{total_credit:,.2f}. "
            f"Difference: ₹{abs(total_debit - total_credit):,.2f}"
        )

    if total_debit == 0:
        raise bad_request("Journal entry amounts cannot all be zero")

    # ── 2. Resolve and validate all account codes ─────────────────────────────
    codes = [l.account_code for l in data.lines]
    cursor = db.accounts.find(
        {"org_id": org_id, "code": {"$in": codes}, "is_active": True}
    )
    account_docs = {doc["code"]: doc async for doc in cursor}

    missing = [c for c in codes if c not in account_docs]
    if missing:
        raise bad_request(f"Unknown or inactive account codes: {', '.join(missing)}")

    # ── 3. Persist journal entry ──────────────────────────────────────────────
    now = datetime.utcnow()
    entry_number = await _next_entry_number(org_id, db)

    line_docs = []
    for line in data.lines:
        acc = account_docs[line.account_code]
        line_docs.append({
            "account_code": line.account_code,
            "account_name": acc["name"],
            "account_type": acc["account_type"],
            "description": line.description,
            "debit": line.debit,
            "credit": line.credit,
        })

    entry_doc = {
        "org_id": org_id,
        "entry_number": entry_number,
        "date": data.date,
        "description": data.description,
        "reference": data.reference,
        "status": JournalStatus.POSTED.value,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "lines": line_docs,
        "tags": data.tags,
        "created_by": user_id,
        "created_at": now,
        "posted_at": now,
        "voided_at": None,
        "void_reason": None,
        "reversing_entry_id": None,
    }

    result = await db.journal_entries.insert_one(entry_doc)
    entry_id = str(result.inserted_id)

    # ── 4. Update account balances atomically ─────────────────────────────────
    for line in data.lines:
        acc = account_docs[line.account_code]
        delta = _balance_delta(acc["account_type"], line.debit, line.credit)
        await db.accounts.update_one(
            {"org_id": org_id, "code": line.account_code},
            {
                "$inc": {"current_balance": delta},
                "$set": {"updated_at": now},
            },
        )

    await log_action(
        db,
        org_id=org_id,
        user_id=user_id,
        action=AuditAction.POST_JOURNAL,
        entity_type="journal_entry",
        entity_id=entry_id,
        new_value={
            "entry_number": entry_number,
            "description": data.description,
            "total_debit": total_debit,
            "date": data.date.isoformat(),
        },
        request=request,
    )

    entry_doc["_id"] = entry_id
    return entry_doc


# ── Read ──────────────────────────────────────────────────────────────────────

async def list_journal_entries(
    org_id: str,
    db,
    page: int = 1,
    limit: int = 50,
    status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    reference: Optional[str] = None,
    account_code: Optional[str] = None,
) -> dict:
    """List journal entries with optional filters."""
    query: dict = {"org_id": org_id}

    if status:
        query["status"] = status.upper()
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date
    if reference:
        query["reference"] = {"$regex": reference, "$options": "i"}
    if account_code:
        query["lines.account_code"] = account_code

    skip = (page - 1) * limit
    total = await db.journal_entries.count_documents(query)
    cursor = (
        db.journal_entries.find(query)
        .sort("date", -1)
        .skip(skip)
        .limit(limit)
    )

    entries = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        entries.append(doc)

    return {
        "data": entries,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
    }


async def get_journal_entry(org_id: str, entry_id: str, db) -> dict:
    """Fetch a single journal entry."""
    doc = await db.journal_entries.find_one(
        {"_id": ObjectId(entry_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Journal entry")
    doc["_id"] = str(doc["_id"])
    return doc


# ── Void ──────────────────────────────────────────────────────────────────────

async def void_journal_entry(
    org_id: str,
    entry_id: str,
    user_id: str,
    reason: str,
    db,
    request=None,
) -> dict:
    """
    Void a POSTED journal entry by:
    1. Marking original entry as VOID
    2. Creating a reversing entry (all debits/credits flipped) — so account
       balances remain correct via the normal balance-update path.
    Financial records are never deleted.
    """
    entry = await db.journal_entries.find_one(
        {"_id": ObjectId(entry_id), "org_id": org_id}
    )
    if not entry:
        raise not_found("Journal entry")

    if entry["status"] == JournalStatus.VOID.value:
        raise bad_request("This journal entry is already voided")

    if entry["status"] == JournalStatus.DRAFT.value:
        raise bad_request("Draft entries cannot be voided — delete them instead")

    now = datetime.utcnow()

    # ── Create reversing entry ─────────────────────────────────────────────
    rev_lines = [
        {
            "account_code": l["account_code"],
            "account_name": l["account_name"],
            "account_type": l["account_type"],
            "description": f"VOID: {l.get('description') or entry['description']}",
            "debit": l["credit"],    # flip
            "credit": l["debit"],    # flip
        }
        for l in entry["lines"]
    ]

    rev_number = await _next_entry_number(org_id, db)
    rev_doc = {
        "org_id": org_id,
        "entry_number": rev_number,
        "date": now,
        "description": f"VOID of {entry['entry_number']}: {reason}",
        "reference": entry.get("reference"),
        "status": JournalStatus.POSTED.value,
        "total_debit": entry["total_credit"],   # flipped totals
        "total_credit": entry["total_debit"],
        "lines": rev_lines,
        "tags": ["void", "reversal"],
        "created_by": user_id,
        "created_at": now,
        "posted_at": now,
        "voided_at": None,
        "void_reason": None,
        "reversing_entry_id": None,
        "reverses_entry_id": entry_id,
    }
    rev_result = await db.journal_entries.insert_one(rev_doc)
    rev_id = str(rev_result.inserted_id)

    # ── Update balances via reversing lines ────────────────────────────────
    for line in rev_lines:
        delta = _balance_delta(line["account_type"], line["debit"], line["credit"])
        await db.accounts.update_one(
            {"org_id": org_id, "code": line["account_code"]},
            {"$inc": {"current_balance": delta}, "$set": {"updated_at": now}},
        )

    # ── Mark original as VOID ──────────────────────────────────────────────
    await db.journal_entries.update_one(
        {"_id": ObjectId(entry_id)},
        {
            "$set": {
                "status": JournalStatus.VOID.value,
                "voided_at": now,
                "void_reason": reason,
                "reversing_entry_id": rev_id,
            }
        },
    )

    await log_action(
        db,
        org_id=org_id,
        user_id=user_id,
        action=AuditAction.VOID_JOURNAL,
        entity_type="journal_entry",
        entity_id=entry_id,
        previous_value={"status": "POSTED", "entry_number": entry["entry_number"]},
        new_value={"status": "VOID", "reason": reason, "reversing_entry_id": rev_id},
        request=request,
    )

    voided = await db.journal_entries.find_one({"_id": ObjectId(entry_id)})
    voided["_id"] = str(voided["_id"])
    return voided
