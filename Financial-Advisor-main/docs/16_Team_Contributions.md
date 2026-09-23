# 16 — Team Contributions

This document outlines the equal division of work among the four core developers of the **AI Financial OS** project. The massive full-stack architecture has been logically partitioned so that each contributor owns end-to-end delivery (Frontend + Backend + Database Schema) of their respective modules.

---

## 1. Sahil — Core Architecture, Auth & Analytics
**Role**: Lead Architect & Analytics Engineer
**Focus**: System foundations, authentication, multi-tenant RBAC, and complex financial reporting.

### Key Contributions:
* **Core Foundation**: Set up the Next.js frontend and FastAPI backend architectures, including database connection pooling and the SlowAPI rate limiter.
* **Authentication & RBAC**: Implemented the JWT dual-token system (access + refresh) and the dependency-injected Role-Based Access Control (`OrgContext`).
* **Financial Reporting Engine**: Built the deterministic algorithms for the Profit & Loss statement, Balance Sheet, and Financial Health Score, along with CSV/PDF exports.
* **Dashboards**: Created the primary business dashboard integrating Recharts for real-time financial tracking.

### Code Ownership (Notable Files):
* **Backend**:
  * [`backend/app/main.py`](../../backend/app/main.py)
  * [`backend/app/config.py`](../../backend/app/config.py)
  * [`backend/app/database.py`](../../backend/app/database.py)
  * [`backend/app/auth/router.py`](../../backend/app/auth/router.py)
  * [`backend/app/business/rbac/dependencies.py`](../../backend/app/business/rbac/dependencies.py)
  * [`backend/app/business/finance/statements_service.py`](../../backend/app/business/finance/statements_service.py)
