# 07 — Sales & Invoicing

## 7.1 Overview

The Sales module handles the complete **Order-to-Cash** and **Procure-to-Pay** cycles:

```
ORDER-TO-CASH (Revenue side):
  Customer → Invoice → Payment → Receipt → Revenue Recognition

PROCURE-TO-PAY (Expense side):
  Vendor → Bill → Payment → Expense Recognition
```

---

## 7.2 Customer Management

### Data Model
```python
{
    "org_id": "6ab38508...",
    "name": "TechCorp Solutions Pvt Ltd",
    "email": "accounts@techcorp.in",
    "phone": "+91 98765 43210",
    "gstin": "29ABCDE1234F1ZH",           # GST Identification Number
    "billing_address": {
        "line1": "123 MG Road",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560001"
    },
    "credit_limit": 500000,               # Max outstanding amount
    "payment_terms_days": 30,             # Net 30
    "outstanding_balance": 125000,
    "is_active": true,
    "created_at": "2026-01-15T..."
}
```

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/organizations/{org_id}/customers` | List all customers with search & pagination |
| POST | `/organizations/{org_id}/customers` | Create customer |
| GET | `/organizations/{org_id}/customers/{id}` | Get customer details |
| PUT | `/organizations/{org_id}/customers/{id}` | Update customer |
| DELETE | `/organizations/{org_id}/customers/{id}` | Soft-delete (deactivate) |

---

## 7.3 Vendor Management

Vendors are the mirror image of customers — they represent businesses you buy from:

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/organizations/{org_id}/vendors` | List vendors |
| POST | `/organizations/{org_id}/vendors` | Create vendor |
| PUT | `/organizations/{org_id}/vendors/{id}` | Update vendor |
| DELETE | `/organizations/{org_id}/vendors/{id}` | Deactivate vendor |

---

## 7.4 Invoice System

### Invoice Lifecycle
```
DRAFT → SENT → PARTIALLY_PAID → PAID
                    ↓
                 OVERDUE (automatic when past due_date)
                    ↓
                 CANCELLED / VOID
```

### Data Model
```python
{
    "org_id": "6ab38508...",
    "invoice_number": "INV-2026-0042",     # Auto-generated
    "customer_id": "6ab39bd7...",
    "date": "2026-09-15",
    "due_date": "2026-10-15",              # Based on payment_terms_days
    "status": "SENT",
    "items": [
        {
            "description": "Software Development - September",
            "quantity": 1,
            "unit_price": 200000,
            "gst_rate": 18,                 # GST percentage
            "amount": 200000,
            "gst_amount": 36000             # Auto-calculated
        }
    ],
    "subtotal": 200000,
    "total_gst": 36000,
    "total": 236000,
    "amount_paid": 0,
    "amount_due": 236000,
    "notes": "Payment via NEFT/RTGS",
    "created_at": "2026-09-15T..."
}
```

### Key Features
- **Auto-numbering**: `INV-YYYY-NNNN` format
- **GST calculation**: Automatic CGST/SGST or IGST split based on state
- **Due date calculation**: Based on customer's payment terms
- **Partial payments**: Track multiple payments against a single invoice
- **Overdue detection**: Automatic status change when past due date

### Journal Entry Auto-Creation
When an invoice is created, the system can automatically generate the accounting entry:
```
Debit:  Accounts Receivable (1200)  ₹2,36,000
Credit: Software Revenue (4000)     ₹2,00,000
Credit: GST Payable (2100)          ₹36,000
```

---

## 7.5 Payment Processing

### Payment Recording
```
POST /organizations/{org_id}/payments

{
    "invoice_id": "6ab39bd7...",
    "amount": 236000,
    "date": "2026-10-10",
    "method": "NEFT",
    "reference": "UTR123456789",
    "notes": "Full payment received"
}
```

### Payment Allocation
- Full payment → Invoice status changes to `PAID`
- Partial payment → Invoice status changes to `PARTIALLY_PAID`, `amount_paid` updated
- Overpayment → Excess recorded as credit note

### Accounting Entry on Payment
```
Debit:  HDFC Checking (1000)         ₹2,36,000  (cash received)
Credit: Accounts Receivable (1200)   ₹2,36,000  (receivable cleared)
```

---

## 7.6 Accounts Receivable Aging

The receivables page shows outstanding invoices grouped by age:

```
| Aging Bucket    | Amount         | Count |
|----------------|----------------|-------|
| Current (0-30) | ₹12,50,000     | 8     |
| 31-60 days     | ₹5,20,000      | 3     |
| 61-90 days     | ₹2,10,000      | 2     |
| 90+ days       | ₹85,000        | 1     | ⚠️ Action needed
| TOTAL           | ₹20,65,000     | 14    |
```

This helps businesses identify which customers are paying late and take collection action.

---

## 7.7 Accounts Payable (Bills)

The payables module tracks what the business owes to vendors:

### Bill Lifecycle
```
DRAFT → APPROVED → PARTIALLY_PAID → PAID
                         ↓
                      OVERDUE
```

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/organizations/{org_id}/bills` | List bills with status filter |
| POST | `/organizations/{org_id}/bills` | Create vendor bill |
| POST | `/organizations/{org_id}/bills/{id}/pay` | Record payment against bill |
| GET | `/organizations/{org_id}/payables/aging` | Payables aging report |

---

## 7.8 Receivables vs Payables — Flow Diagram

```
RECEIVABLES (Money owed TO us):
Customer places order → We create Invoice → Customer pays → We record Payment
    ↓                      ↓                    ↓                ↓
 biz_customers         biz_invoices          payments       journal_entries
                      (status: SENT)      (method: NEFT)   (DR Cash, CR AR)

PAYABLES (Money owed BY us):
Vendor sends bill → We record Bill → We pay vendor → We record Payment
    ↓                   ↓                 ↓                ↓
 biz_vendors          biz_bills         payments       journal_entries
                    (status: APPROVED)  (method: NEFT)  (DR AP, CR Cash)
```
