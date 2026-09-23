
"""
Configurable Tax Rules Engine — Phase 6.

Stores versioned tax rules (GST rates, TDS sections, thresholds) per org.
Rules are resolved by effective date — historical transactions always use
the rule that was active on the transaction date.

Default rules are seeded during business onboarding (Phase 1 hook).
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId
from app.utils.exceptions import not_found, bad_request, conflict


# ══════════════════════════════════════════════════════════════════════════════
# DEFAULT RULES — seeded on org creation
# ══════════════════════════════════════════════════════════════════════════════

_DEFAULT_GST_RULES = [
    {"section": "EXEMPT",  "description": "GST Exempt",          "rate_pct": 0.0,  "threshold": 0},
    {"section": "GST_5",   "description": "GST @ 5%",            "rate_pct": 5.0,  "threshold": 0},
    {"section": "GST_12",  "description": "GST @ 12%",           "rate_pct": 12.0, "threshold": 0},
    {"section": "GST_18",  "description": "GST @ 18% (default)", "rate_pct": 18.0, "threshold": 0},
    {"section": "GST_28",  "description": "GST @ 28%",           "rate_pct": 28.0, "threshold": 0},
]

_DEFAULT_TDS_RULES = [
    {"section": "192",    "description": "TDS on Salary",                             "rate_pct": 0.0,  "threshold": 250000, "applicable_to": "INDIVIDUAL"},
    {"section": "194A",   "description": "TDS on Interest (other than securities)",   "rate_pct": 10.0, "threshold": 40000},
    {"section": "194C",   "description": "TDS on Contractor payments (individual/HUF)","rate_pct": 1.0,  "threshold": 30000, "applicable_to": "INDIVIDUAL"},
    {"section": "194C",   "description": "TDS on Contractor payments (company/firm)",  "rate_pct": 2.0,  "threshold": 30000, "applicable_to": "COMPANY"},
    {"section": "194H",   "description": "TDS on Commission / Brokerage",             "rate_pct": 5.0,  "threshold": 15000},
    {"section": "194I_A", "description": "TDS on Rent — Plant & Machinery",           "rate_pct": 2.0,  "threshold": 240000},
    {"section": "194I_B", "description": "TDS on Rent — Land/Building/Furniture",     "rate_pct": 10.0, "threshold": 240000},
    {"section": "194J",   "description": "TDS on Professional / Technical fees",      "rate_pct": 10.0, "threshold": 30000},
    {"section": "194Q",   "description": "TDS on Purchase of goods",                  "rate_pct": 0.1,  "threshold": 5000000},
]


async def seed_default_rules(org_id: str, db) -> int:
    """
    Seed default GST + TDS rules for a new organisation.
    Called once during onboarding. Idempotent — skips if rules already exist.
    Returns count of rules created.
    """
    existing = await db.biz_tax_rules.count_documents({"org_id": org_id})
    if existing > 0:
        return 0

    now = datetime.utcnow()
    # FY 2024-25 start as default effective date
    effective = datetime(2024, 4, 1)
    docs = []

    for rule in _DEFAULT_GST_RULES:
        docs.append({
            "org_id": org_id,
            "tax_type": "GST",
            "section": rule["section"],
            "description": rule["description"],
            "rate_pct": rule["rate_pct"],
            "threshold": rule["threshold"],
            "effective_from": effective,
            "effective_to": None,
            "jurisdiction": "IN",
            "applicable_to": None,
            "is_default": True,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        })

    for rule in _DEFAULT_TDS_RULES:
        docs.append({
            "org_id": org_id,
            "tax_type": "TDS",
            "section": rule["section"],
            "description": rule["description"],
            "rate_pct": rule["rate_pct"],
            "threshold": rule.get("threshold", 0),
            "effective_from": effective,
            "effective_to": None,
            "jurisdiction": "IN",
            "applicable_to": rule.get("applicable_to"),
            "is_default": True,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        })

    if docs:
        result = await db.biz_tax_rules.insert_many(docs)
        return len(result.inserted_ids)
    return 0


# ══════════════════════════════════════════════════════════════════════════════
# RULE RESOLUTION
# ══════════════════════════════════════════════════════════════════════════════

async def get_applicable_rule(
    org_id: str,
    tax_type: str,
    section: str,
    transaction_date: datetime,
    db,
    applicable_to: Optional[str] = None,
) -> Optional[dict]:
    """
    Resolve the tax rule active on a given transaction date.
    Returns the most recently created matching rule (allows overrides).
    """
    query = {
        "org_id": org_id,
        "tax_type": tax_type,
        "section": section,
        "is_active": True,
        "effective_from": {"$lte": transaction_date},
        "$or": [
            {"effective_to": None},
            {"effective_to": {"$gte": transaction_date}},
        ],
    }
    if applicable_to:
        query["$and"] = [
            query.pop("$or"),
            {"$or": [
                {"applicable_to": applicable_to},
                {"applicable_to": None},
            ]},
        ]
        query["$or"] = query.pop("$and")

    # Most specific (latest created) rule wins
    rule = await db.biz_tax_rules.find_one(
        query, sort=[("is_default", 1), ("created_at", -1)]
    )
    if rule:
        rule["_id"] = str(rule["_id"])
    return rule


async def get_gst_rate(
    org_id: str, category: str, transaction_date: datetime, db
) -> float:
    """Shorthand: get GST rate for a category string like 'GST_18'."""
    rule = await get_applicable_rule(org_id, "GST", category, transaction_date, db)
    return rule["rate_pct"] if rule else 18.0  # fallback default


async def get_tds_rate(
    org_id: str,
    section: str,
    transaction_date: datetime,
    db,
    applicable_to: Optional[str] = None,
) -> dict:
    """Get TDS rate and threshold for a section."""
    rule = await get_applicable_rule(
        org_id, "TDS", section, transaction_date, db, applicable_to
    )
    if rule:
        return {"rate_pct": rule["rate_pct"], "threshold": rule["threshold"]}
    return {"rate_pct": 10.0, "threshold": 0}  # safe fallback


# ══════════════════════════════════════════════════════════════════════════════
# CRUD — tax rules management
# ══════════════════════════════════════════════════════════════════════════════

async def list_rules(
    org_id: str, db,
    tax_type: Optional[str] = None,
    is_active: bool = True,
) -> list[dict]:
    """List all tax rules for an org, optionally filtered by type."""
    query: dict = {"org_id": org_id, "is_active": is_active}
    if tax_type:
        query["tax_type"] = tax_type.upper()

    cursor = db.biz_tax_rules.find(query).sort([("tax_type", 1), ("section", 1), ("effective_from", -1)])
    rules = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        rules.append(doc)
    return rules


async def create_rule(org_id: str, data, db) -> dict:
    """Create a custom tax rule."""
    now = datetime.utcnow()
    doc = {
        "org_id": org_id,
        "tax_type": data.tax_type.value,
        "section": data.section.upper().strip(),
        "description": data.description,
        "rate_pct": data.rate_pct,
        "threshold": data.threshold,
        "effective_from": data.effective_from,
        "effective_to": data.effective_to,
        "jurisdiction": data.jurisdiction,
        "applicable_to": data.applicable_to,
        "is_default": False,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.biz_tax_rules.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def update_rule(org_id: str, rule_id: str, updates: dict, db) -> dict:
    """Update a tax rule. Default rules can only have description/effective_to changed."""
    rule = await db.biz_tax_rules.find_one(
        {"_id": ObjectId(rule_id), "org_id": org_id}
    )
    if not rule:
        raise not_found("Tax rule")

    if rule.get("is_default"):
        # Restrict editable fields for default rules
        allowed = {"description", "effective_to", "is_active"}
        updates = {k: v for k, v in updates.items() if k in allowed}

    if not updates:
        raise bad_request("No valid fields to update")

    updates["updated_at"] = datetime.utcnow()
    await db.biz_tax_rules.update_one(
        {"_id": ObjectId(rule_id)},
        {"$set": updates},
    )
    doc = await db.biz_tax_rules.find_one({"_id": ObjectId(rule_id)})
    doc["_id"] = str(doc["_id"])
    return doc


async def deactivate_rule(org_id: str, rule_id: str, db) -> None:
    """Soft-deactivate a tax rule."""
    rule = await db.biz_tax_rules.find_one(
        {"_id": ObjectId(rule_id), "org_id": org_id}
    )
    if not rule:
        raise not_found("Tax rule")

    await db.biz_tax_rules.update_one(
        {"_id": ObjectId(rule_id)},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}},
    )
