
"""
Business Seed Data — TechNova Solutions Pvt. Ltd.
SaaS company, 12 months of realistic financial history.

Run: python scripts/seed_business.py

Demo credentials:
  Business Owner: business@technova.in / Demo@1234
  Accountant:     accountant@technova.in / Demo@1234
"""
import asyncio
import sys
import os
import random
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.database import connect_to_mongodb, get_db
from app.utils.security import hash_password
from app.business.accounting.coa_service import generate_default_coa
from app.business.tax.rules_engine import seed_default_rules

# ── Constants ─────────────────────────────────────────────────────────────────
OWNER_EMAIL    = "business@technova.in"
ACCT_EMAIL     = "accountant@technova.in"
PASSWORD       = "Demo@1234"
NOW            = datetime.utcnow()
MONTHS         = 12


def months_ago(n: int, day: int = 1) -> datetime:
    d = NOW - relativedelta(months=n)
    return d.replace(day=day, hour=0, minute=0, second=0, microsecond=0)


def rand_date(base: datetime, spread_days: int = 20) -> datetime:
    return base + timedelta(days=random.randint(1, spread_days))


# ── Customers ─────────────────────────────────────────────────────────────────
CUSTOMERS = [
    {"name": "Acme Technologies Pvt. Ltd.", "email": "accounts@acmetech.in",
     "phone": "9876543210", "gstin": "27AABCA1234A1Z5", "city": "Mumbai", "state": "Maharashtra",
     "payment_terms_days": 30},
    {"name": "FinServ Analytics Ltd.", "email": "billing@finserv.io",
     "phone": "9871234567", "gstin": "19AABCF5678B2Z3", "city": "Kolkata", "state": "West Bengal",
     "payment_terms_days": 45},
    {"name": "GlobalMart India Pvt. Ltd.", "email": "ap@globalmart.com",
     "phone": "9823456789", "gstin": "06AABCG3456C3Z1", "city": "Gurugram", "state": "Haryana",
     "payment_terms_days": 30},
    {"name": "StartupHub Accelerator", "email": "finance@startuphub.in",
     "phone": "9834567890", "gstin": None, "city": "Bengaluru", "state": "Karnataka",
     "payment_terms_days": 15},
    {"name": "EduLearn Solutions Pvt. Ltd.", "email": "payments@edulearn.co.in",
     "phone": "9845678901", "gstin": "29AABCE9012D4Z7", "city": "Bengaluru", "state": "Karnataka",
     "payment_terms_days": 30},
    {"name": "MediCare Systems Ltd.", "email": "accounts@medicare.in",
     "phone": "9856789012", "gstin": "27AABCM2345E5Z9", "city": "Pune", "state": "Maharashtra",
     "payment_terms_days": 60},
    {"name": "RetailFirst Chain Pvt. Ltd.", "email": "vendor@retailfirst.com",
     "phone": "9867890123", "gstin": "24AABCR6789F6Z2", "city": "Ahmedabad", "state": "Gujarat",
     "payment_terms_days": 30},
    {"name": "LogiPort Freight Services", "email": "billing@logiport.in",
     "phone": "9878901234", "gstin": "33AABCL1234G7Z4", "city": "Chennai", "state": "Tamil Nadu",
     "payment_terms_days": 45},
    {"name": "CloudNine Hosting Pvt. Ltd.", "email": "finance@cloudnine.io",
     "phone": "9889012345", "gstin": "07AABCC4567H8Z6", "city": "New Delhi", "state": "Delhi",
     "payment_terms_days": 30},
    {"name": "InnoBuild Constructions", "email": "payments@innobuild.in",
     "phone": "9890123456", "gstin": "36AABCI7890I9Z8", "city": "Hyderabad", "state": "Telangana",
     "payment_terms_days": 45},
]

