import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

# Same logic as journal_service
_DEBIT_NORMAL = {"ASSET", "EXPENSE"}

def _balance_delta(account_type: str, debit: float, credit: float) -> float:
    if account_type in _DEBIT_NORMAL:
        return round(debit - credit, 2)
    return round(credit - debit, 2)

async def fix_account_balances():
    db = AsyncIOMotorClient('')['Financial_Advisor']
    
    org = await db.organizations.find_one({"type": "BUSINESS"})
    if not org:
        print("No business org found")
        return
    org_id = str(org["_id"])
    
    # Reset all balances to opening_balance
    print("Resetting all balances...")
    accounts = {}
    async for acc in db.accounts.find({"org_id": org_id}):
        code = acc["code"]
        opening = acc.get("opening_balance", 0.0)
        # Store in memory to accumulate
        accounts[code] = {
            "account_type": acc["account_type"],
            "current_balance": opening
        }

    print("Accumulating from journal entries...")
    async for entry in db.journal_entries.find({"org_id": org_id, "status": "POSTED"}):
        for line in entry["lines"]:
            code = line.get("account_code")
            if code in accounts:
                debit = float(line.get("debit", 0.0))
                credit = float(line.get("credit", 0.0))
                delta = _balance_delta(accounts[code]["account_type"], debit, credit)
                accounts[code]["current_balance"] += delta

    print("Updating accounts in database...")
    for code, data in accounts.items():
        new_balance = round(data["current_balance"], 2)
        await db.accounts.update_one(
            {"org_id": org_id, "code": code},
            {"$set": {"current_balance": new_balance}}
        )
        print(f"Account {code} balance updated to {new_balance}")

    print("Done!")

if __name__ == "__main__":
    asyncio.run(fix_account_balances())
