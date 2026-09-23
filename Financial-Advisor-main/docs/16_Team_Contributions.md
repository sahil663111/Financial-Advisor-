# 16 — Team Contributions

The **AI Financial OS** is a massive full-stack application serving two distinct user personas: **Individuals** and **Businesses**. To ensure equal contribution, the project was divided into two main sections (Individual and Business), with two developers taking full ownership (Frontend + Backend + Database) of their respective halves.

---

## 🏗️ PART 1: INDIVIDUAL SECTION (B2C)

This section focuses on personal finance management, wealth tracking, and individual AI advisory. It is equally managed by **Om** and **Kedar N**.

### 1. Om — Individual Core Operations & Wealth Tracking
**Focus**: User authentication, onboarding, daily income/expense tracking, and investment portfolio management.

**Contributions**:
* Set up the global Next.js layout and FastAPI authentication (JWT) for individual users.
* Built the personal dashboard aggregating real-time metrics.
* Implemented the Income and Expense tracking services with CRUD operations.
* Developed the Investment Portfolio tracker supporting stocks, mutual funds, and automated ROI calculations.

**Files & Code Ownership**:
* **Backend**:
  * [`backend/app/auth/router.py`](../../backend/app/auth/router.py) (User Registration & Login)
  * [`backend/app/individual/dashboard/router.py`](../../backend/app/individual/dashboard/router.py)
  * [`backend/app/individual/income/router.py`](../../backend/app/individual/income/router.py)
  * [`backend/app/individual/expenses/router.py`](../../backend/app/individual/expenses/router.py)
  * [`backend/app/individual/investments/router.py`](../../backend/app/individual/investments/router.py)
* **Frontend**:
  * [`frontend/src/app/login/page.tsx`](../../frontend/src/app/login/page.tsx)
  * [`frontend/src/app/individual/layout.tsx`](../../frontend/src/app/individual/layout.tsx)
  * [`frontend/src/app/individual/dashboard/page.tsx`](../../frontend/src/app/individual/dashboard/page.tsx)
  * [`frontend/src/app/individual/income/page.tsx`](../../frontend/src/app/individual/income/page.tsx)
  * [`frontend/src/app/individual/investments/portfolio/page.tsx`](../../frontend/src/app/individual/investments/portfolio/page.tsx)

### 2. Kedar N — Individual Advanced Intelligence & Planning
**Focus**: Personal AI advisory, tax planning, credit health, and long-term retirement simulations.

**Contributions**:
* Built the Individual AI Advisor using Google Gemini to provide personalized financial insights.
* Programmed the FY 2024-25 Dual-Regime Tax Calculator.
* Created the ML-based Credit Health Scorer evaluating personal risk profiles.
* Implemented the Monte Carlo simulation engine for the Retirement Planner.

**Files & Code Ownership**:
* **Backend**:
  * [`backend/app/individual/ai/router.py`](../../backend/app/individual/ai/router.py)
  * [`backend/app/individual/ai/tools/financial_tools.py`](../../backend/app/individual/ai/tools/financial_tools.py)
  * [`backend/app/individual/tax/engine/fy_2024_25.py`](../../backend/app/individual/tax/engine/fy_2024_25.py)
  * [`backend/app/individual/retirement/simulator.py`](../../backend/app/individual/retirement/simulator.py)
  * [`backend/app/ml/credit_model/scorer.py`](../../backend/app/ml/credit_model/scorer.py)
* **Frontend**:
  * [`frontend/src/app/individual/ai-advisor/page.tsx`](../../frontend/src/app/individual/ai-advisor/page.tsx)
  * [`frontend/src/app/individual/tax/page.tsx`](../../frontend/src/app/individual/tax/page.tsx)
  * [`frontend/src/app/individual/retirement/page.tsx`](../../frontend/src/app/individual/retirement/page.tsx)
  * [`frontend/src/app/individual/credit/page.tsx`](../../frontend/src/app/individual/credit/page.tsx)

---

## 🏢 PART 2: BUSINESS SECTION (B2B)

This section acts as a comprehensive enterprise resource planning (ERP) tool, featuring double-entry accounting, payroll, and compliance. It is equally managed by **Sahil** and **Kedar P**.

### 3. Sahil — Business Accounting, Sales, & HR Operations
**Focus**: Core ledger systems, invoicing (Order-to-Cash), bills (Procure-to-Pay), and automated payroll runs.

**Contributions**:
* Designed the strict double-entry ledger algorithm enforcing the Assets = Liabilities + Equity rule.
* Developed the end-to-end sales module (Customers, Invoicing, Receivables aging).
* Built the accounts payable system for managing vendors and bills.
* Created the Payroll engine that automatically computes CTC breakdowns and logs salary expenses.

**Files & Code Ownership**:
* **Backend**:
  * [`backend/app/business/accounting/journal_service.py`](../../backend/app/business/accounting/journal_service.py)
  * [`backend/app/business/accounting/ledger_service.py`](../../backend/app/business/accounting/ledger_service.py)
  * [`backend/app/business/sales/invoices_service.py`](../../backend/app/business/sales/invoices_service.py)
  * [`backend/app/business/sales/payments_service.py`](../../backend/app/business/sales/payments_service.py)
  * [`backend/app/business/payroll/payroll_service.py`](../../backend/app/business/payroll/payroll_service.py)
* **Frontend**:
  * [`frontend/src/app/business/accounting/journal/page.tsx`](../../frontend/src/app/business/accounting/journal/page.tsx)
  * [`frontend/src/app/business/invoices/page.tsx`](../../frontend/src/app/business/invoices/page.tsx)
  * [`frontend/src/app/business/receivables/page.tsx`](../../frontend/src/app/business/receivables/page.tsx)
  * [`frontend/src/app/business/payroll/page.tsx`](../../frontend/src/app/business/payroll/page.tsx)

### 4. Kedar P — Business Intelligence, Compliance, & Reporting
**Focus**: Virtual CFO AI, ML forecasting, automated tax compliance (GST/TDS), and financial statement generation.

**Contributions**:
* Built the automated GST and TDS computational rules engine, dynamically tracking tax liabilities.
* Developed the Business AI Virtual CFO using Gemini function calling on real accounting data.
* Implemented ML pipelines for expense anomaly detection and linear-trend cash flow forecasting.
* Programmed the algorithms that generate the official P&L, Balance Sheet, and Cash Flow statements.

**Files & Code Ownership**:
* **Backend**:
  * [`backend/app/business/tax/gst_service.py`](../../backend/app/business/tax/gst_service.py)
  * [`backend/app/business/tax/tds_service.py`](../../backend/app/business/tax/tds_service.py)
  * [`backend/app/business/finance/statements_service.py`](../../backend/app/business/finance/statements_service.py)
  * [`backend/app/business/ai/scheduler.py`](../../backend/app/business/ai/scheduler.py)
  * [`backend/app/business/ml/forecasting_service.py`](../../backend/app/business/ml/forecasting_service.py)
* **Frontend**:
  * [`frontend/src/app/business/tax/page.tsx`](../../frontend/src/app/business/tax/page.tsx)
  * [`frontend/src/app/business/gst/page.tsx`](../../frontend/src/app/business/gst/page.tsx)
  * [`frontend/src/app/business/ai-cfo/page.tsx`](../../frontend/src/app/business/ai-cfo/page.tsx)
  * [`frontend/src/app/business/reports/page.tsx`](../../frontend/src/app/business/reports/page.tsx)
  * [`frontend/src/app/business/dashboard/page.tsx`](../../frontend/src/app/business/dashboard/page.tsx) (Executive AI & Metric integration)
