import asyncio
import os
import sys
from datetime import datetime, timedelta
import random

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

async def seed_demo_data():
    print("🌱 Connecting to MongoDB...")
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]
    
    # We create a demo organization
    org_id = "demo_org_12345"
    user_id = "demo_user_123"
    
    print("🧹 Cleaning up old demo data...")
    # Clean old demo data
    collections = [
        "organizations", "org_members", "accounts", "journal_entries",
        "customers", "vendors", "invoices", "expenses", "payroll_runs", 
        "biz_budgets", "notifications"
    ]
    for coll in collections:
        await db[coll].delete_many({"org_id": org_id})
    await db.organizations.delete_many({"_id": org_id})
    
    # 1. Organization & User
    print("🏢 Creating Organization...")
    await db.organizations.insert_one({
        "_id": org_id,
        "name": "Acme Innovations Pvt Ltd",
        "industry": "Software & Technology",
        "currency": "INR",
        "financial_year_start": "04-01",
        "created_by": user_id,
        "created_at": datetime.utcnow()
    })
    await db.org_members.insert_one({
        "org_id": org_id,
        "user_id": user_id,
        "role": "ADMIN",
        "joined_at": datetime.utcnow()
    })
    
    # 2. Chart of Accounts
    print("📊 Setting up Chart of Accounts...")
    accounts = [
        {"code": "1000", "name": "HDFC Checking", "type": "ASSET", "sub_type": "BANK", "bal": 2500000},
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
        
    # 3. Journal Entries (Last 6 months to give nice ML graphs)
    print("📈 Generating 6 months of historical financial data...")
    now = datetime.utcnow()
    entries = []
    
    # Simulate a growing trend
    base_revenue = 400000
    base_expense = 250000
    
    for i in range(180, -1, -5): # every 5 days for the last 6 months
        entry_date = now - timedelta(days=i)
        
        # Growth factor (slowly increases)
        growth = 1.0 + ((180 - i) / 180.0) * 0.5 
        
        # Add random noise
        rev_amount = int((base_revenue * growth) / 6.0) + random.randint(-20000, 50000)
        exp_amount = int((base_expense * growth) / 6.0) + random.randint(-10000, 30000)
        
        # Revenue Entry
        entries.append({
            "org_id": org_id,
            "entry_date": entry_date,
            "description": f"Subscription Revenue",
            "status": "POSTED",
            "lines": [
                {"account_code": "1000", "debit": rev_amount, "credit": 0},
                {"account_code": "4000", "debit": 0, "credit": rev_amount}
            ]
        })
        
        # Expense Entry
        exp_code = random.choice(["5100", "5200", "5300"])
        entries.append({
            "org_id": org_id,
            "entry_date": entry_date + timedelta(hours=2),
            "description": f"Operating Expense",
            "status": "POSTED",
            "lines": [
                {"account_code": exp_code, "debit": exp_amount, "credit": 0},
                {"account_code": "1000", "debit": 0, "credit": exp_amount}
            ]
        })
        
        # Simulate Anomaly (One huge travel expense 15 days ago)
        if i == 15:
            entries.append({
                "org_id": org_id,
                "entry_date": entry_date,
                "description": "Annual Team Offsite",
                "status": "POSTED",
                "lines": [
                    {"account_code": "5300", "debit": 350000, "credit": 0},
                    {"account_code": "1000", "debit": 0, "credit": 350000}
                ]
            })
            # Also add it to expenses collection for the anomaly detector
            await db.expenses.insert_one({
                "org_id": org_id,
                "amount": 350000,
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
        {"org_id": org_id, "category": "MARKETING", "amount": 100000, "period": "MONTHLY"},
        {"org_id": org_id, "category": "SOFTWARE", "amount": 50000, "period": "MONTHLY"},
        {"org_id": org_id, "category": "TRAVEL", "amount": 150000, "period": "MONTHLY"} # This will show exceeded!
    ])
    
    print("✅ Demo data seeded successfully! You can now view rich analytics for org 'demo_org_12345'.")
    print("   To use this in the UI, ensure your test user belongs to this org, or run this script modified for your user's org_id.")

if __name__ == "__main__":
    asyncio.run(seed_demo_data())
