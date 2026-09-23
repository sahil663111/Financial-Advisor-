# 15 — Diagrams

## 15.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AI FINANCIAL OS                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          FRONTEND (Next.js 16)                         │    │
│  │                                                                        │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │  Login   │ │Individual│ │ Business │ │AI Advisor│ │ Reports  │    │    │
│  │  │  Page    │ │Dashboard │ │Dashboard │ │  Chat    │ │P&L, BS   │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  │                                                                        │    │
│  │  ┌────────────────────────────────────────────────────────────────┐    │    │
│  │  │  Shared: AuthContext · API Client · Utils · Types             │    │    │
│  │  └────────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────┬─────────────────────────────────────┘    │
│                                    │ HTTP/REST (JSON)                          │
│                                    │ JWT Cookies                               │
│  ┌─────────────────────────────────▼─────────────────────────────────────┐    │
│  │                          BACKEND (FastAPI)                             │    │
│  │                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │    │
│  │  │ MIDDLEWARE: CORS → Rate Limiter → Auth → RBAC                  │   │    │
│  │  └─────────────────────────────────────────────────────────────────┘   │    │
│  │                                                                        │    │
│  │  ┌────────────┐ ┌────────────────────────────────────────────────┐    │    │
│  │  │   AUTH     │ │              INDIVIDUAL MODULE                  │    │    │
│  │  │            │ │  Dashboard │ Income │ Expenses │ Investments   │    │    │
│  │  │ Register   │ │  Goals │ Credit │ Tax │ Retirement │ AI       │    │    │
│  │  │ Login      │ └────────────────────────────────────────────────┘    │    │
│  │  │ JWT Mgmt   │                                                       │    │
│  │  └────────────┘ ┌────────────────────────────────────────────────┐    │    │
│  │                 │              BUSINESS MODULE                    │    │    │
│  │                 │  Organizations │ RBAC │ Accounting │ Sales     │    │    │
│  │                 │  Tax (GST/TDS) │ Payroll │ Expenses │ AI CFO  │    │    │
│  │                 │  Reports │ Cash Flow │ ML │ Budgets │ OCR     │    │    │
│  │                 └────────────────────────────────────────────────┘    │    │
│  │                                                                        │    │
│  │  ┌────────────────────────────────────────────────────────────────┐    │    │
│  │  │ ML ENGINE: Credit Scorer │ Anomaly Detector │ Classifier      │    │    │
│  │  └────────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────┬─────────────────────────────────────┘    │
│                                    │                                          │
│  ┌─────────────────────────────────▼─────────────────────────────────────┐    │
│  │                       MONGODB ATLAS                                    │    │
│  │  users │ organizations │ accounts │ journal_entries │ invoices │ ...   │    │
│  │                     (30+ collections)                                  │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                     EXTERNAL SERVICES                                   │    │
│  │  Google Gemini API (LLM + Vision OCR) │ Yahoo Finance (Stock Prices)   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 15.2 Authentication Flow Diagram

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  Browser │                    │  FastAPI │                    │ MongoDB  │
│ (React)  │                    │ (Auth)   │                    │ (users)  │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │                               │                               │
     │  POST /auth/login             │                               │
     │  {email, password}            │                               │
     │──────────────────────────────>│                               │
     │                               │  find_one({email})            │
     │                               │──────────────────────────────>│
     │                               │                               │
     │                               │  {_id, email, password_hash}  │
     │                               │<──────────────────────────────│
     │                               │                               │
     │                               │  bcrypt.verify(password,      │
     │                               │    password_hash) ✓           │
     │                               │                               │
     │                               │  Generate JWT tokens          │
     │                               │  access_token (15 min)        │
     │                               │  refresh_token (7 days)       │
     │                               │                               │
     │  Set-Cookie: access_token     │                               │
     │  Set-Cookie: refresh_token    │                               │
     │  {user: {id, email, name}}    │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
     │  GET /individual/dashboard    │                               │
     │  Cookie: access_token=eyJ...  │                               │
     │──────────────────────────────>│                               │
     │                               │  Decode JWT → user_id         │
     │                               │  find_one({_id: user_id})     │
     │                               │──────────────────────────────>│
     │                               │  {user document}              │
     │                               │<──────────────────────────────│
     │  {dashboard data}             │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
