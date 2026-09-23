import motor.motor_asyncio
from mongomock_motor import AsyncMongoMockClient
from datetime import datetime
from app.config import settings
from app.utils.security import hash_password

client = None
db = None


async def seed_local_demo_user():
    """Initialise the demo user automatically when the mock database is used."""
    if db is None:
        return

    existing = await db.users.find_one({"email": "demo@financialos.in"})
    if existing:
        return

    now = datetime.utcnow()
    user_doc = {
        "email": "demo@financialos.in",
        "password_hash": hash_password("Demo@1234"),
        "full_name": "Arjun Mehta",
        "account_type": "INDIVIDUAL",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    await db.profiles.insert_one({
        "user_id": user_id,
        "risk_profile": "MODERATE",
        "currency": "INR",
        "created_at": now,
        "updated_at": now,
    })

    print("✅ Local demo account seeded: demo@financialos.in / Demo@1234")


async def connect_to_mongodb():
    global client, db
    try:
        client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB_NAME]

        await client.admin.command('ping')
        print(f"Connected to MongoDB Atlas: {settings.MONGODB_DB_NAME}")
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        print("Falling back to in-memory MongoDB mock for local development.")
        client = AsyncMongoMockClient()
        db = client[settings.MONGODB_DB_NAME]

    try:
        await create_indexes()
        if settings.ENVIRONMENT == "development":
            await seed_local_demo_user()
    except Exception as e:
        print(f"Failed to initialize MongoDB indexes: {e}")


async def close_mongodb_connection():
    global client
    if client:
        close_fn = getattr(client, "close", None)
        if close_fn:
            close_fn()
        print("🔌 MongoDB connection closed")


