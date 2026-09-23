# 01 — Architecture Overview

## 1.1 High-Level System Architecture

AI Financial OS follows a **three-tier architecture**:

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT TIER                                │
│  Next.js 16 (React 19) · TypeScript · TailwindCSS v4             │
│  App Router · Server/Client Components · Recharts                │
└──────────────────────┬───────────────────────────────────────────┘
                       │  HTTPS / REST (JSON)
                       │  HTTP-only Cookies (JWT)
┌──────────────────────▼───────────────────────────────────────────┐
│                      APPLICATION TIER                             │
│  FastAPI 0.111 · Python 3.12 · Uvicorn (ASGI)                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Auth    │ Individual │ Business │ ML Engine │ AI (LLM)    │  │
│  └────────────────────────────────────────────────────────────┘  │
│  Rate Limiter (SlowAPI) · CORS Middleware · Lifespan Events      │
└──────────────────────┬───────────────────────────────────────────┘
                       │  Motor (async) / PyMongo
┌──────────────────────▼───────────────────────────────────────────┐
│                        DATA TIER                                  │
│  MongoDB Atlas (Cloud) / mongomock-motor (Local Dev Fallback)     │
│  30+ Collections · Compound Indexes · TTL-ready Audit Logs       │
└──────────────────────────────────────────────────────────────────┘
                       │
          ┌────────────┴───────────────┐
          │   EXTERNAL SERVICES        │
          │  Google Gemini API (LLM)   │
          │  Yahoo Finance (yfinance)  │
          └────────────────────────────┘
