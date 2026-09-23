# 08 — Tax Compliance: GST & TDS

## 8.1 India Tax Compliance Overview

Indian businesses must comply with two major indirect/withholding tax frameworks:

1. **GST (Goods and Services Tax)**: Tax on supply of goods and services
2. **TDS (Tax Deducted at Source)**: Tax withheld from payments to vendors/employees

This module implements both, including a **configurable rules engine**, **tax calendar**, and **compliance dashboard**.

---

## 8.2 GST Engine

### What is GST?
GST is a destination-based consumption tax levied at every stage of the supply chain. Businesses collect GST from customers and pay it to the government, after deducting the GST they paid on their own purchases (Input Tax Credit).

### GST Rate Slabs (India)
| Rate | Applies To |
|------|-----------|
| 0% (Exempt) | Essential goods (milk, vegetables, education) |
| 5% | Economy services, basic goods |
| 12% | Processed food, business class air travel |
| 18% | **Most services** (software, consulting, SaaS) |
| 28% | Luxury goods (cars, tobacco, aerated drinks) |

### GST Types
```
INTRA-STATE (buyer & seller in same state):
  GST = CGST (Central) + SGST (State)
  Example: 18% GST = 9% CGST + 9% SGST

INTER-STATE (buyer & seller in different states):
  GST = IGST (Integrated)
  Example: 18% GST = 18% IGST
```

### GST Calculation Service (`gst_service.py`)
```python
async def compute_gst_for_invoice(org_id, invoice_id, db):
    invoice = await db.biz_invoices.find_one({"_id": ObjectId(invoice_id)})
    org = await db.organizations.find_one({"_id": ObjectId(org_id)})
    customer = await db.biz_customers.find_one({"_id": ObjectId(invoice["customer_id"])})

    # Determine intra-state vs inter-state
    org_state = org.get("state")
    customer_state = customer.get("billing_address", {}).get("state")
    is_interstate = org_state != customer_state

    for item in invoice["items"]:
        gst_rate = item.get("gst_rate", 18)  # Default 18%
        gst_amount = item["amount"] * (gst_rate / 100)

        if is_interstate:
            item["igst"] = gst_amount
        else:
            item["cgst"] = gst_amount / 2
            item["sgst"] = gst_amount / 2
```

### GST Dashboard
The GST page shows:
- **Monthly GST Summary**: Output GST (collected) vs Input GST (paid) → Net liability
- **GSTR-1 Data**: Sales register for filing
- **GSTR-3B Summary**: Monthly return summary
- **ITC (Input Tax Credit)**: Credits available from purchases

---

## 8.3 TDS Engine

### What is TDS?
TDS is tax deducted at the time of making certain payments (salary, professional fees, rent, contractor payments). The payer deducts TDS and deposits it with the government.

### TDS Sections Implemented
| Section | Payment Type | Rate | Threshold |
|---------|-------------|------|-----------|
| 192 | Salary | Slab-based | ₹2,50,000/yr |
| 194A | Interest | 10% | ₹40,000/yr |
| 194C | Contractor (Individual) | 1% | ₹30,000/txn |
| 194C | Contractor (Company) | 2% | ₹30,000/txn |
| 194H | Commission/Brokerage | 5% | ₹15,000/yr |
| 194I(a) | Rent – Plant & Machinery | 2% | ₹2,40,000/yr |
| 194I(b) | Rent – Land/Building | 10% | ₹2,40,000/yr |
| 194J | Professional/Technical fees | 10% | ₹30,000/yr |
| 194Q | Purchase of goods | 0.1% | ₹50,00,000/yr |

### TDS Calculation Service (`tds_service.py`)
```python
async def compute_tds(org_id, payment_amount, section, payee_type, transaction_date, db):
    # 1. Look up the applicable rule (version-aware)
    rule = await rules_engine.get_applicable_rule(
        org_id, "TDS", section, transaction_date, db, applicable_to=payee_type
    )

    # 2. Check threshold
    if payment_amount < rule["threshold"]:
        return {"tds_amount": 0, "reason": "Below threshold"}

    # 3. Calculate TDS
    tds_amount = payment_amount * (rule["rate_pct"] / 100)
    return {
        "tds_amount": round(tds_amount, 2),
        "rate_pct": rule["rate_pct"],
        "section": section,
        "net_payable": payment_amount - tds_amount,
    }
```

