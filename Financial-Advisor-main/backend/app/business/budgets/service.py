from datetime import datetime
from typing import List, Dict, Any
from bson import ObjectId

async def get_budgets_with_spend(org_id: str, db) -> List[Dict[str, Any]]:
    """
    Fetches all budgets for an organization and calculates the current spend
    for the current month based on the expenses collection.
    """
    now = datetime.utcnow()
    # Simple monthly budget assumption for v1
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    cursor = db.biz_budgets.find({"org_id": org_id})
    budgets = []
    
    async for budget in cursor:
        cat = budget.get("category", "")
        # Calculate spend from expenses
        # Matching approved expenses in the current month
        pipeline = [
            {
                "$match": {
                    "org_id": org_id,
                    "category": cat,
                    "status": "APPROVED",
                    "date": {"$gte": start_of_month}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$amount"}
                }
            }
        ]
        
        spend_cursor = db.expenses.aggregate(pipeline)
        spend_results = [doc async for doc in spend_cursor]
        current_spend = spend_results[0]["total"] if spend_results else 0.0
        
        budget_amount = budget.get("amount", 1.0)
        utilization = (current_spend / budget_amount) * 100 if budget_amount > 0 else 0

        # Check for alerts (Only trigger if we haven't alerted recently - simple logic)
        if utilization >= 100:
            await trigger_budget_alert(org_id, cat, "EXCEEDED", db)
        elif utilization >= 80:
            await trigger_budget_alert(org_id, cat, "WARNING", db)

        budgets.append({
            "id": str(budget["_id"]),
            "category": cat,
            "amount": budget_amount,
            "period": budget.get("period", "MONTHLY"),
            "current_spend": current_spend,
            "utilization_pct": min(utilization, 1000), # cap at 1000% just in case
            "created_at": budget.get("created_at"),
            "updated_at": budget.get("updated_at"),
        })

    return budgets

async def trigger_budget_alert(org_id: str, category: str, alert_type: str, db):
    """
    Creates a notification if a budget limit is reached, avoiding duplicate spam.
    """
    now = datetime.utcnow()
    # Check if we already alerted for this category today
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    msg = f"Budget {alert_type}: Your {category} budget has {'exceeded 100%' if alert_type == 'EXCEEDED' else 'reached 80%'} of its limit."
    
    existing = await db.notifications.find_one({
        "org_id": org_id,
        "message": msg,
        "created_at": {"$gte": start_of_day}
    })
    
    if not existing:
        await db.notifications.insert_one({
            "org_id": org_id,
            "title": f"Budget Alert: {category}",
            "message": msg,
            "type": "BUDGET_ALERT",
            "is_read": False,
            "created_at": now
        })