```

---

## 15.3 Double-Entry Accounting Flow

```
          ┌─────────────────────────────────┐
          │     User Creates Journal Entry   │
          │     Debit: Cash ₹50,000          │
          │     Credit: Revenue ₹50,000      │
          └──────────────┬──────────────────┘
                         │
                         ▼
          ┌─────────────────────────────────┐
          │       VALIDATION PIPELINE        │
          │                                  │
          │  ✓ Total Debits = Total Credits  │
          │  ✓ All account codes exist       │
          │  ✓ Amounts are non-zero          │
          │  ✓ User has 'create' permission  │
          └──────────────┬──────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
    ┌──────────────────┐  ┌──────────────────┐
    │ journal_entries  │  │    accounts       │
    │                  │  │                   │
    │ {                │  │ Account 1000:     │
    │   entry: "JE-001"│  │   $inc: +50,000  │
    │   status: POSTED │  │                   │
    │   lines: [...]   │  │ Account 4000:     │
    │ }                │  │   $inc: +50,000   │
    └──────────────────┘  └──────────────────┘
              │
              ▼
    ┌──────────────────┐
    │   audit_logs     │
    │                  │
    │ {                │
    │   action: CREATE │
    │   user: "Sahil"  │
    │   timestamp: now │
    │ }                │
    └──────────────────┘
```

---

## 15.4 AI Virtual CFO Data Flow

```
┌──────────────┐     "What's our cash position?"     ┌──────────────┐
│   Frontend    │ ──────────────────────────────────► │   Backend     │
│   Chat UI     │                                     │   AI Router   │
└──────────────┘                                     └──────┬───────┘
                                                            │
                                                            ▼
                                                     ┌──────────────┐
                                                     │  Gemini API  │
                                                     │  (with tools)│
                                                     └──────┬───────┘
                                                            │
                                            Gemini decides to call:
                                            get_financial_summary()
                                                            │
                                                            ▼
                                                     ┌──────────────┐
                                                     │ Tool Executor│
                                                     │              │
                                                     │ Queries:     │
                                                     │ • accounts   │
                                                     │ • journal    │
                                                     │   entries    │
                                                     │ • cash flow  │
                                                     └──────┬───────┘
                                                            │
                                                            ▼
                                                     ┌──────────────┐
                                                     │  Real Data:  │
                                                     │  cash: ₹24.5L│
                                                     │  burn: ₹1.5L │
                                                     │  runway: 16mo│
                                                     └──────┬───────┘
                                                            │
                                              Data sent back to Gemini
                                                            │
                                                            ▼
                                                     ┌──────────────┐
                                                     │  Gemini      │
                                                     │  generates   │
                                                     │  natural     │
                                                     │  language    │
                                                     │  response    │
                                                     └──────┬───────┘
                                                            │
┌──────────────┐     Streamed markdown response      ┌──────┴───────┐
│   Frontend    │ ◄─────────────────────────────────  │   Backend     │
│   Chat UI     │     "Your cash balance is ₹24.55L  │   SSE Stream  │
│   (renders    │      with 16 months of runway..."   └──────────────┘
│    markdown)  │
└──────────────┘
```

---

## 15.5 Entity Relationship Diagram (Business Module)

```
┌──────────────┐     has many      ┌──────────────┐
│    users      │ ◄──────────────► │  org_members  │
│              │                   │  (role: OWNER │
│  email       │                   │   /ADMIN/     │
│  password    │                   │   ACCOUNTANT/ │
│  full_name   │                   │   VIEWER)     │
└──────────────┘                   └──────┬───────┘
                                          │ belongs to
                                          ▼
                                   ┌──────────────┐
                                   │organizations │
                                   │              │
                                   │  name        │
                                   │  gstin       │
                                   │  pan_number  │
                                   └──────┬───────┘
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
             ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
             │   accounts   │     │biz_customers │     │  employees   │
             │              │     │              │     │              │
             │  code (uniq) │     │  name        │     │  full_name   │
             │  name        │     │  gstin       │     │  ctc_annual  │
             │  account_type│     │  credit_limit│     │  department  │
             │  balance     │     └──────┬───────┘     └──────┬───────┘
             └──────┬───────┘            │                     │
                    │                    ▼                     ▼
                    ▼             ┌──────────────┐     ┌──────────────┐
             ┌──────────────┐    │ biz_invoices │     │ payroll_runs │
             │journal_entries│    │              │     │              │
             │              │    │ invoice_num  │     │ period_month │
             │ entry_number │    │ customer_id  │     │ period_year  │
             │ date         │    │ items[]      │     │ status       │
             │ status       │    │ total        │     └──────┬───────┘
             │ lines[]      │    │ amount_due   │            │
             └──────┬───────┘    └──────┬───────┘            ▼
                    │                    │             ┌──────────────┐
                    ▼                    ▼             │ payroll_items│
             ┌──────────────┐    ┌──────────────┐     │              │
             │  audit_logs  │    │   payments   │     │ employee_id  │
             │              │    │              │     │ gross        │
             │  action      │    │  invoice_id  │     │ net          │
             │  user_id     │    │  amount      │     │ tds          │
             │  timestamp   │    │  method      │     └──────────────┘
             └──────────────┘    └──────────────┘
