"""
Business module root router.
Mounts all sub-routers under /api/v1/business.
Each sub-module has its own router file — add imports here as phases are built.
"""
from fastapi import APIRouter

from app.business.organizations.router import router as org_router
from app.business.accounting.router import router as accounting_router
from app.business.sales.router import router as sales_router
from app.business.expenses.router import router as expenses_router
from app.business.payroll.router import router as payroll_router
from app.business.finance.router import router as finance_router
from app.business.tax.router import router as tax_router

router = APIRouter(prefix="/business")

router.include_router(org_router)        # Phase 1
router.include_router(accounting_router) # Phase 2
router.include_router(sales_router)      # Phase 3
router.include_router(expenses_router)   # Phase 4
router.include_router(payroll_router)    # Phase 5
router.include_router(finance_router)    # Phase 6 (Finance & Reports)
router.include_router(tax_router)        # Phase 6 (GST, TDS & Tax Management)

# Phase 7: ML & Forecasting
from app.business.ml.router import router as ml_router
router.include_router(ml_router)

# Phase 8+: AI & Notifications
from app.business.ai.router import router as ai_cfo_router
from app.business.notifications.router import router as notifications_router
router.include_router(ai_cfo_router)
router.include_router(notifications_router)

# Phase 9: Budgets
from app.business.budgets.router import router as budgets_router
router.include_router(budgets_router)
