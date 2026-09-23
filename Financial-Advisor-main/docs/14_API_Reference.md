# 14 — API Reference

## 14.1 Base URL
```
Development: http://localhost:8000/api/v1
Production:  https://your-domain.com/api/v1
```

All endpoints require JWT authentication (via HTTP-only cookie) unless marked as 🔓 Public.

---

## 14.2 Authentication (`/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | 🔓 Public | Create new account |
| POST | `/auth/login` | 🔓 Public | Login and receive JWT cookies |
| POST | `/auth/logout` | 🔒 | Clear JWT cookies |
| POST | `/auth/refresh` | 🔒 Cookie | Refresh access token |
| GET | `/auth/me` | 🔒 | Get current user profile |
| PUT | `/auth/me` | 🔒 | Update user profile |

---

## 14.3 Individual Module (`/individual`)

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/individual/dashboard` | Aggregated financial overview |
| GET | `/individual/dashboard/trends` | Monthly income/expense trends |

### Income
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/individual/income` | List income entries (paginated) |
| POST | `/individual/income` | Add income entry |
| PUT | `/individual/income/{id}` | Update income entry |
| DELETE | `/individual/income/{id}` | Delete income entry |
| GET | `/individual/income/summary` | Monthly summary by category |

### Expenses
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/individual/expenses` | List expenses (paginated, filterable) |
| POST | `/individual/expenses` | Add expense (auto-classified by ML) |
| PUT | `/individual/expenses/{id}` | Update expense |
| DELETE | `/individual/expenses/{id}` | Delete expense |
| GET | `/individual/expenses/analytics` | Category breakdown, trends |
| GET | `/individual/expenses/anomalies` | ML-detected anomalies |

### Investments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/individual/investments` | List all holdings |
| POST | `/individual/investments` | Add investment |
| PUT | `/individual/investments/{id}` | Update investment |
| DELETE | `/individual/investments/{id}` | Remove investment |
| GET | `/individual/investments/summary` | Portfolio summary |
| GET | `/individual/investments/performance` | Returns & CAGR |

### Credit Score
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/individual/credit/score` | Current credit health score |
| POST | `/individual/credit/profile` | Update credit profile data |
| GET | `/individual/credit/history` | Score history over time |

### Goals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/individual/goals` | List financial goals |
| POST | `/individual/goals` | Create new goal |
| PUT | `/individual/goals/{id}` | Update goal |
| DELETE | `/individual/goals/{id}` | Delete goal |
| POST | `/individual/goals/{id}/contribute` | Add contribution |

### Tax
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/individual/tax/calculate` | Calculate tax (both regimes) |
| GET | `/individual/tax/profile` | Get saved tax profile |
| PUT | `/individual/tax/profile` | Update tax declarations |

### Retirement
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/individual/retirement/plan` | Get retirement plan |
| POST | `/individual/retirement/plan` | Create/update plan |
| POST | `/individual/retirement/simulate` | Run Monte Carlo simulation |

### Financial Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/individual/health/score` | Composite health score |
| GET | `/individual/health/history` | Score history |

### AI Advisor
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/individual/ai/conversations` | List AI conversations |
| POST | `/individual/ai/conversations` | Start new conversation |
| POST | `/individual/ai/conversations/{id}/messages` | Send message (streams response) |
| GET | `/individual/ai/conversations/{id}/messages` | Get conversation history |

---

## 14.4 Business Module (`/business`)

### Organizations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations` | List user's organizations |
| POST | `/business/organizations` | Create organization |
| GET | `/business/organizations/{org_id}` | Get org details |
| PUT | `/business/organizations/{org_id}` | Update org settings |
| GET | `/business/organizations/{org_id}/members` | List org members |
| POST | `/business/organizations/{org_id}/members` | Invite member |
| PUT | `/business/organizations/{org_id}/members/{id}` | Update member role |
| DELETE | `/business/organizations/{org_id}/members/{id}` | Remove member |

### Chart of Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/accounts` | List all accounts |
| POST | `/business/organizations/{org_id}/accounts` | Create account |
| PUT | `/business/organizations/{org_id}/accounts/{code}` | Update account |
| DELETE | `/business/organizations/{org_id}/accounts/{code}` | Deactivate account |

