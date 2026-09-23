# 06 — Business Accounting Engine

## 6.1 Double-Entry Bookkeeping System

The accounting engine implements **double-entry bookkeeping** — the universal standard for financial record-keeping since the 15th century. Every financial transaction must record equal debits and credits across at least two accounts.

### The Fundamental Equation
```
Assets = Liabilities + Equity
```

Every journal entry preserves this equation. If debits ≠ credits, the entry is **rejected** (hard constraint).

---

## 6.2 Chart of Accounts (CoA)

### Account Types (5 categories)
```
ASSET       → What the business OWNS (cash, receivables, equipment)
LIABILITY   → What the business OWES (payables, loans)
EQUITY      → Owner's investment + retained earnings
REVENUE     → Money EARNED (sales, services)
EXPENSE     → Money SPENT (rent, salaries, software)
```

### Account Sub-Types
Each account has a sub-type for granular classification:

| Account Type | Sub-Types |
|-------------|-----------|
| ASSET | CURRENT_ASSET, FIXED_ASSET, BANK, CASH, ACCOUNTS_RECEIVABLE, INVENTORY |
| LIABILITY | CURRENT_LIABILITY, LONG_TERM_LIABILITY, ACCOUNTS_PAYABLE, TAX_PAYABLE, LOANS |
| EQUITY | OWNERS_EQUITY, RETAINED_EARNINGS |
| REVENUE | OPERATING_REVENUE, OTHER_INCOME |
| EXPENSE | COST_OF_GOODS, OPERATING_EXPENSE, PAYROLL_EXPENSE, TAX_EXPENSE, DEPRECIATION, INTEREST_EXPENSE |

### Default Chart of Accounts (seeded on org creation)
| Code | Name | Type |
|------|------|------|
| 1000 | HDFC Checking | ASSET (BANK) |
| 1200 | Accounts Receivable | ASSET (AR) |
| 2000 | Accounts Payable | LIABILITY (AP) |
| 3000 | Retained Earnings | EQUITY |
| 4000 | Software Subscriptions | REVENUE (SALES) |
| 4100 | Consulting Income | REVENUE (SALES) |
| 5100 | Server Hosting AWS | EXPENSE (COGS) |
| 5200 | Marketing Ads | EXPENSE (MARKETING) |
| 5300 | Travel & Meals | EXPENSE (TRAVEL) |

---

## 6.3 Journal Entry Engine

### Creating a Journal Entry
```
POST /organizations/{org_id}/accounting/journal-entries

{
  "date": "2026-09-15T00:00:00",
  "description": "Client payment for September invoice",
  "lines": [
    {"account_code": "1000", "debit": 50000, "credit": 0},      // Cash increases
    {"account_code": "4000", "debit": 0, "credit": 50000}       // Revenue recorded
  ]
}
```

### Validation Pipeline
The journal entry engine enforces these rules **before** persisting:

```python
# Step 1: Balance check (HARD CONSTRAINT)
total_debit = sum(line.debit for line in lines)    # ₹50,000
total_credit = sum(line.credit for line in lines)  # ₹50,000
if total_debit != total_credit:
    raise bad_request("Journal entry is not balanced")

# Step 2: Zero-amount check
if total_debit == 0:
    raise bad_request("Journal entry amounts cannot all be zero")

# Step 3: Account validation
for line in lines:
    account = await db.accounts.find_one({"code": line.account_code, "is_active": True})
    if not account:
        raise bad_request(f"Unknown account code: {line.account_code}")
```

### Balance Delta Calculation
After persisting, account balances are updated atomically:

```python
def _balance_delta(account_type: str, debit: float, credit: float) -> float:
    """
    ASSET/EXPENSE (debit-normal):   debit adds, credit subtracts
    LIABILITY/EQUITY/REVENUE (credit-normal): credit adds, debit subtracts
    """
    if account_type in {"ASSET", "EXPENSE"}:
        return debit - credit     # Debit increases asset/expense
    return credit - debit         # Credit increases liability/equity/revenue
```

**Why this matters**: When you record a ₹50,000 revenue entry:
- Account 1000 (ASSET/BANK): `debit - credit = 50000 - 0 = +50000` → balance increases
- Account 4000 (REVENUE): `credit - debit = 50000 - 0 = +50000` → balance increases

