# 12 — Database Schema & Indexing

## 12.1 MongoDB Collections Overview

The application uses **30+ MongoDB collections** organized by domain:

### Core Collections
| Collection | Purpose | Key Fields |
|-----------|---------|------------|
| `users` | User accounts | email (unique), password_hash, full_name, account_type |
| `profiles` | User preferences | user_id (unique), risk_profile, currency |

### Individual Module Collections
| Collection | Purpose | Key Fields |
|-----------|---------|------------|
| `income` | Income entries | user_id, amount, source, category, date |
| `expenses` | Personal expenses | user_id, amount, description, category, date |
| `investments` | Portfolio holdings | user_id, asset_type, symbol, quantity, buy_price |
| `credit_profiles` | Credit health data | user_id (unique), score, components |
| `financial_goals` | Savings goals | user_id, target_amount, current_amount, deadline |
| `retirement_plans` | Retirement config | user_id (unique), current_age, retirement_age, corpus |
| `tax_profiles` | Tax declarations | user_id, regime, deductions |
| `financial_health_scores` | Health score history | user_id, score, components, computed_at |
| `ai_conversations` | AI chat sessions | user_id, title, updated_at |
| `ai_messages` | Chat messages | conversation_id, role, content, created_at |
| `recommendations` | AI suggestions | user_id, type, message, is_dismissed |

### Business Module Collections
| Collection | Purpose | Key Fields |
|-----------|---------|------------|
| `organizations` | Business entities | created_by, name, gstin, pan_number, type |
| `org_members` | Membership + roles | org_id + user_id (unique), role |
| `accounts` | Chart of Accounts | org_id + code (unique), name, account_type, current_balance |
| `journal_entries` | Accounting entries | org_id, entry_number, date, status, lines[] |
| `audit_logs` | Immutable trail | org_id, user_id, action, timestamp, entity_type |
| `biz_customers` | Customer directory | org_id, name, email, gstin, credit_limit |
| `biz_vendors` | Vendor directory | org_id, name, email, gstin |
| `biz_invoices` | Sales invoices | org_id, invoice_number (unique), customer_id, status |
| `payments` | Payment records | org_id, invoice_id, amount, method, date |
| `biz_bills` | Vendor bills | org_id, vendor_id, amount, status, due_date |
| `biz_expenses` | Business expenses | org_id, amount, category, status, receipt_url |
| `employees` | Employee directory | org_id, employee_id, ctc_annual, department |
| `payroll_runs` | Monthly payroll | org_id, period_year, period_month, status |
| `payroll_items` | Per-employee payslip | payroll_run_id, employee_id, gross, net, tds |
| `biz_tax_rules` | Tax rules engine | org_id, tax_type, section, rate_pct, effective_from |
| `gst_records` | GST filings | org_id, period, output_gst, input_gst |
| `tds_records` | TDS deposits | org_id, section, amount, due_date |
| `biz_budgets` | Budget allocations | org_id + category (unique), amount, period |
| `forecasts` | ML predictions | org_id, forecast_type, predictions, created_at |
| `anomalies` | Detected anomalies | org_id, type, amount, is_resolved, detected_at |
| `notifications` | In-app alerts | org_id, message, type, is_read |
| `biz_ai_conversations` | Business AI chats | org_id, title, updated_at |
| `biz_ai_messages` | AI chat history | conversation_id, role, content |
| `biz_ai_summaries` | Pre-computed insights | org_id, key_insights, risks, generated_at |

---

## 12.2 Indexing Strategy

### Why Indexes Matter for Financial Applications
Without proper indexes, MongoDB performs **collection scans** (reading every document). For a business with 10,000+ journal entries, this would make the ledger page take 5+ seconds. With indexes, queries complete in <50ms.

### Index Categories

#### 1. Unique Indexes (Data Integrity)
```python
# Prevent duplicate email addresses
await db.users.create_index("email", unique=True)

# Prevent duplicate account codes within an organization
await db.accounts.create_index([("org_id", 1), ("code", 1)], unique=True)

# Prevent duplicate org memberships
await db.org_members.create_index([("org_id", 1), ("user_id", 1)], unique=True)

# Prevent duplicate invoice numbers within an org
await db.biz_invoices.create_index(
    [("org_id", 1), ("invoice_number", 1)], unique=True, sparse=True
)
```

#### 2. Compound Sort Indexes (Query Performance)
```python
# Journal entries: latest first within an org
await db.journal_entries.create_index([("org_id", 1), ("date", -1)])

# Expenses: latest first within an org
await db.biz_expenses.create_index([("org_id", 1), ("date", -1)])

# Audit logs: chronological within an org
await db.audit_logs.create_index([("org_id", 1), ("timestamp", -1)])
```

#### 3. Filter Indexes (Status-Based Queries)
```python
# Find all POSTED journal entries for an org
await db.journal_entries.create_index([("org_id", 1), ("status", 1)])

# Find active accounts of a specific type
await db.accounts.create_index([("org_id", 1), ("account_type", 1)])

# Find unread notifications
await db.notifications.create_index([("org_id", 1), ("is_read", 1)])
```

#### 4. Sparse Indexes (Optional Fields)
```python
# Not all organizations have GSTIN
await db.organizations.create_index("gstin", sparse=True)

# Not all organizations have PAN
await db.organizations.create_index("pan_number", sparse=True)
```

---

## 12.3 Data Relationships

MongoDB is document-oriented (not relational), but we maintain relationships through ID references:

```
organizations
  ├── org_members (org_id → organizations._id, user_id → users._id)
  ├── accounts (org_id)
  │   └── journal_entries (org_id, lines[].account_code → accounts.code)
  ├── biz_customers (org_id)
  │   └── biz_invoices (org_id, customer_id → biz_customers._id)
  │       └── payments (org_id, invoice_id → biz_invoices._id)
  ├── biz_vendors (org_id)
  │   └── biz_bills (org_id, vendor_id → biz_vendors._id)
  ├── employees (org_id)
  │   └── payroll_runs (org_id)
  │       └── payroll_items (payroll_run_id → payroll_runs._id)
  └── biz_tax_rules (org_id)
```

### Multi-Tenancy
Every business collection is scoped by `org_id`. This ensures:
- **Data isolation**: Organization A cannot see Organization B's data
- **Index efficiency**: Queries always filter by `org_id` first
- **Scalability**: Each org's data is independent

---

## 12.4 Data Flow: Creating a Journal Entry

```
1. Request arrives: POST /journal-entries {lines: [{code: "1000", debit: 50000}, {code: "4000", credit: 50000}]}

2. Read: db.accounts.find({org_id, code: {$in: ["1000", "4000"]}})
   → Validates account codes exist and are active

3. Write: db.journal_entries.insert_one({org_id, lines, status: "POSTED", ...})
   → Creates immutable journal record

4. Write: db.accounts.update_one({code: "1000"}, {$inc: {current_balance: +50000}})
   → Atomically updates account 1000 balance

5. Write: db.accounts.update_one({code: "4000"}, {$inc: {current_balance: +50000}})
   → Atomically updates account 4000 balance

6. Write: db.audit_logs.insert_one({action: "CREATE_JOURNAL", entity_id: entry_id, ...})
   → Records who created the entry, when, and from where
```

**Why `$inc` instead of `$set`?**
`$inc` is an **atomic** operation. Even if two users create journal entries simultaneously, both balance updates will be applied correctly without race conditions. `$set` would risk one update overwriting the other.