---

## 8.4 Configurable Tax Rules Engine

### Why a Rules Engine?
Tax rates change periodically (budget announcements, government notifications). A hardcoded rate would require code changes. The rules engine stores rates in the database with effective dates.

### Rule Resolution
```python
async def get_applicable_rule(org_id, tax_type, section, transaction_date, db):
    """
    Find the tax rule that was active on a given transaction date.
    Uses effective_from date to resolve historical transactions correctly.
    """
    query = {
        "org_id": org_id,
        "tax_type": tax_type,        # "GST" or "TDS"
        "section": section,          # "GST_18" or "194J"
        "is_active": True,
        "effective_from": {"$lte": transaction_date},
    }
    # Sort by effective_from DESC → most recent applicable rule
    return await db.biz_tax_rules.find_one(query, sort=[("effective_from", -1)])
```

**Why version-aware rules?**
If GST was 12% until March 2025 and changed to 18% in April 2025:
- A transaction dated March 15, 2025 uses the 12% rule
- A transaction dated April 15, 2025 uses the 18% rule
- Both rules exist in the database simultaneously

### Seeding Default Rules
On organization creation, 14 default Indian tax rules are seeded:
- 5 GST rules (Exempt, 5%, 12%, 18%, 28%)
- 9 TDS rules (192, 194A, 194C×2, 194H, 194I×2, 194J, 194Q)

---

## 8.5 Tax Calendar

### Compliance Deadlines
The tax calendar service generates upcoming deadlines:

| Deadline | Due Date | Description |
|----------|----------|-------------|
| GSTR-1 | 11th of next month | Monthly sales return |
| GSTR-3B | 20th of next month | Monthly summary return |
| TDS Payment | 7th of next month | Deposit TDS collected |
| Form 26Q | End of month after quarter | Quarterly TDS return |
| Advance Tax | 15 Jun/Sep/Dec/Mar | Quarterly advance tax |

```python
async def get_upcoming_deadlines(org_id, db, days=45):
    """Returns all compliance deadlines within the next 45 days."""
    today = datetime.utcnow().date()
    cutoff = today + timedelta(days=days)
    # Generate deadlines based on current date and fiscal quarter
```

---

## 8.6 Tax Dashboard

The consolidated tax dashboard (`/business/tax`) provides:

```
┌────────────────────────────────────────────────┐
│              TAX DASHBOARD                     │
├────────────────────────────────────────────────┤
│                                                │
│  GST THIS MONTH          TDS THIS QUARTER      │
│  Output: ₹3,60,000       Deducted: ₹1,85,000  │
│  Input:  ₹2,10,000       Deposited: ₹1,40,000 │
│  Net:    ₹1,50,000       Pending:   ₹45,000   │
│                                                │
│  UPCOMING DEADLINES (45 days)                  │
│  📅 Oct 7  - TDS Payment for September         │
│  📅 Oct 11 - GSTR-1 for September              │
│  📅 Oct 20 - GSTR-3B for September             │
│                                                │
│  TAX RULES ENGINE                              │
│  14 active rules (5 GST + 9 TDS)              │
│  [Seed Default Indian Rules] [Add Custom Rule] │
│                                                │
│  GST FILINGS     │  TDS CERTIFICATES          │
│  (history table)  │  (Form 16/16A generation)  │
└────────────────────────────────────────────────┘
```

### Frontend: 1200+ Lines
The tax page (`business/tax/page.tsx`) is the largest single frontend file at 1,236 lines. It combines:
- GST dashboard with computation
- TDS management with section-wise breakdown
- Tax rules table with CRUD operations
- Compliance calendar with deadline alerts
- Filing history with status tracking
