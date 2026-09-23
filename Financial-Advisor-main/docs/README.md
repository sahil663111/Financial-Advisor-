# AI Financial OS — Complete Project Documentation

> **AI Financial OS** is a full-stack, AI-powered financial management platform that serves both **Individual users** (personal finance) and **Businesses** (enterprise accounting, compliance, and intelligence). Built with **FastAPI** (Python) and **Next.js 16** (React 19 / TypeScript), it integrates machine learning models, Google Gemini LLM, and a robust double-entry accounting engine to deliver a comprehensive financial operating system.

---

## Table of Contents

| # | Document | Description |
|---|----------|-------------|
| 1 | [01_Architecture_Overview.md](./01_Architecture_Overview.md) | System architecture, tech stack, design principles |
| 2 | [02_Backend_Deep_Dive.md](./02_Backend_Deep_Dive.md) | FastAPI backend: modules, services, database |
| 3 | [03_Frontend_Deep_Dive.md](./03_Frontend_Deep_Dive.md) | Next.js frontend: pages, components, API layer |
| 4 | [04_Authentication_and_Security.md](./04_Authentication_and_Security.md) | JWT auth, RBAC, cookie strategy, security hardening |
| 5 | [05_Individual_Module.md](./05_Individual_Module.md) | Personal finance: dashboard, expenses, investments, goals, tax |
| 6 | [06_Business_Accounting_Engine.md](./06_Business_Accounting_Engine.md) | Double-entry accounting: Chart of Accounts, Journal Entries, Ledger, Trial Balance |
| 7 | [07_Sales_and_Invoicing.md](./07_Sales_and_Invoicing.md) | Customers, vendors, invoices, payments, receivables, payables |
| 8 | [08_Tax_Compliance_GST_TDS.md](./08_Tax_Compliance_GST_TDS.md) | India GST/TDS engine, tax rules, calendar, filings |
| 9 | [09_Payroll_and_HR.md](./09_Payroll_and_HR.md) | Employee management, payroll runs, CTC→net calculation |
| 10 | [10_AI_and_Machine_Learning.md](./10_AI_and_Machine_Learning.md) | Gemini LLM integration, Virtual CFO, ML models, OCR |
| 11 | [11_Financial_Reports_and_Exports.md](./11_Financial_Reports_and_Exports.md) | P&L, Balance Sheet, Cash Flow, Financial Health Score, exports |
| 12 | [12_Database_Schema_and_Indexing.md](./12_Database_Schema_and_Indexing.md) | MongoDB collections, indexing strategy, data flow |
| 13 | [13_Deployment_and_DevOps.md](./13_Deployment_and_DevOps.md) | Docker, docker-compose, environment config, CI/CD |
| 14 | [14_API_Reference.md](./14_API_Reference.md) | Complete REST API endpoint catalogue |
| 15 | [15_Diagrams.md](./15_Diagrams.md) | Architecture, data-flow, and entity-relationship diagrams |
| 16 | [16_Team_Contributions.md](./16_Team_Contributions.md) | Equal division of work among the four core developers |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/sahil663111/Financial-Advisor-.git
cd Financial-Advisor-main

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env          # configure MONGODB_URI, JWT_SECRET, LLM_API_KEY
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

**Or use Docker:**
```bash
docker-compose up --build -d
```

---

## Key Metrics

| Metric | Value |
|--------|-------|
| **Backend Python files** | 75+ modules |
| **Frontend TSX pages** | 42 pages |
| **API endpoints** | 120+ REST endpoints |
| **MongoDB collections** | 30+ collections |
| **Lines of code** | ~25,000+ |
| **ML models** | 3 (Credit Scorer, Anomaly Detector, Expense Classifier) |
| **AI integrations** | 2 (Individual AI Advisor + Business Virtual CFO) |