```

---

## 15.6 Tax Compliance Flow

```
┌──────────────────────────────────────────────────────────┐
│                    TAX COMPLIANCE ENGINE                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  INVOICE CREATED                                         │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────────────┐    ┌──────────────────────────┐    │
│  │ GST Computation │◄───│ Tax Rules Engine          │    │
│  │                 │    │ (version-aware resolution) │    │
│  │ Determine:      │    │                           │    │
│  │ • Intra/Inter   │    │ biz_tax_rules collection  │    │
│  │   state         │    │ {section, rate, effective} │    │
│  │ • CGST+SGST     │    └──────────────────────────┘    │
│  │   or IGST       │                                     │
│  │ • Rate lookup   │                                     │
│  └────────┬────────┘                                     │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────┐                                    │
│  │ GST Record      │                                    │
│  │ {period, output, │                                    │
│  │  input, net}     │                                    │
│  └─────────────────┘                                    │
│                                                          │
│  VENDOR PAYMENT                                          │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────────────┐    ┌──────────────────────────┐    │
│  │ TDS Computation │◄───│ Tax Rules Engine          │    │
│  │                 │    │ Section: 194J @ 10%       │    │
│  │ Check threshold │    │ Threshold: ₹30,000        │    │
│  │ Apply rate      │    └──────────────────────────┘    │
│  │ Deduct from     │                                     │
│  │   payment       │                                     │
│  └────────┬────────┘                                     │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────┐    ┌──────────────────────────┐    │
│  │ TDS Record      │    │ Tax Calendar             │    │
│  │ {section, amount,│    │ • GSTR-1: 11th monthly   │    │
│  │  due_date}       │    │ • GSTR-3B: 20th monthly  │    │
│  └─────────────────┘    │ • TDS: 7th monthly       │    │
│                          │ • Advance Tax: quarterly  │    │
│                          └──────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## 15.7 Frontend Page Map

```
/
├── /login                          Login / Register page
│
├── /individual/                    ── INDIVIDUAL MODE ──
│   ├── dashboard                   Personal finance overview
│   ├── income                      Income tracking
│   ├── expenses                    Expense tracker
│   │   └── analytics               Expense analytics
│   ├── investments/
│   │   ├── portfolio               Holdings tracker
│   │   └── performance             Returns analysis
│   ├── goals                       Financial goals
│   ├── credit                      Credit health score
│   ├── tax                         Tax calculator
│   ├── retirement                  Retirement planner
│   ├── financial-health            Health score
│   └── ai-advisor                  AI chat
│
└── /business/                      ── BUSINESS MODE ──
    ├── dashboard                   Business KPIs
    ├── profile                     Company profile
    ├── settings                    Org settings, RBAC
    ├── accounting/
    │   ├── (page)                  Chart of Accounts
    │   ├── journal                 Journal Entries
    │   ├── ledger                  General Ledger
    │   └── trial-balance           Trial Balance
    ├── customers                   Customer directory
    ├── vendors                     Vendor directory
    ├── invoices                    Sales invoicing
    ├── receivables                 AR aging
    ├── payables                    AP / Bills
    ├── expenses                    Business expenses + OCR
    ├── employees                   HR directory
    ├── payroll                     Payroll processing
    ├── gst                         GST dashboard
    ├── tax                         Tax management (GST+TDS)
    ├── reports                     P&L, Balance Sheet, Ratios
    ├── cashflow                    Cash flow statement
    ├── health                      Financial health score
    ├── budgets                     Budget tracking
    ├── intelligence                ML forecasting
    ├── credit                      Business credit risk
    └── ai-cfo                      AI Virtual CFO
```