async def create_indexes():
    """Create all necessary indexes for performance and uniqueness."""
    # Users
    await db.users.create_index("email", unique=True)

    # Profiles
    await db.profiles.create_index("user_id", unique=True)

    # Income
    await db.income.create_index([("user_id", 1), ("date", -1)])

    # Expenses
    await db.expenses.create_index([("user_id", 1), ("date", -1)])
    await db.expenses.create_index([("user_id", 1), ("category", 1)])

    # Investments
    await db.investments.create_index([("user_id", 1), ("asset_type", 1)])

    # Credit Profiles
    await db.credit_profiles.create_index("user_id", unique=True)

    # Financial Goals
    await db.financial_goals.create_index([("user_id", 1), ("is_active", 1)])

    # Retirement Plans
    await db.retirement_plans.create_index("user_id", unique=True)

    # Tax Profiles
    await db.tax_profiles.create_index("user_id")

    # Financial Health Scores
    await db.financial_health_scores.create_index([("user_id", 1), ("computed_at", -1)])

    # AI conversations
    await db.ai_conversations.create_index([("user_id", 1), ("updated_at", -1)])
    await db.ai_messages.create_index([("conversation_id", 1), ("created_at", 1)])

    # Recommendations
    await db.recommendations.create_index([("user_id", 1), ("is_dismissed", 1)])

    # ── Legacy business collections (kept for backward compat) ────────────────
    await db.companies.create_index("created_by")
    await db.company_users.create_index([("company_id", 1), ("user_id", 1)], unique=True)
    await db.customers.create_index("company_id")
    await db.vendors.create_index("company_id")
    await db.invoices.create_index([("company_id", 1), ("created_at", -1)])

    # ── Phase 1: Organizations ─────────────────────────────────────────────
    await db.organizations.create_index("created_by")
    await db.organizations.create_index("gstin", sparse=True)
    await db.organizations.create_index("pan_number", sparse=True)
    await db.organizations.create_index([("is_active", 1), ("created_at", -1)])

    # ── Phase 1: Org Members ───────────────────────────────────────────────
    await db.org_members.create_index(
        [("org_id", 1), ("user_id", 1)], unique=True
    )
    await db.org_members.create_index([("org_id", 1), ("role", 1)])
    await db.org_members.create_index("user_id")

    # ── Phase 1: Chart of Accounts ─────────────────────────────────────────
    await db.accounts.create_index(
        [("org_id", 1), ("code", 1)], unique=True
    )
    await db.accounts.create_index([("org_id", 1), ("account_type", 1)])
    await db.accounts.create_index([("org_id", 1), ("is_active", 1)])
    await db.accounts.create_index([("org_id", 1), ("parent_code", 1)])

    # ── Phase 1: Audit Log ─────────────────────────────────────────────────
    await db.audit_logs.create_index([("org_id", 1), ("timestamp", -1)])
    await db.audit_logs.create_index([("org_id", 1), ("entity_type", 1)])
    await db.audit_logs.create_index([("org_id", 1), ("user_id", 1)])
    await db.audit_logs.create_index("timestamp")  # TTL candidate

    # ── Phase 2+: Accounting (created now so indexes exist before inserts) ─
    await db.journal_entries.create_index([("org_id", 1), ("date", -1)])
    await db.journal_entries.create_index([("org_id", 1), ("status", 1)])
    await db.journal_lines.create_index([("org_id", 1), ("account_code", 1)])
    await db.journal_lines.create_index("journal_entry_id")

    # ── Phase 3+: Customers, Vendors, Invoices, Payments ──────────────────
    await db.biz_customers.create_index([("org_id", 1), ("name", 1)])
    await db.biz_customers.create_index([("org_id", 1), ("email", 1)])
    await db.biz_vendors.create_index([("org_id", 1), ("name", 1)])
    await db.biz_invoices.create_index([("org_id", 1), ("status", 1)])
    await db.biz_invoices.create_index([("org_id", 1), ("due_date", 1)])
    await db.biz_invoices.create_index([("org_id", 1), ("customer_id", 1)])
    await db.biz_invoices.create_index([("org_id", 1), ("invoice_number", 1)], unique=True, sparse=True)
    await db.payments.create_index([("org_id", 1), ("invoice_id", 1)])
    await db.payments.create_index([("org_id", 1), ("date", -1)])

    # ── biz_bills (Vendor Bills / Payables) ───────────────────────────────────
    await db.biz_bills.create_index([("org_id", 1), ("status", 1)])
    await db.biz_bills.create_index([("org_id", 1), ("due_date", 1)])
    await db.biz_bills.create_index([("org_id", 1), ("vendor_id", 1)])

    # ── Tax rules engine ──────────────────────────────────────────────────────
    await db.biz_tax_rules.create_index([("org_id", 1), ("tax_type", 1), ("section", 1)])
    await db.biz_tax_rules.create_index([("org_id", 1), ("is_active", 1)])
    await db.biz_tax_rules.create_index([("org_id", 1), ("effective_from", -1)])

    # ── Phase 4+: Business Expenses ───────────────────────────────────────
    await db.biz_expenses.create_index([("org_id", 1), ("date", -1)])
    await db.biz_expenses.create_index([("org_id", 1), ("category", 1)])
    await db.biz_expenses.create_index([("org_id", 1), ("status", 1)])

    # ── Phase 5+: Payroll & Employees ─────────────────────────────────────
    await db.employees.create_index([("org_id", 1), ("is_active", 1)])
    await db.employees.create_index([("org_id", 1), ("email", 1)])
    await db.payroll_runs.create_index([("org_id", 1), ("period_year", 1), ("period_month", 1)])
    await db.payroll_items.create_index("payroll_run_id")

    # ── Phase 6+: GST & TDS ───────────────────────────────────────────────
    await db.gst_records.create_index([("org_id", 1), ("period", 1)])
    await db.tds_records.create_index([("org_id", 1), ("due_date", 1)])

    # ── Phase 7+: ML & Forecasting ────────────────────────────────────────
    await db.forecasts.create_index([("org_id", 1), ("forecast_type", 1), ("created_at", -1)])
    await db.anomalies.create_index([("org_id", 1), ("detected_at", -1)])
    await db.anomalies.create_index([("org_id", 1), ("is_resolved", 1)])

    # ── Phase 8+: AI & Notifications ──────────────────────────────────────
    await db.biz_ai_conversations.create_index([("org_id", 1), ("updated_at", -1)])
    await db.biz_ai_messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await db.notifications.create_index([("org_id", 1), ("is_read", 1)])
    await db.notifications.create_index([("org_id", 1), ("created_at", -1)])

    # ── Phase 9+: Budgets ─────────────────────────────────────────────────
    await db.biz_budgets.create_index([("org_id", 1), ("category", 1)], unique=True)
    await db.budget_items.create_index([("org_id", 1), ("budget_id", 1)])
    await db.budget_items.create_index([("org_id", 1), ("period", -1)])

    print("📑 MongoDB indexes created")


def get_db() -> motor.motor_asyncio.AsyncIOMotorDatabase:
    return db
