"""
Chart of Accounts Service.
Handles account CRUD and auto-generation of default accounts on onboarding.
Balance tracking is updated by the Journal Entry engine (Phase 2).
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId
from app.utils.exceptions import not_found, bad_request, conflict


# ── Default COA template ─────────────────────────────────────────────────────
# Each entry: (code, name, account_type, account_sub_type, parent_code, is_system)
_DEFAULT_ACCOUNTS: list[tuple] = [
    # ── ASSETS ───────────────────────────────────────────────────────────────
    ("1000", "Assets",                    "ASSET",     "CURRENT_ASSET",      None,   True),
    ("1100", "Current Assets",            "ASSET",     "CURRENT_ASSET",      "1000", True),
    ("1101", "Cash in Hand",              "ASSET",     "CASH",               "1100", True),
    ("1102", "Bank Accounts",             "ASSET",     "BANK",               "1100", True),
    ("1103", "Petty Cash",                "ASSET",     "CASH",               "1100", True),
    ("1200", "Accounts Receivable",       "ASSET",     "ACCOUNTS_RECEIVABLE","1100", True),
    ("1300", "Inventory",                 "ASSET",     "INVENTORY",          "1100", True),
    ("1400", "Advance to Employees",      "ASSET",     "CURRENT_ASSET",      "1100", True),
    ("1500", "Prepaid Expenses",          "ASSET",     "CURRENT_ASSET",      "1100", True),
    ("1600", "Input Tax Credit (GST)",    "ASSET",     "CURRENT_ASSET",      "1100", True),
    ("1700", "Fixed Assets",              "ASSET",     "FIXED_ASSET",        "1000", True),
    ("1701", "Computers & Equipment",     "ASSET",     "FIXED_ASSET",        "1700", True),
    ("1702", "Furniture & Fixtures",      "ASSET",     "FIXED_ASSET",        "1700", True),
    ("1703", "Vehicles",                  "ASSET",     "FIXED_ASSET",        "1700", True),
    ("1800", "Other Assets",              "ASSET",     "OTHER_ASSET",        "1000", True),
    ("1801", "Security Deposits",         "ASSET",     "OTHER_ASSET",        "1800", True),

    # ── LIABILITIES ──────────────────────────────────────────────────────────
    ("2000", "Liabilities",               "LIABILITY", "CURRENT_LIABILITY",  None,   True),
    ("2100", "Current Liabilities",       "LIABILITY", "CURRENT_LIABILITY",  "2000", True),
    ("2101", "Accounts Payable",          "LIABILITY", "ACCOUNTS_PAYABLE",   "2100", True),
    ("2102", "Salaries Payable",          "LIABILITY", "CURRENT_LIABILITY",  "2100", True),
    ("2103", "TDS Payable",               "LIABILITY", "TAX_PAYABLE",        "2100", True),
    ("2104", "GST Payable (Output)",      "LIABILITY", "TAX_PAYABLE",        "2100", True),
    ("2105", "PF Payable",                "LIABILITY", "CURRENT_LIABILITY",  "2100", True),
    ("2106", "ESIC Payable",              "LIABILITY", "CURRENT_LIABILITY",  "2100", True),
    ("2107", "Advance from Customers",    "LIABILITY", "CURRENT_LIABILITY",  "2100", True),
    ("2200", "Long-Term Liabilities",     "LIABILITY", "LONG_TERM_LIABILITY","2000", True),
    ("2201", "Bank Loans",                "LIABILITY", "LOANS",              "2200", True),
    ("2202", "Director Loans",            "LIABILITY", "LOANS",              "2200", True),

    # ── EQUITY ───────────────────────────────────────────────────────────────
    ("3000", "Equity",                    "EQUITY",    "OWNERS_EQUITY",      None,   True),
    ("3001", "Owner's Capital",           "EQUITY",    "OWNERS_EQUITY",      "3000", True),
    ("3002", "Retained Earnings",         "EQUITY",    "RETAINED_EARNINGS",  "3000", True),
    ("3003", "Share Capital",             "EQUITY",    "OWNERS_EQUITY",      "3000", True),

    # ── REVENUE ──────────────────────────────────────────────────────────────
    ("4000", "Revenue",                   "REVENUE",   "OPERATING_REVENUE",  None,   True),
    ("4001", "Product Sales",             "REVENUE",   "OPERATING_REVENUE",  "4000", True),
    ("4002", "Service Revenue",           "REVENUE",   "OPERATING_REVENUE",  "4000", True),
    ("4003", "Subscription Revenue",      "REVENUE",   "OPERATING_REVENUE",  "4000", True),
    ("4100", "Other Income",              "REVENUE",   "OTHER_INCOME",       "4000", True),
    ("4101", "Interest Income",           "REVENUE",   "OTHER_INCOME",       "4100", True),
    ("4102", "Miscellaneous Income",      "REVENUE",   "OTHER_INCOME",       "4100", True),

    # ── EXPENSES ─────────────────────────────────────────────────────────────
    ("5000", "Expenses",                  "EXPENSE",   "OPERATING_EXPENSE",  None,   True),
    ("5100", "Cost of Goods Sold",        "EXPENSE",   "COST_OF_GOODS",      "5000", True),
    ("5200", "Operating Expenses",        "EXPENSE",   "OPERATING_EXPENSE",  "5000", True),
    ("5201", "Rent",                      "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5202", "Utilities",                 "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5203", "Internet & Communication",  "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5204", "Software & Subscriptions",  "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5205", "Marketing & Advertising",   "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5206", "Travel & Transportation",   "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5207", "Professional Fees",         "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5208", "Office Supplies",           "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5209", "Repairs & Maintenance",     "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5210", "Insurance",                 "EXPENSE",   "OPERATING_EXPENSE",  "5200", True),
    ("5300", "Payroll Expenses",          "EXPENSE",   "PAYROLL_EXPENSE",    "5000", True),
    ("5301", "Salaries & Wages",          "EXPENSE",   "PAYROLL_EXPENSE",    "5300", True),
    ("5302", "Employer PF Contribution",  "EXPENSE",   "PAYROLL_EXPENSE",    "5300", True),
    ("5303", "Employer ESIC Contribution","EXPENSE",   "PAYROLL_EXPENSE",    "5300", True),
    ("5304", "Staff Welfare",             "EXPENSE",   "PAYROLL_EXPENSE",    "5300", True),
    ("5400", "Depreciation",              "EXPENSE",   "DEPRECIATION",       "5000", True),
    ("5500", "Finance Costs",             "EXPENSE",   "INTEREST_EXPENSE",   "5000", True),
    ("5501", "Bank Charges",              "EXPENSE",   "INTEREST_EXPENSE",   "5500", True),
    ("5502", "Loan Interest",             "EXPENSE",   "INTEREST_EXPENSE",   "5500", True),
    ("5600", "Tax Expenses",              "EXPENSE",   "TAX_EXPENSE",        "5000", True),
]


async def generate_default_coa(org_id: str, db, opening_cash: float = 0.0, opening_bank: float = 0.0) -> int:
    """
    Insert the full default Chart of Accounts for a new organisation.
    Called once on onboarding. Returns count of accounts created.
    Idempotent: skips if accounts already exist for this org.
    """
    existing = await db.accounts.count_documents({"org_id": org_id})
    if existing > 0:
        return 0  # already generated

    now = datetime.utcnow()
    docs = []
    for (code, name, acc_type, sub_type, parent, is_system) in _DEFAULT_ACCOUNTS:
        opening = 0.0
        if code == "1101":
            opening = opening_cash
        elif code == "1102":
            opening = opening_bank

        docs.append({
            "org_id": org_id,
            "code": code,
            "name": name,
            "account_type": acc_type,
            "account_sub_type": sub_type,
            "parent_code": parent,
            "description": None,
            "is_bank_account": (sub_type == "BANK"),
            "bank_name": None,
            "bank_account_number": None,
            "opening_balance": opening,
            "current_balance": opening,
            "is_system_account": is_system,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        })

    await db.accounts.insert_many(docs)
    return len(docs)


async def get_accounts_flat(org_id: str, db, active_only: bool = True) -> list[dict]:
    """Return all accounts for an org as a flat list."""
    query: dict = {"org_id": org_id}
    if active_only:
        query["is_active"] = True
    cursor = db.accounts.find(query).sort("code", 1)
    accounts = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        accounts.append(doc)
    return accounts


async def get_accounts_tree(org_id: str, db) -> list[dict]:
    """Return accounts as a hierarchical tree (children nested under parents)."""
    flat = await get_accounts_flat(org_id, db, active_only=True)
    by_code = {a["code"]: {**a, "children": []} for a in flat}

    roots = []
    for acc in flat:
        parent_code = acc.get("parent_code")
        if parent_code and parent_code in by_code:
            by_code[parent_code]["children"].append(by_code[acc["code"]])
        else:
            roots.append(by_code[acc["code"]])
    return roots


async def create_account(org_id: str, data: dict, db) -> dict:
    """Create a custom account. Code must be unique within the org."""
    existing = await db.accounts.find_one({"org_id": org_id, "code": data["code"]})
    if existing:
        raise conflict(f"Account code '{data['code']}' already exists")

    # Validate parent exists if supplied
    if data.get("parent_code"):
        parent = await db.accounts.find_one({"org_id": org_id, "code": data["parent_code"]})
        if not parent:
            raise bad_request(f"Parent account '{data['parent_code']}' not found")

    now = datetime.utcnow()
    doc = {
        "org_id": org_id,
        **data,
        "current_balance": data.get("opening_balance", 0.0),
        "is_system_account": False,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.accounts.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def update_account(org_id: str, account_id: str, updates: dict, db) -> dict:
    """Update a non-system account. System accounts allow limited edits."""
    account = await db.accounts.find_one(
        {"_id": ObjectId(account_id), "org_id": org_id}
    )
    if not account:
        raise not_found("Account")

    # System accounts: only allow name and description updates
    if account.get("is_system_account"):
        allowed = {"name", "description", "bank_name", "bank_account_number"}
        updates = {k: v for k, v in updates.items() if k in allowed}

    updates["updated_at"] = datetime.utcnow()
    await db.accounts.update_one(
        {"_id": ObjectId(account_id)},
        {"$set": updates},
    )
    updated = await db.accounts.find_one({"_id": ObjectId(account_id)})
    updated["_id"] = str(updated["_id"])
    return updated


async def deactivate_account(org_id: str, account_id: str, db) -> None:
    """Soft-delete: mark inactive. Cannot deactivate system accounts."""
    account = await db.accounts.find_one(
        {"_id": ObjectId(account_id), "org_id": org_id}
    )
    if not account:
        raise not_found("Account")
    if account.get("is_system_account"):
        raise bad_request("System accounts cannot be deactivated")
    if account.get("current_balance", 0) != 0:
        raise bad_request("Cannot deactivate an account with a non-zero balance")

    await db.accounts.update_one(
        {"_id": ObjectId(account_id)},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}},
    )