# ── Vendors ───────────────────────────────────────────────────────────────────
VENDORS = [
    {"name": "AWS (Amazon Web Services)", "email": "billing@aws.amazon.com",
     "phone": None, "gstin": "07AAACA3325K1ZK", "city": "New Delhi", "state": "Delhi",
     "payment_terms_days": 30},
    {"name": "Razorpay Software Pvt. Ltd.", "email": "enterprise@razorpay.com",
     "phone": "8040989898", "gstin": "29AABCR1234L2Z5", "city": "Bengaluru", "state": "Karnataka",
     "payment_terms_days": 30},
    {"name": "Zoho Corporation Pvt. Ltd.", "email": "billing@zohocorp.com",
     "phone": "4435440450", "gstin": "33AABCZ5678M3Z3", "city": "Chennai", "state": "Tamil Nadu",
     "payment_terms_days": 30},
    {"name": "WeWork India Management Pvt. Ltd.", "email": "india@wework.com",
     "phone": "8048482000", "gstin": "29AABCW2345N4Z1", "city": "Bengaluru", "state": "Karnataka",
     "payment_terms_days": 30},
    {"name": "TeamLease Staffing Ltd.", "email": "accounts@teamlease.com",
     "phone": "8030461100", "gstin": "29AABCT6789O5Z9", "city": "Bengaluru", "state": "Karnataka",
     "payment_terms_days": 30},
    {"name": "Indus Knowledgecorp Pvt. Ltd.", "email": "billing@indusknowledge.in",
     "phone": "9632587410", "gstin": "27AABCI3456P6Z7", "city": "Mumbai", "state": "Maharashtra",
     "payment_terms_days": 45},
    {"name": "Dell Technologies India", "email": "accounts@dell.com",
     "phone": "1800425010", "gstin": "33AABCD7890Q7Z5", "city": "Chennai", "state": "Tamil Nadu",
     "payment_terms_days": 30},
    {"name": "HDFC Bank Ltd. (Loan)", "email": "corporate@hdfcbank.com",
     "phone": "18002026161", "gstin": "27AAACH4702H1ZC", "city": "Mumbai", "state": "Maharashtra",
     "payment_terms_days": 30},
    {"name": "Jio Business (JioFiber)", "email": "enterprise@jio.com",
     "phone": "1800889900", "gstin": "27AAACR5055K1Z5", "city": "Mumbai", "state": "Maharashtra",
     "payment_terms_days": 30},
    {"name": "IndiaMart InterMesh Ltd.", "email": "billing@indiamart.com",
     "phone": "9696969696", "gstin": "09AAACI4034A1Z3", "city": "Noida", "state": "Uttar Pradesh",
     "payment_terms_days": 30},
]


# ── Employees ─────────────────────────────────────────────────────────────────
EMPLOYEES_DATA = [
    {"first_name": "Priya",    "last_name": "Sharma",    "designation": "CTO",                  "department": "Engineering",  "basic": 180000, "hra": 72000, "special": 30000},
    {"first_name": "Rahul",    "last_name": "Verma",     "designation": "Senior Backend Dev",   "department": "Engineering",  "basic": 120000, "hra": 48000, "special": 20000},
    {"first_name": "Ananya",   "last_name": "Singh",     "designation": "Frontend Dev",         "department": "Engineering",  "basic": 90000,  "hra": 36000, "special": 15000},
    {"first_name": "Vikram",   "last_name": "Patel",     "designation": "DevOps Engineer",      "department": "Engineering",  "basic": 100000, "hra": 40000, "special": 18000},
    {"first_name": "Sneha",    "last_name": "Iyer",      "designation": "QA Engineer",          "department": "Engineering",  "basic": 75000,  "hra": 30000, "special": 12000},
    {"first_name": "Arjun",    "last_name": "Kumar",     "designation": "VP Sales",             "department": "Sales",        "basic": 150000, "hra": 60000, "special": 25000},
    {"first_name": "Divya",    "last_name": "Nair",      "designation": "Account Executive",    "department": "Sales",        "basic": 70000,  "hra": 28000, "special": 10000},
    {"first_name": "Karan",    "last_name": "Mehta",     "designation": "Sales Manager",        "department": "Sales",        "basic": 100000, "hra": 40000, "special": 15000},
    {"first_name": "Pooja",    "last_name": "Gupta",     "designation": "Marketing Lead",       "department": "Marketing",    "basic": 85000,  "hra": 34000, "special": 13000},
    {"first_name": "Rohit",    "last_name": "Joshi",     "designation": "Content Writer",       "department": "Marketing",    "basic": 55000,  "hra": 22000, "special":  8000},
    {"first_name": "Neha",     "last_name": "Kapoor",    "designation": "CFO",                  "department": "Finance",      "basic": 200000, "hra": 80000, "special": 35000},
    {"first_name": "Sameer",   "last_name": "Bajaj",     "designation": "Senior Accountant",    "department": "Finance",      "basic": 80000,  "hra": 32000, "special": 12000},
    {"first_name": "Ritu",     "last_name": "Agarwal",   "designation": "HR Manager",           "department": "HR",           "basic": 75000,  "hra": 30000, "special": 10000},
    {"first_name": "Ajay",     "last_name": "Desai",     "designation": "Product Manager",      "department": "Product",      "basic": 130000, "hra": 52000, "special": 22000},
    {"first_name": "Meera",    "last_name": "Pillai",    "designation": "UX Designer",          "department": "Product",      "basic": 85000,  "hra": 34000, "special": 13000},
]

