import asyncio
import os
import sys
from datetime import datetime, timedelta
import random

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from bson import ObjectId

async def seed_demo_data():
    print("🌱 Connecting to MongoDB...")
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]
    
    org = await db.organizations.find_one({"type": "BUSINESS"})
    
    if org:
        org_id = str(org["_id"])
        user_id = org.get("created_by", "demo_user_123")
        print(f"🏢 Found existing organization: {org_id}")
    else:
        org_id = "demo_org_12345"
        user_id = "demo_user_123"
        print("🏢 Creating Organization...")
        await db.organizations.insert_one({
            "_id": ObjectId(org_id) if len(org_id) == 24 else org_id,
            "name": "Acme Innovations Pvt Ltd",
            "industry": "Software & Technology",
            "currency": "INR",
            "financial_year_start": "04-01",
            "created_by": user_id,
            "type": "BUSINESS",
            "created_at": datetime.utcnow()
        })
        await db.org_members.insert_one({
            "org_id": org_id,
            "user_id": user_id,
            "role": "ADMIN",
            "joined_at": datetime.utcnow()
        })
    
    print("🧹 Cleaning up old demo data for this org...")
    collections = [
        "accounts", "journal_entries",
        "customers", "vendors", "invoices", "expenses", "payroll_runs", 
        "biz_budgets", "notifications"
    ]
    for coll in collections:
        await db[coll].delete_many({"org_id": org_id})
    
    # 2. Chart of Accounts
    print("📊 Setting up Chart of Accounts...")
    accounts = [
        {"code": "1000", "name": "HDFC Checking", "type": "ASSET", "sub_type": "BANK", "bal": 4500000},
        {"code": "1200", "name": "Accounts Receivable", "type": "ASSET", "sub_type": "ACCOUNTS_RECEIVABLE", "bal": 850000},
        {"code": "2000", "name": "Accounts Payable", "type": "LIABILITY", "sub_type": "ACCOUNTS_PAYABLE", "bal": 320000},
        {"code": "3000", "name": "Retained Earnings", "type": "EQUITY", "sub_type": "RETAINED_EARNINGS", "bal": 1200000},
        {"code": "4000", "name": "Software Subscriptions", "type": "REVENUE", "sub_type": "OPERATING_REVENUE", "bal": 0},
        {"code": "4100", "name": "Consulting Income", "type": "REVENUE", "sub_type": "OPERATING_REVENUE", "bal": 0},
        {"code": "5000", "name": "Payroll Expense", "type": "EXPENSE", "sub_type": "PAYROLL_EXPENSE", "bal": 0},
        {"code": "5100", "name": "Marketing Expense", "type": "EXPENSE", "sub_type": "OPERATING_EXPENSE", "bal": 0},
        {"code": "5200", "name": "Server Hosting", "type": "EXPENSE", "sub_type": "OPERATING_EXPENSE", "bal": 0},
        {"code": "5300", "name": "Travel Expense", "type": "EXPENSE", "sub_type": "OPERATING_EXPENSE", "bal": 0}
    ]
    
    for acc in accounts:
        await db.accounts.insert_one({
            "org_id": org_id,
            "code": acc["code"],
            "name": acc["name"],
            "account_type": acc["type"],
            "account_sub_type": acc["sub_type"],
            "current_balance": acc["bal"],
            "is_active": True
        })
        
    # 3. Journal Entries (Last 2 years daily data)
    print("📈 Generating 2 years of historical financial data...")
    now = datetime.utcnow()
    entries = []
    
    base_revenue = 40000
    base_expense = 25000
    
    for i in range(730, -1, -1): # daily for 2 years
        entry_date = now - timedelta(days=i)
        
        # Growth factor (slowly increases)
        growth = 1.0 + ((730 - i) / 730.0) * 1.5 
        
        # Add random noise and seasonality
        seasonality = 1.0 + (0.2 * (entry_date.month / 12.0))
        rev_amount = int((base_revenue * growth * seasonality)) + random.randint(-5000, 15000)
        exp_amount = int((base_expense * growth)) + random.randint(-3000, 10000)
        
        # Revenue Entry
        entries.append({
            "org_id": org_id,
            "date": entry_date,
            "entry_number": f"JE-{entry_date.strftime('%Y%m%d')}-REV",
            "description": f"Daily Subscription Revenue",
            "status": "POSTED",
            "total_debit": float(rev_amount),
            "total_credit": float(rev_amount),
            "posted_at": entry_date,
            "created_at": entry_date,
            "lines": [
                {"account_code": "1000", "debit": rev_amount, "credit": 0},
                {"account_code": "4000", "debit": 0, "credit": rev_amount}
            ]
        })
        
        # Expense Entry
        exp_code = random.choice(["5100", "5200", "5300"])
        entries.append({
            "org_id": org_id,
            "date": entry_date + timedelta(hours=2),
            "entry_number": f"JE-{entry_date.strftime('%Y%m%d')}-EXP",
            "description": f"Daily Operating Expense",
            "status": "POSTED",
            "total_debit": float(exp_amount),
            "total_credit": float(exp_amount),
            "posted_at": entry_date + timedelta(hours=2),
            "created_at": entry_date + timedelta(hours=2),
            "lines": [
                {"account_code": exp_code, "debit": exp_amount, "credit": 0},
                {"account_code": "1000", "debit": 0, "credit": exp_amount}
            ]
        })
        
        # Simulate Anomaly (One huge travel expense 15 days ago)
        if i == 15:
            entries.append({
                "org_id": org_id,
                "date": entry_date,
                "entry_number": f"JE-{entry_date.strftime('%Y%m%d')}-ANOM",
                "description": "Annual Team Offsite",
                "status": "POSTED",
                "total_debit": 850000.0,
                "total_credit": 850000.0,
                "posted_at": entry_date,
                "created_at": entry_date,
                "lines": [
                    {"account_code": "5300", "debit": 850000, "credit": 0},
                    {"account_code": "1000", "debit": 0, "credit": 850000}
                ]
            })
            await db.expenses.insert_one({
                "org_id": org_id,
                "amount": 850000,
                "category": "TRAVEL",
                "merchant": "Taj Hotels",
                "description": "Annual Team Offsite",
                "status": "APPROVED",
                "date": entry_date
            })
            
    await db.journal_entries.insert_many(entries)
    
    # 4. Budgets
    print("💰 Creating Budgets...")
    await db.biz_budgets.insert_many([
        {"org_id": org_id, "category": "MARKETING", "amount": 1000000, "period": "MONTHLY"},
        {"org_id": org_id, "category": "SOFTWARE", "amount": 500000, "period": "MONTHLY"},
        {"org_id": org_id, "category": "TRAVEL", "amount": 150000, "period": "MONTHLY"} # This will show exceeded!
    ])

    print("✅ Demo data seeded successfully! You can now view rich analytics for org.")

if __name__ == "__main__":
    asyncio.run(seed_demo_data())
