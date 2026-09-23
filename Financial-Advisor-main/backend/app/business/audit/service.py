"""
Audit Log Service.
Every significant financial action goes through log_action().
Records are immutable — never update or delete audit entries.
"""
from datetime import datetime
from typing import Any, Optional
from fastapi import Request


async def log_action(
    db,
    *,
    org_id: str,
    user_id: str,
    action: str,                    # e.g. "CREATE_INVOICE", "UPDATE_ACCOUNT"
    entity_type: str,               # e.g. "invoice", "account", "employee"
    entity_id: Optional[str] = None,
    previous_value: Optional[Any] = None,
    new_value: Optional[Any] = None,
    description: Optional[str] = None,
    request: Optional[Request] = None,
) -> None:
    """
    Write an audit entry. Fire-and-forget — caller does not wait for this.
    Never raises: a logging failure must never break a financial transaction.
    """
    try:
        entry = {
            "org_id": org_id,
            "user_id": user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "previous_value": _sanitize(previous_value),
            "new_value": _sanitize(new_value),
            "description": description,
            "ip_address": _get_ip(request),
            "user_agent": _get_ua(request),
            "timestamp": datetime.utcnow(),
        }
        await db.audit_logs.insert_one(entry)
    except Exception:
        # Log to stderr but never propagate — audit failure ≠ operation failure
        import traceback
        traceback.print_exc()


def _sanitize(value: Any) -> Any:
    """Strip secrets and reduce size before storing."""
    if value is None:
        return None
    if isinstance(value, dict):
        blocked = {"password", "token", "secret", "api_key", "bank_account_number"}
        return {k: "***" if k in blocked else v for k, v in value.items()}
    return value


def _get_ip(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def _get_ua(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    return request.headers.get("User-Agent")


# ── Audit action constants (prevents typos across codebase) ──────────────────
class AuditAction:
    # Organization
    CREATE_ORG = "CREATE_ORGANIZATION"
    UPDATE_ORG = "UPDATE_ORGANIZATION"
    # Members
    INVITE_MEMBER = "INVITE_MEMBER"
    UPDATE_MEMBER_ROLE = "UPDATE_MEMBER_ROLE"
    REMOVE_MEMBER = "REMOVE_MEMBER"
    # Chart of Accounts
    CREATE_ACCOUNT = "CREATE_ACCOUNT"
    UPDATE_ACCOUNT = "UPDATE_ACCOUNT"
    DEACTIVATE_ACCOUNT = "DEACTIVATE_ACCOUNT"
    # Accounting (Phase 2+)
    POST_JOURNAL = "POST_JOURNAL"
    VOID_JOURNAL = "VOID_JOURNAL"
    # Invoices (Phase 3+)
    CREATE_INVOICE = "CREATE_INVOICE"
    UPDATE_INVOICE = "UPDATE_INVOICE"
    DELETE_INVOICE = "DELETE_INVOICE"
    MARK_INVOICE_PAID = "MARK_INVOICE_PAID"
    # Expenses (Phase 4+)
    CREATE_EXPENSE = "CREATE_EXPENSE"
    APPROVE_EXPENSE = "APPROVE_EXPENSE"
    REJECT_EXPENSE = "REJECT_EXPENSE"
    # Payroll (Phase 5+)
    RUN_PAYROLL = "RUN_PAYROLL"
    APPROVE_PAYROLL = "APPROVE_PAYROLL"
    # Tax (Phase 6+)
    CREATE_TAX_RECORD = "CREATE_TAX_RECORD"
    UPDATE_TAX_RECORD = "UPDATE_TAX_RECORD"
    CREATE_TAX_RULE = "CREATE_TAX_RULE"
    UPDATE_TAX_RULE = "UPDATE_TAX_RULE"
    DEACTIVATE_TAX_RULE = "DEACTIVATE_TAX_RULE"