# ── Invoice line item templates per customer (SaaS model) ────────────────────
INVOICE_ITEMS_BY_CUSTOMER = {
    0: [("SaaS Platform License — Enterprise Plan",    180000, 18)],
    1: [("Analytics Dashboard Subscription",           95000,  18),
        ("Data API Access (10M calls)",                25000,  18)],
    2: [("E-commerce Integration Module",              220000, 18)],
    3: [("Startup Mentorship SaaS Tool",               45000,  18)],
    4: [("EdTech LMS Integration",                     130000, 18)],
    5: [("Healthcare Compliance Module",               160000, 18)],
    6: [("Retail Analytics Dashboard",                  75000, 18)],
    7: [("Supply Chain Visibility Platform",           110000, 18)],
    8: [("Cloud Cost Optimization Suite",               85000, 18)],
    9: [("Construction Project Tracker",                70000, 18)],
}

# ── Business expense templates ────────────────────────────────────────────────
EXPENSE_TEMPLATES = [
    ("SOFTWARE",          "AWS Cloud Hosting",              "AWS",               85000,  8000,  0),
    ("SOFTWARE",          "Zoho Suite subscription",        "Zoho",              12000,  0,     0),
    ("RENT",              "WeWork office rent — Bengaluru", "WeWork",            120000, 0,     0),
    ("INTERNET",          "JioFiber Business broadband",    "Jio",               4999,   0,     0),
    ("MARKETING",         "Google Ads campaign",            "Google",            35000,  10000, 0),
    ("MARKETING",         "LinkedIn Ads",                   "LinkedIn",          20000,  5000,  0),
    ("TRAVEL",            "Team outstation travel",         "MakeMyTrip",        25000,  10000, 0),
    ("MEALS",             "Team lunch & client meals",      "Swiggy for Biz",    8000,   2000,  0),
    ("PROFESSIONAL_FEES", "Legal & compliance retainer",    "Legalwise LLP",     15000,  0,     0),
    ("SOFTWARE",          "GitHub Enterprise",              "GitHub",            8500,   0,     0),
    ("OFFICE_SUPPLIES",   "Office supplies & stationery",   "Staples",           5000,   1000,  0),
    ("INSURANCE",         "Business liability insurance",   "ICICI Lombard",     18000,  0,     0),
]


