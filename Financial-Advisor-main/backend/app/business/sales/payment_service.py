"""
Payment Service — Phase 3.

Records payments against invoices (receivables) and bills (payables).
Each payment posts a journal entry:

  Invoice payment:
    DR  Bank Account          amount
    CR  Accounts Receivable   amount

  Bill payment:
    DR  Accounts Payable      amount
    CR  Bank Account          amount

Partial payments are tracked; status is updated automatically:
  amount_paid < total_amount  → PARTIALLY_PAID
  amount_paid >= total_amount → PAID
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId
from app.utils.exceptions import not_found, bad_request
from app.business.audit.service import log_action, AuditAction
from app.business.accounting.journal_service import create_journal_entry
from app.business.accounting.journal_schemas import (
    CreateJournalEntryRequest, JournalLineRequest,
)


# ── Invoice Payment ───────────────────────────────────────────────────────────

async def record_invoice_payment(
    org_id: str, invoice_id: str, user_id: str,
    data, db, request=None,
) -> dict:
    invoice = await db.biz_invoices.find_one(
        {"_id": ObjectId(invoice_id), "org_id": org_id}
    )
    if not invoice:
        raise not_found("Invoice")

    if invoice["status"] in ("PAID", "CANCELLED"):
        raise bad_request(f"Cannot record payment on a {invoice['status'].lower()} invoice")

    amount_due = round(invoice["amount_due"], 2)
    payment_amount = round(data.amount, 2)

    if payment_amount > amount_due + 0.005:
        raise bad_request(
            f"Payment amount ₹{payment_amount:,.2f} exceeds amount due ₹{amount_due:,.2f}"
        )

    now = datetime.utcnow()
    payment_doc = {
        "amount": payment_amount,
        "payment_date": data.payment_date,
        "payment_method": data.payment_method,
        "reference": data.reference,
        "bank_account_code": data.bank_account_code,
        "notes": data.notes,
        "recorded_by": user_id,
        "recorded_at": now,
    }

    # Update totals
    new_paid = round(invoice["amount_paid"] + payment_amount, 2)
    new_due = round(invoice["total_amount"] - new_paid, 2)
    new_status = "PAID" if new_due <= 0.005 else "PARTIALLY_PAID"

    await db.biz_invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {
            "$set": {
                "amount_paid": new_paid,
                "amount_due": max(0.0, new_due),
                "status": new_status,
                "updated_at": now,
            },
            "$push": {"payments": payment_doc},
        },
    )

    # Post journal entry: DR Bank, CR Accounts Receivable
    try:
        await create_journal_entry(
            org_id=org_id,
            user_id=user_id,
            data=CreateJournalEntryRequest(
                date=data.payment_date,
                description=f"Payment received — {invoice['invoice_number']}",
                reference=data.reference or invoice["invoice_number"],
                lines=[
                    JournalLineRequest(
                        account_code=data.bank_account_code,
                        description=f"Payment: {invoice['invoice_number']}",
                        debit=payment_amount,
                        credit=0.0,
                    ),
                    JournalLineRequest(
                        account_code=invoice["receivable_account_code"],
                        description=f"Clear receivable: {invoice['invoice_number']}",
                        debit=0.0,
                        credit=payment_amount,
                    ),
                ],
            ),
            db=db,
            request=request,
        )
    except Exception as e:
        print(f"[payment_service] journal entry failed for payment on {invoice_id}: {e}")

    await log_action(db, org_id=org_id, user_id=user_id,
        action=AuditAction.MARK_INVOICE_PAID, entity_type="invoice",
        entity_id=invoice_id,
        new_value={"amount": payment_amount, "new_status": new_status},
        request=request)

    return await db.biz_invoices.find_one({"_id": ObjectId(invoice_id)})


# ── Bill (Vendor) Payment ─────────────────────────────────────────────────────

async def create_bill(org_id: str, user_id: str, data, db, request=None) -> dict:
    vendor = await db.biz_vendors.find_one(
        {"_id": ObjectId(data.vendor_id), "org_id": org_id, "is_active": True}
    )
    if not vendor:
        raise not_found("Vendor")

    from app.business.sales.invoice_service import _calculate_items
    calc = _calculate_items([i.model_dump() for i in data.items])

    now = datetime.utcnow()
    doc = {
        "org_id": org_id,
        "vendor_id": data.vendor_id,
        "vendor_name": vendor["name"],
        "bill_number": data.bill_number,
        "bill_date": data.bill_date,
        "due_date": data.due_date,
        "items": calc["items"],
        "subtotal": calc["subtotal"],
        "total_gst": calc["total_gst"],
        "total_amount": calc["total_amount"],
        "amount_paid": 0.0,
        "amount_due": calc["total_amount"],
        "status": "PENDING",
        "notes": data.notes,
        "payable_account_code": data.payable_account_code,
        "expense_account_code": data.expense_account_code,
        "payments": [],
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.biz_bills.insert_one(doc)
    bill_id = str(result.inserted_id)
    doc["_id"] = bill_id

    # Post journal entry: DR Expense, CR Accounts Payable
    try:
        await create_journal_entry(
            org_id=org_id,
            user_id=user_id,
            data=CreateJournalEntryRequest(
                date=data.bill_date,
                description=f"Bill from {vendor['name']}",
                reference=data.bill_number,
                lines=[
                    JournalLineRequest(
                        account_code=data.expense_account_code,
                        description=f"Expense — {vendor['name']}",
                        debit=calc["subtotal"],
                        credit=0.0,
                    ),
                    JournalLineRequest(
                        account_code=data.payable_account_code,
                        description=f"Payable — {vendor['name']}",
                        debit=0.0,
                        credit=calc["total_amount"],
                    ),
                ] + ([
                    JournalLineRequest(
                        account_code="1600",   # Input Tax Credit
                        description=f"GST ITC — {vendor['name']}",
                        debit=calc["total_gst"],
                        credit=0.0,
                    ),
                ] if calc["total_gst"] > 0 else []),
            ),
            db=db,
            request=request,
        )
    except Exception as e:
        print(f"[payment_service] bill journal failed: {e}")

    return doc


async def list_bills(org_id: str, db, page: int = 1, limit: int = 50,
                     status: Optional[str] = None, vendor_id: Optional[str] = None) -> dict:
    query: dict = {"org_id": org_id}
    if status:
        query["status"] = status.upper()
    if vendor_id:
        query["vendor_id"] = vendor_id
    skip = (page - 1) * limit
    total = await db.biz_bills.count_documents(query)
    cursor = db.biz_bills.find(query).sort("due_date", 1).skip(skip).limit(limit)
    items = [{**doc, "_id": str(doc["_id"])} async for doc in cursor]
    return {"data": items, "total": total, "page": page, "pages": (total + limit - 1) // limit}


async def record_bill_payment(
    org_id: str, bill_id: str, user_id: str,
    data, db, request=None,
) -> dict:
    bill = await db.biz_bills.find_one({"_id": ObjectId(bill_id), "org_id": org_id})
    if not bill:
        raise not_found("Bill")
    if bill["status"] == "PAID":
        raise bad_request("Bill already fully paid")

    amount_due = round(bill["amount_due"], 2)
    payment_amount = round(data.amount, 2)
    if payment_amount > amount_due + 0.005:
        raise bad_request(f"Payment ₹{payment_amount:,.2f} exceeds amount due ₹{amount_due:,.2f}")

    now = datetime.utcnow()
    new_paid = round(bill["amount_paid"] + payment_amount, 2)
    new_due = round(bill["total_amount"] - new_paid, 2)
    new_status = "PAID" if new_due <= 0.005 else "PARTIAL"

    await db.biz_bills.update_one(
        {"_id": ObjectId(bill_id)},
        {
            "$set": {"amount_paid": new_paid, "amount_due": max(0.0, new_due),
                     "status": new_status, "updated_at": now},
            "$push": {"payments": {
                "amount": payment_amount, "payment_date": data.payment_date,
                "payment_method": data.payment_method, "reference": data.reference,
                "recorded_by": user_id, "recorded_at": now,
            }},
        },
    )

    # Post journal: DR Accounts Payable, CR Bank
    try:
        await create_journal_entry(
            org_id=org_id, user_id=user_id,
            data=CreateJournalEntryRequest(
                date=data.payment_date,
                description=f"Payment to {bill['vendor_name']}",
                reference=data.reference or bill.get("bill_number", bill_id),
                lines=[
                    JournalLineRequest(
                        account_code=bill["payable_account_code"],
                        description=f"Clear payable — {bill['vendor_name']}",
                        debit=payment_amount, credit=0.0,
                    ),
                    JournalLineRequest(
                        account_code=data.bank_account_code,
                        description=f"Bank payment — {bill['vendor_name']}",
                        debit=0.0, credit=payment_amount,
                    ),
                ],
            ),
            db=db, request=request,
        )
    except Exception as e:
        print(f"[payment_service] bill payment journal failed: {e}")

    updated = await db.biz_bills.find_one({"_id": ObjectId(bill_id)})
    updated["_id"] = str(updated["_id"])
    return updated


# Fix missing Optional import
from typing import Optional
