from datetime import datetime
from typing import List
import numpy as np
import pandas as pd
from dateutil.relativedelta import relativedelta
from bson import ObjectId

from app.business.ml.schemas import AnomalyResponse

class AnomalyDetector:
    """
    Detects expense anomalies using statistical thresholds (Z-score).
    """
    threshold_sigma: float = 2.5

    def detect(self, amount: float, category: str, historical_avg: float, historical_std: float, sample_count: int) -> dict:
        if sample_count < 3:
            return {"is_anomaly": False, "reason": "Not enough data"}

        std = historical_std or historical_avg * 0.3
        z_score = (amount - historical_avg) / std if std > 0 else 0

        if z_score > self.threshold_sigma:
            severity = "HIGH" if z_score > 4.0 else "MEDIUM"
            return {
                "is_anomaly": True,
                "z_score": round(z_score, 2),
                "severity": severity,
                "reason": (
                    f"This {category} expense (₹{amount:,.0f}) is unusually high. "
                    f"Your typical average is ₹{historical_avg:,.0f}."
                ),
            }
        return {"is_anomaly": False, "z_score": round(z_score, 2), "severity": "LOW", "reason": ""}

detector = AnomalyDetector()

async def detect_expense_anomalies(org_id: str, db, days_back: int = 30) -> List[AnomalyResponse]:
    """
    Scans recent expenses against historical category baselines and records anomalies.
    Returns the list of unresolved anomalies for the organization.
    """
    now = datetime.utcnow()
    recent_start = now - relativedelta(days=days_back)
    history_start = now - relativedelta(days=180) # Use 6 months for baseline

    # 1. Fetch recent expenses
    recent_expenses = [doc async for doc in db.biz_expenses.find({
        "org_id": org_id,
        "date": {"$gte": recent_start},
        "status": {"$ne": "REJECTED"}
    })]

    if not recent_expenses:
        return await fetch_unresolved_anomalies(org_id, db)

    # 2. Fetch historical baseline by category
    pipeline = [
        {"$match": {
            "org_id": org_id,
            "date": {"$gte": history_start, "$lt": recent_start},
            "status": {"$ne": "REJECTED"}
        }},
        {"$group": {
            "_id": "$category",
            "avg_amount": {"$avg": "$amount"},
            "std_dev": {"$stdDevPop": "$amount"},
            "count": {"$sum": 1}
        }}
    ]
    baselines = {doc["_id"]: doc async for doc in db.biz_expenses.aggregate(pipeline)}

    # 3. Detect
    new_anomalies = []
    for exp in recent_expenses:
        cat = exp.get("category", "Uncategorized")
        if cat not in baselines:
            continue
            
        b = baselines[cat]
        res = detector.detect(exp["amount"], cat, b["avg_amount"], b.get("std_dev", 0.0), b["count"])
        
        if res["is_anomaly"]:
            # Check if we already flagged this exact expense
            existing = await db.anomalies.find_one({"expense_id": str(exp["_id"])})
            if not existing:
                doc = {
                    "org_id": org_id,
                    "expense_id": str(exp["_id"]),
                    "date": exp.get("date"),
                    "amount": exp["amount"],
                    "category": cat,
                    "description": exp.get("description", "Unknown Expense"),
                    "z_score": res["z_score"],
                    "severity": res["severity"],
                    "reason": res["reason"],
                    "is_resolved": False,
                    "detected_at": now
                }
                new_anomalies.append(doc)
    
    if new_anomalies:
        await db.anomalies.insert_many(new_anomalies)

    return await fetch_unresolved_anomalies(org_id, db)

async def fetch_unresolved_anomalies(org_id: str, db) -> List[AnomalyResponse]:
    cursor = db.anomalies.find({"org_id": org_id, "is_resolved": False}).sort("detected_at", -1)
    results = []
    async for doc in cursor:
        results.append(AnomalyResponse(
            id=str(doc["_id"]),
            date=doc["date"],
            amount=doc["amount"],
            category=doc["category"],
            description=doc["description"],
            is_anomaly=True,
            z_score=doc["z_score"],
            severity=doc["severity"],
            reason=doc["reason"],
            is_resolved=doc["is_resolved"]
        ))
    return results

async def resolve_anomaly(org_id: str, anomaly_id: str, resolution_note: str, db):
    await db.anomalies.update_one(
        {"_id": ObjectId(anomaly_id), "org_id": org_id},
        {"$set": {
            "is_resolved": True,
            "resolution_note": resolution_note,
            "resolved_at": datetime.utcnow()
        }}
    )