async def seed():
    await connect_to_mongodb()
    db = get_db()

    print("🌱  TechNova Solutions — Business Seed Data")
    print("=" * 55)

    # ═══════════════════════════════════════════════════════════
    # CLEAN EXISTING DEMO DATA
    # ═══════════════════════════════════════════════════════════
    for email in [OWNER_EMAIL, ACCT_EMAIL]:
        u = await db.users.find_one({"email": email})
        if u:
            await db.users.delete_one({"_id": u["_id"]})

    # Remove demo org by name
    old_org = await db.organizations.find_one({"name": "TechNova Solutions Pvt. Ltd."})
    if old_org:
        oid = str(old_org["_id"])
        for col in [
            "org_members", "accounts", "journal_entries", "journal_lines",
            "biz_customers", "biz_vendors", "biz_invoices", "payments",
            "biz_bills", "biz_expenses", "employees", "payroll_runs",
            "payroll_items", "anomalies", "biz_budgets", "biz_tax_rules",
            "audit_logs", "forecasts", "biz_ai_conversations",
        ]:
            await db[col].delete_many({"org_id": oid})
        await db.organizations.delete_one({"_id": old_org["_id"]})
        print(f"🗑️   Removed existing TechNova org ({oid})")

    # ═══════════════════════════════════════════════════════════
    # CREATE USERS
    # ═══════════════════════════════════════════════════════════
    pwd_hash = hash_password(PASSWORD)
    now = datetime.utcnow()

    owner_res = await db.users.insert_one({
        "email": OWNER_EMAIL, "password_hash": pwd_hash,
        "full_name": "Neha Kapoor", "account_type": "BUSINESS",
        "is_active": True, "created_at": now, "updated_at": now,
    })
    owner_id = str(owner_res.inserted_id)

    acct_res = await db.users.insert_one({
        "email": ACCT_EMAIL, "password_hash": pwd_hash,
        "full_name": "Sameer Bajaj", "account_type": "BUSINESS",
        "is_active": True, "created_at": now, "updated_at": now,
    })
    acct_id = str(acct_res.inserted_id)
    print(f"✅  Users created: {OWNER_EMAIL} / {ACCT_EMAIL}")

    # ═══════════════════════════════════════════════════════════
    # CREATE ORGANISATION
    # ═══════════════════════════════════════════════════════════
    org_res = await db.organizations.insert_one({
        "name":              "TechNova Solutions Pvt. Ltd.",
        "legal_name":        "TechNova Solutions Private Limited",
        "business_type":     "PRIVATE_LIMITED",
        "industry":          "Technology",
        "pan_number":        "AABCT1234N",
        "gstin":             "29AABCT1234N1Z5",
        "tan":               "BLRT12345B",
        "address":           "12th Floor, Prestige Tech Park, Outer Ring Road",
        "city":              "Bengaluru",
        "state":             "Karnataka",
        "pincode":           "560103",
        "country":           "India",
        "financial_year_start": 4,
        "accounting_method": "ACCRUAL",
        "currency":          "INR",
        "fiscal_year_label": "2024-25",
        "website":           "https://technova.io",
        "phone":             "08041234567",
        "email":             "finance@technova.io",
        "is_active":         True,
        "created_by":        owner_id,
        "created_at":        now,
        "updated_at":        now,
    })
    org_id = str(org_res.inserted_id)

    await db.org_members.insert_many([
        {"org_id": org_id, "user_id": owner_id, "role": "OWNER",
         "joined_at": now, "invited_by": owner_id},
        {"org_id": org_id, "user_id": acct_id, "role": "ACCOUNTANT",
         "joined_at": now, "invited_by": owner_id},
    ])
    print(f"✅  Organisation: TechNova Solutions ({org_id})")

    # ═══════════════════════════════════════════════════════════
    # CHART OF ACCOUNTS
    # ═══════════════════════════════════════════════════════════
    coa_count = await generate_default_coa(
        org_id, db,
        opening_cash=500000.0,
        opening_bank=4200000.0,
    )
    print(f"✅  Chart of Accounts: {coa_count} accounts generated")

    # ═══════════════════════════════════════════════════════════
    # TAX RULES
    # ═══════════════════════════════════════════════════════════
    tax_count = await seed_default_rules(org_id, db)
    print(f"✅  Tax rules: {tax_count} default rules seeded")

    # ═══════════════════════════════════════════════════════════
    # CUSTOMERS
    # ═══════════════════════════════════════════════════════════
    customer_ids = []
    for c in CUSTOMERS:
        res = await db.biz_customers.insert_one({
            "org_id": org_id, **c,
            "credit_limit": random.choice([500000, 1000000, 2000000]),
            "notes": "Demo customer — TechNova seed data",
            "is_active": True,
            "created_by": owner_id,
            "created_at": months_ago(MONTHS),
            "updated_at": now,
        })
        customer_ids.append(str(res.inserted_id))
    print(f"✅  Customers: {len(customer_ids)} created")

    # ═══════════════════════════════════════════════════════════
    # VENDORS
    # ═══════════════════════════════════════════════════════════
    vendor_ids = []
    for v in VENDORS:
        res = await db.biz_vendors.insert_one({
            "org_id": org_id, **v,
            "bank_name": "HDFC Bank",
            "bank_account_number": f"50{random.randint(100000000, 999999999)}",
            "ifsc_code": "HDFC0001234",
            "notes": "Demo vendor — TechNova seed data",
            "is_active": True,
            "created_by": owner_id,
            "created_at": months_ago(MONTHS),
            "updated_at": now,
        })
        vendor_ids.append(str(res.inserted_id))
    print(f"✅  Vendors: {len(vendor_ids)} created")

    # ═══════════════════════════════════════════════════════════
    # INVOICES & PAYMENTS — 12 months
    # ═══════════════════════════════════════════════════════════
    invoice_count = 0
    payment_count = 0

    for month_i in range(MONTHS, -1, -1):
        issue_date = months_ago(month_i, day=random.randint(1, 10))

        # Each month: 3–6 invoices to different customers
        num_invoices = random.randint(3, 6)
        selected_customers = random.sample(range(len(customer_ids)), min(num_invoices, len(customer_ids)))

        for cust_idx in selected_customers:
            cust_id   = customer_ids[cust_idx]
            cust_name = CUSTOMERS[cust_idx]["name"]
            terms     = CUSTOMERS[cust_idx]["payment_terms_days"]
            due_date  = issue_date + timedelta(days=terms)

            # Build items
            item_templates = INVOICE_ITEMS_BY_CUSTOMER.get(cust_idx, [("Software License", 100000, 18)])
            items = []
            subtotal  = 0.0
            total_gst = 0.0
            for desc, base_price, gst_rate in item_templates:
                price     = base_price * random.uniform(0.9, 1.1)
                taxable   = round(price, 2)
                gst_amt   = round(taxable * gst_rate / 100, 2)
                line_total = round(taxable + gst_amt, 2)
                items.append({
                    "description":   desc,
                    "quantity":      1.0,
                    "unit_price":    taxable,
                    "discount_pct":  0.0,
                    "gst_rate_pct":  gst_rate,
                    "gst_type":      "CGST_SGST",
                    "account_code":  "4002",
                    "taxable_amount": taxable,
                    "gst_amount":    gst_amt,
                    "cgst":          round(gst_amt / 2, 2),
                    "sgst":          round(gst_amt / 2, 2),
                    "igst":          0.0,
                    "line_total":    line_total,
                })
                subtotal  += taxable
                total_gst += gst_amt

            subtotal     = round(subtotal, 2)
            total_gst    = round(total_gst, 2)
            total_amount = round(subtotal + total_gst, 2)

            # Determine status based on age
            days_old = (NOW - issue_date).days
            if days_old > terms + 30:
                # Mostly paid, some overdue
                status     = random.choices(["PAID", "OVERDUE"], weights=[85, 15])[0]
                amount_paid = total_amount if status == "PAID" else 0.0
            elif days_old > terms:
                status      = random.choices(["PAID", "OVERDUE", "PARTIALLY_PAID"], weights=[60, 25, 15])[0]
                amount_paid = total_amount if status == "PAID" else (total_amount * 0.5 if status == "PARTIALLY_PAID" else 0.0)
            else:
                status      = random.choices(["SENT", "PARTIALLY_PAID"], weights=[80, 20])[0]
                amount_paid = total_amount * 0.5 if status == "PARTIALLY_PAID" else 0.0

            amount_paid = round(amount_paid, 2)
            amount_due  = round(total_amount - amount_paid, 2)
            inv_number  = f"INV-2024-{invoice_count + 1:04d}"

            inv_res = await db.biz_invoices.insert_one({
                "org_id":                   org_id,
                "invoice_number":           inv_number,
                "customer_id":              cust_id,
                "customer_name":            cust_name,
                "customer_gstin":           CUSTOMERS[cust_idx].get("gstin"),
                "issue_date":               issue_date,
                "due_date":                 due_date,
                "items":                    items,
                "subtotal":                 subtotal,
                "total_gst":                total_gst,
                "total_amount":             total_amount,
                "amount_paid":              amount_paid,
                "amount_due":               amount_due,
                "status":                   status,
                "notes":                    "Demo invoice — TechNova seed data",
                "billing_address":          CUSTOMERS[cust_idx].get("city", ""),
                "receivable_account_code":  "1200",
                "revenue_account_code":     "4002",
                "gst_payable_account_code": "2104",
                "journal_entry_id":         None,
                "payments":                 [],
                "created_by":               owner_id,
                "created_at":               issue_date,
                "updated_at":               now,
            })
            invoice_count += 1

            # Record payment if paid/partial
            if amount_paid > 0:
                pay_date = issue_date + timedelta(days=random.randint(5, terms))
                await db.biz_invoices.update_one(
                    {"_id": inv_res.inserted_id},
                    {"$push": {"payments": {
                        "amount":         amount_paid,
                        "payment_date":   pay_date,
                        "payment_method": random.choice(["BANK_TRANSFER", "UPI", "CHEQUE"]),
                        "reference":      f"UTR{random.randint(100000000000, 999999999999)}",
                        "bank_account_code": "1102",
                        "notes":          None,
                        "recorded_by":    acct_id,
                        "recorded_at":    pay_date,
                    }}},
                )
                payment_count += 1

    print(f"✅  Invoices: {invoice_count} created, {payment_count} payments recorded")

    # ═══════════════════════════════════════════════════════════
    # VENDOR BILLS & PAYMENTS — 12 months
    # ═══════════════════════════════════════════════════════════
    bill_count = 0
    bill_payment_count = 0

    for month_i in range(MONTHS, -1, -1):
        bill_date  = months_ago(month_i, day=random.randint(1, 5))

        for v_idx, (cat, desc, vendor_name, base_amt, variance, _) in enumerate(EXPENSE_TEMPLATES[:len(vendor_ids)]):
            if v_idx >= len(vendor_ids):
                break

            amount     = base_amt + random.randint(-variance, variance) if variance else base_amt
            gst_rate   = 18.0
            taxable    = round(float(amount), 2)
            gst_amt    = round(taxable * gst_rate / 100, 2)
            total_amt  = round(taxable + gst_amt, 2)
            due_date   = bill_date + timedelta(days=30)

            days_old   = (NOW - bill_date).days
            status     = "PAID" if days_old > 35 else random.choice(["PENDING", "PAID"])
            amount_paid = total_amt if status == "PAID" else 0.0
            amount_due  = round(total_amt - amount_paid, 2)

            bill_res = await db.biz_bills.insert_one({
                "org_id":                  org_id,
                "vendor_id":               vendor_ids[v_idx],
                "vendor_name":             VENDORS[v_idx]["name"],
                "bill_number":             f"BILL-{bill_count + 1:04d}",
                "bill_date":               bill_date,
                "due_date":                due_date,
                "items": [{
                    "description":    desc,
                    "quantity":       1.0,
                    "unit_price":     taxable,
                    "discount_pct":   0.0,
                    "gst_rate_pct":   gst_rate,
                    "gst_type":       "CGST_SGST",
                    "account_code":   "5200",
                    "taxable_amount": taxable,
                    "gst_amount":     gst_amt,
                    "cgst":           round(gst_amt / 2, 2),
                    "sgst":           round(gst_amt / 2, 2),
                    "igst":           0.0,
                    "line_total":     total_amt,
                }],
                "subtotal":            taxable,
                "total_gst":           gst_amt,
                "total_amount":        total_amt,
                "amount_paid":         amount_paid,
                "amount_due":          amount_due,
                "status":              status,
                "notes":               "Demo vendor bill",
                "payable_account_code":  "2101",
                "expense_account_code":  "5200",
                "payments":            [],
                "created_by":          acct_id,
                "created_at":          bill_date,
                "updated_at":          now,
            })
            bill_count += 1

            if amount_paid > 0:
                pay_date = bill_date + timedelta(days=random.randint(5, 30))
                await db.biz_bills.update_one(
                    {"_id": bill_res.inserted_id},
                    {"$push": {"payments": {
                        "amount":         amount_paid,
                        "payment_date":   pay_date,
                        "payment_method": "BANK_TRANSFER",
                        "reference":      f"UTR{random.randint(100000000000, 999999999999)}",
                        "recorded_by":    acct_id,
                        "recorded_at":    pay_date,
                    }}},
                )
                bill_payment_count += 1

    print(f"✅  Vendor Bills: {bill_count} created, {bill_payment_count} payments recorded")

    # ═══════════════════════════════════════════════════════════
    # BUSINESS EXPENSES — 12 months
    # ═══════════════════════════════════════════════════════════
    from app.business.expenses.schemas import CATEGORY_ACCOUNT_MAP
    expense_count = 0

    for month_i in range(MONTHS, -1, -1):
        base_date = months_ago(month_i, day=1)

        for cat, desc, vendor_name, base_amt, variance, _ in EXPENSE_TEMPLATES:
            amount     = base_amt + random.randint(-variance, variance) if variance else base_amt
            amount     = max(float(amount), 100.0)
            gst_amount = round(amount * 0.18, 2) if cat in ("SOFTWARE", "MARKETING", "PROFESSIONAL_FEES") else 0.0
            net_amount = round(amount - gst_amount, 2)
            exp_date   = rand_date(base_date, 25)

            expense_code = CATEGORY_ACCOUNT_MAP.get(cat, "5200")

            await db.biz_expenses.insert_one({
                "org_id":                 org_id,
                "date":                   exp_date,
                "category":               cat,
                "description":            desc,
                "amount":                 round(amount, 2),
                "gst_amount":             gst_amount,
                "net_amount":             net_amount,
                "payment_method":         random.choice(["BANK_TRANSFER", "CREDIT_CARD", "UPI"]),
                "vendor_id":              None,
                "vendor_name":            vendor_name,
                "reference":              None,
                "expense_account_code":   expense_code,
                "bank_account_code":      "1102",
                "notes":                  "Demo expense — TechNova seed data",
                "tags":                   ["demo"],
                "approval_status":        "APPROVED",
                "approved_by":            owner_id,
                "approved_at":            exp_date + timedelta(days=1),
                "rejected_by":            None,
                "rejected_at":            None,
                "rejection_reason":       None,
                "journal_entry_id":       None,
                "created_by":             acct_id,
                "created_at":             exp_date,
                "updated_at":             exp_date,
            })
            expense_count += 1

    # Add one clearly anomalous expense this month
    await db.biz_expenses.insert_one({
        "org_id": org_id,
        "date": NOW - timedelta(days=5),
        "category": "MARKETING",
        "description": "Emergency influencer campaign — product launch",
        "amount": 350000.0,
        "gst_amount": 63000.0,
        "net_amount": 287000.0,
        "payment_method": "BANK_TRANSFER",
        "vendor_id": None,
        "vendor_name": "SocialBuzz Media",
        "reference": "PO-2024-0099",
        "expense_account_code": "5205",
        "bank_account_code": "1102",
        "notes": "Unusually large marketing spend — flagged for review",
        "tags": ["demo", "anomaly"],
        "approval_status": "APPROVED",
        "approved_by": owner_id,
        "approved_at": NOW - timedelta(days=4),
        "rejected_by": None, "rejected_at": None, "rejection_reason": None,
        "journal_entry_id": None,
        "created_by": acct_id,
        "created_at": NOW - timedelta(days=5),
        "updated_at": NOW - timedelta(days=5),
    })
    expense_count += 1
    print(f"✅  Business Expenses: {expense_count} created")

    # ═══════════════════════════════════════════════════════════
    # EMPLOYEES
    # ═══════════════════════════════════════════════════════════
    employee_ids = []
    for i, emp in enumerate(EMPLOYEES_DATA):
        emp_code = f"EMP-{i + 1:04d}"
        res = await db.employees.insert_one({
            "org_id":                org_id,
            "employee_code":         emp_code,
            "first_name":            emp["first_name"],
            "last_name":             emp["last_name"],
            "full_name":             f"{emp['first_name']} {emp['last_name']}",
            "email":                 f"{emp['first_name'].lower()}.{emp['last_name'].lower()}@technova.io",
            "phone":                 f"+91-9{random.randint(100000000, 999999999)}",
            "designation":           emp["designation"],
            "department":            emp["department"],
            "employment_type":       "FULL_TIME",
            "status":                "ACTIVE",
            "date_of_joining":       months_ago(random.randint(3, 24), day=random.randint(1, 28)),
            "date_of_birth":         datetime(random.randint(1985, 1998), random.randint(1, 12), random.randint(1, 28)),
            "pan_number":            f"ABCDE{random.randint(1000, 9999)}F",
            "aadhaar_number":        None,
            "bank_name":             random.choice(["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank"]),
            "bank_account_number":   f"50{random.randint(100000000, 999999999)}",
            "ifsc_code":             "HDFC0001234",
            "basic_salary":          float(emp["basic"]),
            "hra":                   float(emp["hra"]),
            "special_allowance":     float(emp["special"]),
            "other_allowances":      5000.0,
            "pf_applicable":         True,
            "esic_applicable":       True,
            "tds_monthly":           round(emp["basic"] * 0.05, 2),
            "professional_tax":      200.0,
            "other_deductions":      0.0,
            "other_deductions_label": None,
            "created_by":            owner_id,
            "created_at":            months_ago(MONTHS),
            "updated_at":            now,
        })
        employee_ids.append(str(res.inserted_id))
    print(f"✅  Employees: {len(employee_ids)} created")

    # ═══════════════════════════════════════════════════════════
    # PAYROLL RUNS — last 6 months (approved + paid)
    # ═══════════════════════════════════════════════════════════
    payroll_count = 0
    MONTH_NAMES = ["","January","February","March","April","May","June",
                   "July","August","September","October","November","December"]

    for month_i in range(6, 0, -1):
        target     = NOW - relativedelta(months=month_i)
        p_year     = target.year
        p_month    = target.month
        pay_date   = datetime(p_year, p_month, 28)
        period_lbl = f"{MONTH_NAMES[p_month]} {p_year}"

        # Compute totals from employees
        items       = []
        totals_dict = {k: 0.0 for k in ["gross","pf_employee","pf_employer",
                                          "esic_employee","esic_employer","tds",
                                          "professional_tax","other_deductions",
                                          "total_deductions","net_salary","employer_cost"]}
        for emp_id, emp in zip(employee_ids, EMPLOYEES_DATA):
            basic    = float(emp["basic"])
            hra      = float(emp["hra"])
            special  = float(emp["special"])
            other    = 5000.0
            gross    = basic + hra + special + other
            pf_base  = min(basic, 15000)
            pf_emp   = round(pf_base * 0.12, 2)
            pf_er    = round(pf_base * 0.12, 2)
            esic_emp = round(gross * 0.0075, 2) if gross <= 21000 else 0.0
            esic_er  = round(gross * 0.0325, 2) if gross <= 21000 else 0.0
            tds      = round(basic * 0.05, 2)
            pt       = 200.0
            total_d  = round(pf_emp + esic_emp + tds + pt, 2)
            net      = round(gross - total_d, 2)
            ctc      = round(gross + pf_er + esic_er, 2)

            item = {
                "employee_id":       emp_id,
                "employee_code":     f"EMP-{employee_ids.index(emp_id) + 1:04d}",
                "full_name":         f"{emp['first_name']} {emp['last_name']}",
                "designation":       emp["designation"],
                "department":        emp["department"],
                "basic_salary":      basic, "hra": hra,
                "special_allowance": special, "other_allowances": other,
                "gross_salary":      gross, "pf_employee": pf_emp, "pf_employer": pf_er,
                "esic_employee":     esic_emp, "esic_employer": esic_er,
                "tds": tds, "professional_tax": pt, "other_deductions": 0.0,
                "total_deductions":  total_d, "net_salary": net, "employer_cost": ctc,
            }
            items.append(item)
            for k in totals_dict:
                if k in item:
                    totals_dict[k] = round(totals_dict[k] + item[k], 2)

        await db.payroll_runs.insert_one({
            "org_id":                   org_id,
            "period_year":              p_year,
            "period_month":             p_month,
            "period_label":             period_lbl,
            "payment_date":             pay_date,
            "status":                   "PAID",
            "employee_count":           len(items),
            "items":                    items,
            "totals":                   totals_dict,
            "notes":                    f"Monthly payroll — {period_lbl}",
            "salary_expense_account":   "5301",
            "pf_expense_account":       "5302",
            "esic_expense_account":     "5303",
            "bank_account_code":        "1102",
            "salary_payable_account":   "2102",
            "tds_payable_account":      "2103",
            "pf_payable_account":       "2105",
            "esic_payable_account":     "2106",
            "journal_entry_id":         None,
            "approved_by":              owner_id,
            "approved_at":              pay_date - timedelta(days=2),
            "payment_reference":        f"NEFT-PAYROLL-{p_year}{p_month:02d}",
            "actual_payment_date":      pay_date,
            "created_by":               acct_id,
            "created_at":               pay_date - timedelta(days=5),
            "updated_at":               pay_date,
        })
        payroll_count += 1

    print(f"✅  Payroll runs: {payroll_count} months (PAID)")

    # ═══════════════════════════════════════════════════════════
    # BUDGETS
    # ═══════════════════════════════════════════════════════════
    budget_categories = [
        ("MARKETING", 80000),
        ("SOFTWARE", 120000),
        ("TRAVEL", 40000),
        ("MEALS", 15000),
        ("OFFICE_SUPPLIES", 10000),
        ("PROFESSIONAL_FEES", 25000),
    ]

    for cat, limit_amt in budget_categories:
        # Calculate actual spend this month for utilization
        spent_pipeline = [
            {"$match": {"org_id": org_id, "category": cat, "approval_status": "APPROVED",
                        "date": {"$gte": months_ago(0)}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        spent_result = [doc async for doc in db.biz_expenses.aggregate(spent_pipeline)]
        current_spend = spent_result[0]["total"] if spent_result else 0.0
        util_pct      = round((current_spend / limit_amt) * 100, 1) if limit_amt > 0 else 0.0

        await db.biz_budgets.insert_one({
            "org_id":          org_id,
            "category":        cat,
            "amount":          float(limit_amt),
            "period":          "MONTHLY",
            "current_spend":   round(current_spend, 2),
            "utilization_pct": util_pct,
            "created_by":      owner_id,
            "created_at":      now,
            "updated_at":      now,
        })

    print(f"✅  Budgets: {len(budget_categories)} monthly budgets created")

    # ═══════════════════════════════════════════════════════════
    # ANOMALY SEED (for ML Intelligence page demo)
    # ═══════════════════════════════════════════════════════════
    await db.anomalies.insert_many([
        {
            "org_id":      org_id,
            "expense_id":  "demo_anomaly_1",
            "date":        NOW - timedelta(days=5),
            "amount":      350000.0,
            "category":    "MARKETING",
            "description": "Emergency influencer campaign — product launch",
            "z_score":     3.8,
            "severity":    "HIGH",
            "reason":      "This MARKETING expense (₹3,50,000) is significantly above the 6-month average of ₹38,000 (σ=9,500).",
            "is_resolved": False,
            "detected_at": NOW - timedelta(days=4),
        },
        {
            "org_id":      org_id,
            "expense_id":  "demo_anomaly_2",
            "date":        NOW - timedelta(days=18),
            "amount":      95000.0,
            "category":    "SOFTWARE",
            "description": "Specialized ML tooling — one-time purchase",
            "z_score":     2.9,
            "severity":    "MEDIUM",
            "reason":      "This SOFTWARE expense (₹95,000) is above the typical range of ₹12,000–₹18,000.",
            "is_resolved": False,
            "detected_at": NOW - timedelta(days=17),
        },
    ])
    print("✅  Anomalies: 2 seeded for ML Intelligence demo")

    # ═══════════════════════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════════════════════
    print("\n" + "=" * 55)
    print("🎉  TechNova Solutions seed complete!")
    print(f"    Business Owner: {OWNER_EMAIL} / {PASSWORD}")
    print(f"    Accountant:     {ACCT_EMAIL} / {PASSWORD}")
    print(f"    Org ID:         {org_id}")
    print("=" * 55)
    print("\nData seeded:")
    print(f"  • {len(customer_ids)} customers, {len(vendor_ids)} vendors")
    print(f"  • {invoice_count} invoices with {payment_count} payments")
    print(f"  • {bill_count} vendor bills with {bill_payment_count} payments")
    print(f"  • {expense_count} business expenses (12 months)")
    print(f"  • {len(employee_ids)} employees")
    print(f"  • {payroll_count} paid payroll runs")
    print(f"  • {len(budget_categories)} monthly budgets")
    print(f"  • {tax_count} tax rules (GST + TDS)")
    print(f"  • {coa_count} chart of accounts entries")
    print("\n⚠️  All data is synthetic demo data for demonstration only.")


if __name__ == "__main__":
    asyncio.run(seed())
