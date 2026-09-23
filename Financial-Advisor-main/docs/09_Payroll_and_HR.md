# 09 — Payroll & HR

## 9.1 Overview

The Payroll module handles the complete employee lifecycle from onboarding to salary disbursement:

```
Employee Onboarding → CTC Configuration → Monthly Payroll Run → Salary Slip → TDS Computation
```

---

## 9.2 Employee Management

### Data Model
```python
{
    "org_id": "6ab38508...",
    "employee_id": "EMP-001",           # Auto-generated
    "full_name": "Priya Sharma",
    "email": "priya@company.in",
    "phone": "+91 98765 43210",
    "department": "Engineering",
    "designation": "Senior Developer",
    "date_of_joining": "2024-01-15",
    "employment_type": "FULL_TIME",      # FULL_TIME, PART_TIME, CONTRACT
    "ctc_annual": 1800000,               # Cost to Company: ₹18,00,000/yr
    "salary_structure": {
        "basic": 750000,                 # 41.67% of CTC
        "hra": 300000,                   # 40% of basic
        "special_allowance": 330000,     # Flexible component
        "pf_employer": 21600,            # 12% of basic (capped at ₹15,000 basic)
        "gratuity": 36000,              # 4.81% of basic
        "insurance": 25000,              # Health insurance premium
    },
    "bank_details": {
        "account_number": "XXXXXXXX1234",
        "ifsc": "HDFC0001234",
        "bank_name": "HDFC Bank"
    },
    "pan_number": "ABCPS1234K",
    "uan": "101234567890",               # Universal Account Number (PF)
    "is_active": true
}
```

### CTC Breakdown Calculation
The system auto-calculates salary structure from CTC:

```python
def calculate_salary_structure(ctc_annual: float) -> dict:
    basic = ctc_annual * 0.40                    # 40% of CTC
    hra = basic * 0.40                           # 40% of basic (metro)
    pf_employer = min(basic * 0.12, 21600)       # 12% of basic, max ₹21,600/yr
    gratuity = basic * 0.0481                    # 4.81% of basic
    insurance = 25000                            # Fixed health insurance
    special = ctc - basic - hra - pf_employer - gratuity - insurance
    return {
        "basic": basic,
        "hra": hra,
        "special_allowance": special,
        "pf_employer": pf_employer,
        "gratuity": gratuity,
        "insurance": insurance,
    }
```

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/organizations/{org_id}/employees` | List with department filter |
| POST | `/organizations/{org_id}/employees` | Onboard employee |
| GET | `/organizations/{org_id}/employees/{id}` | Employee details |
| PUT | `/organizations/{org_id}/employees/{id}` | Update details |
| PATCH | `/organizations/{org_id}/employees/{id}/deactivate` | Offboard |

---

## 9.3 Payroll Processing

### Payroll Run Lifecycle
```
DRAFT → COMPUTED → APPROVED → DISBURSED
                       ↓
                  CANCELLED
```

### Monthly Payroll Calculation

For each employee, the system computes:

```
GROSS SALARY (monthly)
  Basic                    ₹62,500
  HRA                     ₹25,000
  Special Allowance        ₹27,500
                          ─────────
  GROSS                    ₹1,15,000

DEDUCTIONS
  PF Employee (12%)        ₹1,800    (12% of ₹15,000 PF basic)
  Professional Tax         ₹200      (state-specific)
  TDS                      ₹12,500   (based on annual tax slab)
  ESI                      ₹0        (only if gross < ₹21,000)
                          ─────────
  TOTAL DEDUCTIONS         ₹14,500

NET SALARY                 ₹1,00,500
```

### TDS on Salary (Section 192)
```python
async def compute_salary_tds(employee, month, year, db):
    # 1. Project annual income from CTC
    annual_taxable = employee["ctc_annual"] - exempt_components

    # 2. Apply standard deduction (₹75,000 new regime)
    annual_taxable -= 75000

    # 3. Compute tax using FY 2024-25 slabs
    annual_tax = compute_new_regime_tax(annual_taxable)

    # 4. Add 4% cess
    annual_tax *= 1.04

    # 5. Monthly TDS = annual_tax / 12
    monthly_tds = annual_tax / 12
```

### Payroll Run API
```
POST /organizations/{org_id}/payroll/runs

{
    "period_month": 9,
    "period_year": 2026,
    "employee_ids": ["emp1", "emp2", ...]  // or empty for all active employees
}
```

### Journal Entry Auto-Creation
When a payroll run is approved, the system creates accounting entries:
```
Debit:  Salary Expense (5400)      ₹2,30,000  (total gross)
Credit: PF Payable (2300)          ₹3,600     (employer + employee PF)
Credit: TDS Payable (2200)         ₹25,000    (TDS deducted)
Credit: HDFC Checking (1000)       ₹2,01,400  (net salary paid)
```

---

## 9.4 Payroll Dashboard (Frontend)

```
┌───────────────────────────────────────────────────────────┐
│                    PAYROLL DASHBOARD                      │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ACTIVE EMPLOYEES: 12    │  TOTAL CTC: ₹1.8 Cr/yr       │
│  DEPARTMENTS: 4          │  AVG CTC: ₹15 L/yr            │
│                                                           │
│  LATEST PAYROLL RUN: September 2026                      │
│  Status: DISBURSED                                       │
│  Total Gross: ₹15,20,000   Net Paid: ₹12,85,000        │
│  TDS Deducted: ₹1,85,000   PF: ₹50,000                 │
│                                                           │
│  PAYROLL HISTORY                                          │
│  ┌─────────┬──────────┬──────────┬──────────┬──────────┐ │
│  │ Month   │ Gross    │ Net      │ TDS      │ Status   │ │
│  ├─────────┼──────────┼──────────┼──────────┼──────────┤ │
│  │ Sep '26 │ ₹15.2L   │ ₹12.8L   │ ₹1.85L   │ ✅ Done  │ │
│  │ Aug '26 │ ₹14.8L   │ ₹12.5L   │ ₹1.80L   │ ✅ Done  │ │
│  │ Jul '26 │ ₹14.8L   │ ₹12.5L   │ ₹1.80L   │ ✅ Done  │ │
│  └─────────┴──────────┴──────────┴──────────┴──────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

## 9.5 Employee Self-Service (Future Scope)

The architecture supports future expansion:
- Salary slip downloads (PDF)
- Leave management
- Reimbursement claims
- Form 16 generation
- Investment declaration for tax planning