```

---

## 1.2 Technology Stack — Why Each Choice Was Made

### Backend

| Technology | Version | Why It Was Chosen |
|------------|---------|-------------------|
| **FastAPI** | 0.111 | Fastest Python web framework with native async/await, automatic OpenAPI docs, Pydantic validation, and dependency injection. Perfect for financial APIs where type-safety and performance matter. |
| **Uvicorn** | 0.30.1 | ASGI server that runs FastAPI with native async I/O. Handles thousands of concurrent connections without blocking threads. |
| **Motor** | 3.4.0 | Official async MongoDB driver. Critical because all database operations in our financial engine must be non-blocking (e.g., generating a P&L statement queries multiple collections concurrently). |
| **PyMongo** | 4.7.2 | Underlying synchronous driver that Motor wraps. Also used for connection string parsing and BSON types. |
| **Pydantic** | 2.7.4 | Data validation for all API request/response schemas. Ensures financial amounts are properly typed, email formats are validated, and enum constraints (like account types ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE) are enforced at the boundary. |
| **python-jose** | 3.3.0 | JWT token creation and verification. Chosen over PyJWT because it supports JWE (encrypted tokens) for future upgrade path. |
| **passlib[bcrypt]** | 1.7.4 | Industry-standard password hashing. Bcrypt is intentionally slow to resist brute-force attacks on financial accounts. |
| **google-generativeai** | 0.7.2 | Official Google Gemini SDK. Used for two AI integrations: Individual AI Advisor and Business Virtual CFO. Supports function calling (tool use) which is critical for grounding LLM responses in real financial data. |
| **scikit-learn** | 1.5.0 | ML library used for the expense anomaly detector (Z-score based, designed for upgrade to Isolation Forest). |
| **yfinance** | 0.2.40 | Fetches real-time stock/mutual fund prices for portfolio tracking in the Individual module. |
| **pandas / numpy** | 2.2.2 / 1.26.4 | Data manipulation for financial calculations, time-series analysis, and ML feature engineering. |
| **SlowAPI** | 0.1.9 | Rate limiting middleware (200 req/min default). Prevents API abuse on sensitive financial endpoints. |
| **openpyxl** | 3.1.2 | Excel export for financial reports (P&L, Balance Sheet, Trial Balance). |
| **fpdf2** | 2.7.9 | PDF generation for downloadable financial statements. |
| **mongomock-motor** | 0.0.32 | In-memory MongoDB mock for local development without Atlas. Allows the app to start instantly for demos. |

### Frontend

| Technology | Version | Why It Was Chosen |
|------------|---------|-------------------|
| **Next.js** | 16.3.4 | React meta-framework with App Router (file-system routing), server-side rendering, and optimized bundling. Essential for SEO on public pages and fast navigation. |
| **React** | 19.2.8 | Latest React with concurrent features, transitions, and improved hydration. |
| **TypeScript** | 5.x | Type safety across the entire frontend. Prevents runtime errors in financial calculations. |
| **TailwindCSS** | 4.x | Utility-first CSS for rapid UI development. Custom dark theme with glassmorphism design system. |
| **Recharts** | 3.10.1 | Composable charting library built on D3. Used for dashboards, cash flow visualizations, expense breakdowns, and portfolio performance graphs. |
| **Lucide React** | 1.43.0 | Modern icon library (200+ icons). Consistent iconography across all pages. |
| **react-markdown** | 10.1.0 | Renders AI-generated markdown responses in the Virtual CFO chat interface. |
| **date-fns** | 4.4.0 | Lightweight date formatting (Indian date format, relative time). Chosen over Moment.js for smaller bundle size. |
| **Axios** | 1.20.0 | HTTP client with interceptor support. Used for automatic JWT refresh and error handling across all API calls. |

### Database

| Technology | Why It Was Chosen |
|------------|-------------------|
| **MongoDB Atlas** | Document-oriented database is ideal for financial data with varying schemas (e.g., GST invoices have different fields than TDS certificates). Schema-less design allows iterative development. Atlas provides free-tier hosting, automated backups, and global distribution. |
| **Why not PostgreSQL?** | While PostgreSQL would be stronger for strict relational constraints, MongoDB was chosen for: (1) flexible document schemas for diverse financial instruments, (2) native JSON storage matching our API format, (3) powerful aggregation pipeline for financial calculations, (4) easier horizontal scaling for multi-tenant architecture. |

---

## 1.3 Design Principles

### 1. Dual-Mode Architecture
The application serves two distinct user personas from a single codebase:
- **Individual**: Personal finance tracking (expenses, investments, tax planning, retirement)
- **Business**: Enterprise accounting (double-entry bookkeeping, GST/TDS compliance, payroll)

This is achieved through separate route prefixes (`/api/v1/individual/*` vs `/api/v1/business/*`) and separate frontend layouts.

### 2. AI-Augmented, Not AI-Dependent
AI (Gemini) enhances the platform but is never the sole source of truth:
- Financial calculations (tax slabs, P&L, balance sheet) are **deterministic algorithms**
- AI provides explanations, insights, and natural language interaction
- If the AI API is unavailable, all core functionality continues to work

### 3. India-First Financial Logic
All financial calculations are built for Indian compliance:
- Income tax slabs for FY 2024-25 (both Old and New regimes)
- GST rates (0%, 5%, 12%, 18%, 28%) with CGST/SGST/IGST split
- TDS sections (192, 194A, 194C, 194H, 194I, 194J, 194Q)
- Indian fiscal year (April 1 → March 31)
- INR formatting with lakhs and crores (₹)

### 4. Defense-in-Depth Security
Financial data demands multiple security layers:
- Password hashing (bcrypt)
- JWT with short-lived access tokens (15 min) + refresh tokens (7 days)
- HTTP-only cookies (prevent XSS token theft)
- RBAC for business routes (OWNER → ADMIN → ACCOUNTANT → VIEWER)
- Rate limiting (200 req/min)
- CORS restrictions
- Input validation via Pydantic schemas

### 5. Modular Service Architecture
Each business domain is a self-contained module:
```
backend/app/business/
├── accounting/     # Chart of Accounts, Journal Entries, Ledger
├── ai/             # Virtual CFO (Gemini + Function Calling)
├── audit/          # Immutable audit trail
├── budgets/        # Category-level budget tracking
├── expenses/       # Business expense management with OCR
├── finance/        # P&L, Balance Sheet, Cash Flow, Health Score
├── ml/             # Forecasting, Anomaly Detection, Credit Risk
├── notifications/  # In-app alerts and reminders
├── ocr/            # Receipt scanning (Gemini Vision)
├── organizations/  # Multi-org support, settings
├── payroll/        # Employee management, salary processing
├── rbac/           # Role-Based Access Control
├── sales/          # Customers, Vendors, Invoices, Payments
└── tax/            # GST, TDS, Tax Calendar, Rules Engine
```

---

## 1.4 Request Lifecycle

A typical authenticated business API request flows through:

```
1. Browser sends HTTP request with JWT cookie
       ↓
2. FastAPI receives request via Uvicorn (ASGI)
       ↓
3. CORS Middleware checks origin
       ↓
4. SlowAPI Rate Limiter checks request count
       ↓
5. Route handler activates FastAPI Dependency Injection:
   a. get_current_user() → extracts JWT from cookie, validates, loads user from DB
   b. require_org_member() → verifies user is a member of the target org
   c. require_permission("view_statements") → checks RBAC permissions
       ↓
6. Service layer performs business logic (e.g., generate P&L from account balances)
       ↓
7. Database queries via Motor (async MongoDB driver)
       ↓
8. Response serialized to JSON and returned
       ↓
9. Frontend receives response, updates React state, re-renders UI
```

---

## 1.5 Project Directory Structure

```
Financial-Advisor-main/
├── backend/
│   ├── app/
│   │   ├── auth/              # Authentication (register, login, JWT)
│   │   ├── business/          # Business module (15 sub-modules)
│   │   ├── individual/        # Individual module (12 sub-modules)
│   │   ├── ml/                # Machine Learning models
│   │   ├── models/            # Pydantic/data models
│   │   ├── utils/             # Security helpers, exceptions
│   │   ├── config.py          # Environment configuration
│   │   ├── database.py        # MongoDB connection + indexing
│   │   └── main.py            # FastAPI app entry point
│   ├── scripts/               # Database seeding, migrations
│   ├── tests/                 # pytest test suite
│   ├── requirements.txt       # Python dependencies
│   └── Dockerfile             # Container image definition
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js App Router pages
│   │   │   ├── business/      # 25+ business pages
│   │   │   ├── individual/    # 12+ individual pages
│   │   │   └── login/         # Authentication page
│   │   ├── contexts/          # React Context (AuthProvider)
│   │   ├── lib/               # API client, utilities
│   │   └── types/             # TypeScript type definitions
│   ├── package.json           # Node.js dependencies
│   └── Dockerfile             # Container image definition
├── docker-compose.yml         # Multi-service orchestration
├── start.ps1                  # Windows startup script
└── docs/                      # This documentation folder
```
