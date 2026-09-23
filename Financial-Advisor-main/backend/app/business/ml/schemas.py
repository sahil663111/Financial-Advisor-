from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class ForecastDataPoint(BaseModel):
    date: str
    actual_value: Optional[float] = None
    forecast_value: Optional[float] = None
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None


class ForecastResponse(BaseModel):
    revenue_forecast: List[ForecastDataPoint]
    expense_forecast: List[ForecastDataPoint]
    net_cash_forecast: List[ForecastDataPoint]
    currency: str = "INR"
    last_updated: datetime


class AnomalyResponse(BaseModel):
    id: str
    date: datetime
    amount: float
    category: str
    description: str
    is_anomaly: bool
    z_score: float
    severity: str  # e.g., "HIGH", "MEDIUM"
    reason: str
    is_resolved: bool


class ResolveAnomalyRequest(BaseModel):
    resolution_note: str


class CreditRiskResponse(BaseModel):
    score: int = Field(..., ge=0, le=1000)
    risk_category: str  # "Low", "Medium", "High"
    positive_factors: List[str]
    risk_factors: List[str]
    last_updated: datetime


class ScenarioRequest(BaseModel):
    revenue_change_pct: float = 0.0
    expense_change_pct: float = 0.0
    new_fixed_cost_monthly: float = 0.0


class HealthMetricComponent(BaseModel):
    name: str
    value: Optional[float] = None
    score: int = Field(..., ge=0, le=100)
    status: str
    impact: str


class HealthScoreResponse(BaseModel):
    score: int = Field(..., ge=0, le=100)
    status: str
    components: List[HealthMetricComponent]
    last_updated: datetime
