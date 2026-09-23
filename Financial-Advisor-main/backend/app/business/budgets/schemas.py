from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class BudgetCreate(BaseModel):
    category: str = Field(..., description="e.g., TRAVEL, MARKETING, PAYROLL, SOFTWARE")
    amount: float = Field(..., gt=0)
    period: str = Field("MONTHLY", description="MONTHLY, QUARTERLY, or YEARLY")

class BudgetUpdate(BaseModel):
    amount: float = Field(..., gt=0)
    period: Optional[str] = None

class BudgetResponse(BaseModel):
    id: str
    category: str
    amount: float
    period: str
    current_spend: float = 0.0
    utilization_pct: float = 0.0
    created_at: datetime
    updated_at: datetime