* **Frontend**:
  * [`frontend/src/contexts/AuthContext.tsx`](../../frontend/src/contexts/AuthContext.tsx)
  * [`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts) (Base Axios client & interceptors)
  * [`frontend/src/app/business/dashboard/page.tsx`](../../frontend/src/app/business/dashboard/page.tsx)
  * [`frontend/src/app/business/reports/page.tsx`](../../frontend/src/app/business/reports/page.tsx)

---

## 2. Kedar N — AI & Machine Learning Engine
**Role**: Lead AI/ML Engineer
**Focus**: Integration of Google Gemini, Virtual CFO function calling, and all classical machine learning models.

### Key Contributions:
* **Virtual CFO**: Built the conversational AI agent using Gemini's function calling to interface with the financial database.
* **ML Pipelines**: Developed the anomaly detection algorithm for expenses (Z-score based), the credit health scorer, and the linear-trend cash flow forecaster.
* **Automated Insights**: Wrote the background async scheduler that pre-computes daily executive summaries.
* **OCR Integration**: Implemented the Gemini Vision API for automatic receipt scanning and data extraction.

### Code Ownership (Notable Files):
* **Backend**:
  * [`backend/app/business/ai/router.py`](../../backend/app/business/ai/router.py)
  * [`backend/app/business/ai/tools.py`](../../backend/app/business/ai/tools.py)
  * [`backend/app/business/ai/scheduler.py`](../../backend/app/business/ai/scheduler.py)
  * [`backend/app/business/ml/forecasting_service.py`](../../backend/app/business/ml/forecasting_service.py)
  * [`backend/app/business/ml/anomaly_service.py`](../../backend/app/business/ml/anomaly_service.py)
  * [`backend/app/business/ml/credit_risk_service.py`](../../backend/app/business/ml/credit_risk_service.py)
* **Frontend**:
  * [`frontend/src/app/business/ai-cfo/page.tsx`](../../frontend/src/app/business/ai-cfo/page.tsx)
  * [`frontend/src/app/individual/ai-advisor/page.tsx`](../../frontend/src/app/individual/ai-advisor/page.tsx)
  * [`frontend/src/app/business/intelligence/page.tsx`](../../frontend/src/app/business/intelligence/page.tsx)

---

## 3. Om — Business Accounting & Operations
**Role**: Lead Accounting Systems Engineer
**Focus**: Double-entry ledger, Sales (O2C), Payables (P2P), and Payroll operations.

### Key Contributions:
* **Double-Entry Engine**: Implemented the core accounting engine enforcing the fundamental accounting equation (Assets = Liabilities + Equity) across all journal entries.
* **Sales & Invoicing**: Built the order-to-cash lifecycle including customer management, invoice generation, payment allocation, and accounts receivable aging.
* **Payables**: Managed vendor profiles and bill payments.
* **Payroll Processing**: Automated the CTC breakdown (Basic, HRA, PF) and monthly salary disbursement journal entries.

### Code Ownership (Notable Files):
* **Backend**:
  * [`backend/app/business/accounting/journal_service.py`](../../backend/app/business/accounting/journal_service.py)
  * [`backend/app/business/accounting/ledger_service.py`](../../backend/app/business/accounting/ledger_service.py)
  * [`backend/app/business/sales/invoices_service.py`](../../backend/app/business/sales/invoices_service.py)
  * [`backend/app/business/sales/payments_service.py`](../../backend/app/business/sales/payments_service.py)
  * [`backend/app/business/payroll/payroll_service.py`](../../backend/app/business/payroll/payroll_service.py)
  * [`backend/scripts/fix_balances.py`](../../backend/scripts/fix_balances.py)
* **Frontend**:
  * [`frontend/src/app/business/accounting/journal/page.tsx`](../../frontend/src/app/business/accounting/journal/page.tsx)
  * [`frontend/src/app/business/invoices/page.tsx`](../../frontend/src/app/business/invoices/page.tsx)
  * [`frontend/src/app/business/receivables/page.tsx`](../../frontend/src/app/business/receivables/page.tsx)
  * [`frontend/src/app/business/payroll/page.tsx`](../../frontend/src/app/business/payroll/page.tsx)

---

## 4. Kedar P — Individual Module & Tax Compliance
**Role**: Lead Personal Finance & Compliance Engineer
**Focus**: The entire B2C (Individual) application suite and the complex Indian tax compliance engines (GST & TDS).

### Key Contributions:
* **Individual Application**: Built the standalone personal finance tracker, including income/expense logging, goal tracking, and retirement Monte Carlo simulations.
* **Tax Engines (Business & Individual)**: Programmed the FY 2024-25 dual-regime tax calculator for individuals, and the automated GST/TDS computational rules engine for businesses.
* **Investment Portfolio**: Created the asset tracker supporting Indian equities and mutual funds with CAGR/XIRR returns.
* **Tax Dashboard**: Designed the frontend interfaces tracking GSTR-1, GSTR-3B, and TDS filing deadlines.

### Code Ownership (Notable Files):
* **Backend**:
  * [`backend/app/individual/tax/engine/fy_2024_25.py`](../../backend/app/individual/tax/engine/fy_2024_25.py)
  * [`backend/app/individual/retirement/simulator.py`](../../backend/app/individual/retirement/simulator.py)
  * [`backend/app/business/tax/gst_service.py`](../../backend/app/business/tax/gst_service.py)
  * [`backend/app/business/tax/tds_service.py`](../../backend/app/business/tax/tds_service.py)
  * [`backend/app/business/tax/rules_engine.py`](../../backend/app/business/tax/rules_engine.py)
* **Frontend**:
  * [`frontend/src/app/individual/layout.tsx`](../../frontend/src/app/individual/layout.tsx)
  * [`frontend/src/app/individual/dashboard/page.tsx`](../../frontend/src/app/individual/dashboard/page.tsx)
  * [`frontend/src/app/business/tax/page.tsx`](../../frontend/src/app/business/tax/page.tsx)
  * [`frontend/src/app/business/gst/page.tsx`](../../frontend/src/app/business/gst/page.tsx)
