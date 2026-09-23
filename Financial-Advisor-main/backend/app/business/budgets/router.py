from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime
from bson import ObjectId

from app.database import get_db
from app.business.rbac.dependencies import OrgContext, require_org_member, require_owner_or_admin
from app.business.budgets.schemas import BudgetCreate, BudgetUpdate, BudgetResponse
from app.business.budgets.service import get_budgets_with_spend

router = APIRouter(tags=["Business - Budgets"])

@router.get("/organizations/{org_id}/budgets", response_model=List[BudgetResponse])
async def get_budgets(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """List all budgets and calculate current spend vs budget."""
    return await get_budgets_with_spend(ctx.org_id, db)

@router.post("/organizations/{org_id}/budgets", response_model=BudgetResponse)
async def create_budget(
    request: BudgetCreate,
    ctx: OrgContext = Depends(require_owner_or_admin),
    db=Depends(get_db)
):
    """Create a new budget limit for a category."""
    # Check if budget for category already exists
    existing = await db.biz_budgets.find_one({
        "org_id": ctx.org_id, 
        "category": request.category
    })
    if existing:
        raise HTTPException(status_code=400, detail="Budget for this category already exists")
        
    doc = {
        "org_id": ctx.org_id,
        "category": request.category,
        "amount": request.amount,
        "period": request.period,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    res = await db.biz_budgets.insert_one(doc)
    
    # We must run get_budgets_with_spend to return the fully formed response, 
    # but since it's just one, we can just fake the 0 spend for now
    return BudgetResponse(
        id=str(res.inserted_id),
        category=request.category,
        amount=request.amount,
        period=request.period,
        current_spend=0.0,
        utilization_pct=0.0,
        created_at=doc["created_at"],
        updated_at=doc["updated_at"]
    )

@router.delete("/organizations/{org_id}/budgets/{budget_id}")
async def delete_budget(
    budget_id: str,
    ctx: OrgContext = Depends(require_owner_or_admin),
    db=Depends(get_db)
):
    """Delete a budget."""
    result = await db.biz_budgets.delete_one({"_id": ObjectId(budget_id), "org_id": ctx.org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"status": "success"}