### Journal Entries
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/accounting/journal-entries` | List entries (paginated) |
| POST | `/business/organizations/{org_id}/accounting/journal-entries` | Create entry |
| GET | `/business/organizations/{org_id}/accounting/journal-entries/{id}` | Get entry detail |
| POST | `/business/organizations/{org_id}/accounting/journal-entries/{id}/void` | Void entry |

### Ledger & Trial Balance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/accounting/ledger/{account_code}` | Account ledger |
| GET | `/business/organizations/{org_id}/accounting/trial-balance` | Trial balance |

### Customers & Vendors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/customers` | List customers |
| POST | `/business/organizations/{org_id}/customers` | Create customer |
| GET | `/business/organizations/{org_id}/vendors` | List vendors |
| POST | `/business/organizations/{org_id}/vendors` | Create vendor |

### Invoices & Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/invoices` | List invoices |
| POST | `/business/organizations/{org_id}/invoices` | Create invoice |
| POST | `/business/organizations/{org_id}/payments` | Record payment |
| GET | `/business/organizations/{org_id}/receivables/aging` | AR aging report |

### Payables (Bills)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/bills` | List vendor bills |
| POST | `/business/organizations/{org_id}/bills` | Create bill |
| POST | `/business/organizations/{org_id}/bills/{id}/pay` | Pay bill |
| GET | `/business/organizations/{org_id}/payables/aging` | AP aging report |

### Expenses
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/expenses` | List business expenses |
| POST | `/business/organizations/{org_id}/expenses` | Create expense |
| POST | `/business/organizations/{org_id}/expenses/scan` | OCR receipt scan |
| PUT | `/business/organizations/{org_id}/expenses/{id}/approve` | Approve expense |

### Employees & Payroll
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/employees` | List employees |
| POST | `/business/organizations/{org_id}/employees` | Onboard employee |
| GET | `/business/organizations/{org_id}/payroll/runs` | List payroll runs |
| POST | `/business/organizations/{org_id}/payroll/runs` | Create payroll run |
| POST | `/business/organizations/{org_id}/payroll/runs/{id}/approve` | Approve & disburse |

### Tax (GST & TDS)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/tax/dashboard` | Tax dashboard |
| GET | `/business/organizations/{org_id}/tax/rules` | List tax rules |
| POST | `/business/organizations/{org_id}/tax/rules` | Create custom rule |
| POST | `/business/organizations/{org_id}/tax/rules/seed` | Seed default Indian rules |
| GET | `/business/organizations/{org_id}/gst/summary` | GST monthly summary |
| POST | `/business/organizations/{org_id}/gst/compute/{invoice_id}` | Compute GST for invoice |
| POST | `/business/organizations/{org_id}/tds/compute` | Compute TDS for payment |

### Financial Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/reports/profit-loss` | P&L statement |
| GET | `/business/organizations/{org_id}/reports/balance-sheet` | Balance sheet |
| GET | `/business/organizations/{org_id}/reports/ratios` | Financial ratios |
| GET | `/business/organizations/{org_id}/reports/profit-loss/export` | Export P&L (CSV/PDF/Excel) |
| GET | `/business/organizations/{org_id}/cashflow` | Cash flow statement |
| GET | `/business/organizations/{org_id}/cashflow/metrics` | Cash metrics (burn rate, runway) |

### Intelligence (ML)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/ml/forecast` | Cash flow forecast |
| GET | `/business/organizations/{org_id}/ml/anomalies` | Detected anomalies |
| POST | `/business/organizations/{org_id}/ml/anomalies/{id}/resolve` | Resolve anomaly |
| GET | `/business/organizations/{org_id}/ml/credit-risk` | Business credit risk |

### AI Virtual CFO
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/ai/conversations` | List AI conversations |
| POST | `/business/organizations/{org_id}/ai/conversations` | Create conversation |
| POST | `/business/organizations/{org_id}/ai/conversations/{id}/messages` | Send message |
| GET | `/business/organizations/{org_id}/ai/conversations/{id}/messages` | Get messages |
| GET | `/business/organizations/{org_id}/ai/executive-summary` | Latest AI summary |

### Budgets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/budgets` | List budgets |
| POST | `/business/organizations/{org_id}/budgets` | Create/update budget |
| GET | `/business/organizations/{org_id}/budgets/vs-actual` | Budget vs actual report |

### Health Score & Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/business/organizations/{org_id}/health/score` | Business health score |
| GET | `/business/organizations/{org_id}/notifications` | List notifications |
| PUT | `/business/organizations/{org_id}/notifications/{id}/read` | Mark as read |