### Auto-Generated Entry Numbers
```python
async def _next_entry_number(org_id, db):
    count = await db.journal_entries.count_documents({"org_id": org_id})
    return f"JE-{count + 1:04d}"   # JE-0001, JE-0002, ...
```

### Voiding Entries
Entries cannot be deleted (audit requirement). Instead, they are **voided** with a reversing entry:

```python
# Original entry: Debit 1000 ₹50,000, Credit 4000 ₹50,000
# Reversing entry: Debit 4000 ₹50,000, Credit 1000 ₹50,000
# Net effect: zero
```

The original entry's status changes to `VOID` and links to the reversing entry.

---

## 6.4 General Ledger

The ledger shows **all transactions affecting a specific account** with a running balance:

```
Account: 1000 - HDFC Checking (ASSET)
Opening Balance: ₹45,00,000

| Date       | Entry #          | Description              | Debit    | Credit   | Balance      |
|------------|------------------|--------------------------|----------|----------|--------------|
| 2024-09-23 | JE-20240923-REV  | Daily Subscription Rev   | ₹43,282  |          | ₹45,43,282   |
| 2024-09-23 | JE-20240923-EXP  | Daily Operating Expense  |          | ₹28,140  | ₹45,15,142   |
| 2024-09-24 | JE-20240924-REV  | Daily Subscription Rev   | ₹48,990  |          | ₹45,64,132   |
| ...        | ...              | ...                      | ...      | ...      | ...          |

Closing Balance: ₹2,45,52,082
Total Debits: ₹6,00,76,140  |  Total Credits: ₹3,55,24,058
```

### Implementation
```python
async def get_ledger(org_id, account_code, db, start_date=None, end_date=None):
    account = await db.accounts.find_one({"org_id": org_id, "code": account_code})
    running_balance = account.get("opening_balance", 0.0)

    async for entry in db.journal_entries.find(query).sort("date", 1):
        for line in entry["lines"]:
            if line["account_code"] == account_code:
                delta = _balance_delta(account["account_type"], line["debit"], line["credit"])
                running_balance += delta
                ledger_entries.append({
                    "date": entry["date"],
                    "debit": line["debit"],
                    "credit": line["credit"],
                    "balance": running_balance,
                })
```

---

## 6.5 Trial Balance

The trial balance lists **all accounts** with their debit and credit totals. If the system is working correctly, total debits must equal total credits:

```
TRIAL BALANCE - As of 23 Sep 2026

| Code | Account Name         | Type      | Debit        | Credit       |
|------|---------------------|-----------|--------------|--------------|
| 1000 | HDFC Checking       | ASSET     | ₹2,45,52,082 |              |
| 1200 | Accounts Receivable | ASSET     |              |              |
| 2000 | Accounts Payable    | LIABILITY |              |              |
| 3000 | Retained Earnings   | EQUITY    |              |              |
| 4000 | Software Subs       | REVENUE   |              | ₹6,00,76,140 |
| 5100 | Server Hosting      | EXPENSE   | ₹1,21,87,613 |              |
| 5200 | Marketing Ads       | EXPENSE   | ₹1,04,38,272 |              |
| 5300 | Travel & Meals      | EXPENSE   | ₹1,28,98,173 |              |
|------|---------------------|-----------|--------------|--------------|
|      | TOTALS              |           | ₹6,00,76,140 | ₹6,00,76,140 | ✅ BALANCED
```

### Balance Status
```python
difference = abs(total_debit_balances - total_credit_balances)
is_balanced = difference < 0.01  # Floating-point tolerance
```

---

## 6.6 Data Flow Diagram

```
User creates Journal Entry
       │
       ▼
┌──────────────────────────┐
│ Validation Pipeline       │
│ • Debits = Credits?       │
│ • All account codes valid?│
│ • Non-zero amounts?       │
└──────────┬───────────────┘
           │ (pass)
           ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│ journal_entries collection│──────│ accounts collection       │
│ (append-only log)        │      │ (current_balance updated) │
│                          │      │ via $inc atomic operation  │
│ {status: "POSTED",       │      │                           │
│  lines: [{code, dr, cr}]}│      │ {code: "1000",            │
└──────────────────────────┘      │  current_balance: 2455208}│
           │                      └──────────────────────────┘
           │                                  │
           ▼                                  ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│ audit_logs collection    │      │ P&L / Balance Sheet      │
│ (who did what, when)     │      │ (reads current_balance   │
└──────────────────────────┘      │  from accounts)          │
                                  └──────────────────────────┘
```
