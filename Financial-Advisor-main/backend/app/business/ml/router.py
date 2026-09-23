from fastapi import APIRouter, Depends
from typing import List

from app.database import get_db
from app.business.rbac.dependencies import OrgContext, require_org_member
from app.business.ml.schemas import (
    ForecastResponse,
    AnomalyResponse,
    ResolveAnomalyRequest,
    CreditRiskResponse,
    ScenarioRequest,
    HealthScoreResponse
)
from app.business.ml import forecasting_service
from app.business.ml import anomaly_service
from app.business.ml import credit_risk_service
from app.business.ml import health_score_service

router = APIRouter(tags=["Business - ML Intelligence"])

@router.get("/organizations/{org_id}/ml/forecast", response_model=ForecastResponse)
async def get_forecast(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """
    Generates or fetches the latest 3-month cash flow and revenue forecast.
    """
    return await forecasting_service.generate_cashflow_forecast(ctx.org_id, db, months_back=12, forecast_months=3)

@router.get("/organizations/{org_id}/ml/anomalies", response_model=List[AnomalyResponse])
async def get_anomalies(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """
    Runs anomaly detection on recent expenses and returns unresolved anomalies.
    """
    return await anomaly_service.detect_expense_anomalies(ctx.org_id, db, days_back=30)

@router.post("/organizations/{org_id}/ml/anomalies/{anomaly_id}/resolve")
async def resolve_anomaly(
    anomaly_id: str,
    req: ResolveAnomalyRequest,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """
    Marks an anomaly as resolved with an optional note.
    """
    await anomaly_service.resolve_anomaly(ctx.org_id, anomaly_id, req.resolution_note, db)
    return {"status": "success", "message": "Anomaly resolved"}

@router.get("/organizations/{org_id}/ml/credit-risk", response_model=CreditRiskResponse)
async def get_credit_risk(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """
    Calculates the Predicted Business Credit Risk Indicator.
    """
    return await credit_risk_service.calculate_credit_risk(ctx.org_id, db)

@router.post("/organizations/{org_id}/ml/scenarios/simulate", response_model=ForecastResponse)
async def simulate_scenario(
    req: ScenarioRequest,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """
    Runs a scenario simulation by temporarily modifying historical baseline before forecasting.
    """
    return await forecasting_service.simulate_scenario(ctx.org_id, db, req, months_back=12, forecast_months=3)


@router.get("/organizations/{org_id}/ml/health-score", response_model=HealthScoreResponse)
async def get_health_score(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """
    Calculates the composite Business Health Score.
    """
    return await health_score_service.calculate_health_score(ctx.org_id, db)
