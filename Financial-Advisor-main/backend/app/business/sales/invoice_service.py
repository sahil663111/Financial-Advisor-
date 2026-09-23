"""
Invoice Service — Phase 3.

Lifecycle: DRAFT → SENT → PARTIALLY_PAID → PAID (or OVERDUE → CANCELLED)

Every invoice posts automatically to accounting when created (SENT status):
  DR  Accounts Receivable      total_amount
  CR  Revenue (per item)       subtotal
  CR  GST Payable              total_gst

Items calculation:
  line_total   = quantity × unit_price × (1 - discount_pct/100)
  gst_amount   = line_total × gst_rate_pct/100
  line_total_w_gst = line_total + gst_amount

Voiding/cancelling reverses the accounting entry via the Journal Engine.
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId
from app.utils.exceptions import not_found, bad_request, conflict
from app.business.audit.service import log_action, AuditAction
from app.business.accounting.journal_service import create_journal_entry
from app.business.accounting.journal_schemas import (
    CreateJournalEntryRequest, JournalLineRequest,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _calculate_items(items: list[dict]) -> dict:
    """
    Calculate subtotal, gst_amount, total for an invoice.
    Returns enriched item list + summary.
    """
    enriched = []
    subtotal = 0.0
    total_gst = 0.0

    for item in items:
        qty = item["quantity"]
        price = item["unit_price"]
        disc = item.get("discount_pct", 0.0)
        gst_rate = item.get("gst_rate_pct", 18.0)
        gst_type = item.get("gst_type", "CGST_SGST")

        taxable = round(qty * price * (1 - disc / 100), 2)
        gst_amt = round(taxable * gst_rate / 100, 2)
        line_total = round(taxable + gst_amt, 2)

        enriched.append({
            **item,
            "taxable_amount": taxable,
            "gst_amount": gst_amt,
            "line_total": line_total,
            "cgst": round(gst_amt / 2, 2) if gst_type == "CGST_SGST" else 0.0,
            "sgst": round(gst_amt / 2, 2) if gst_type == "CGST_SGST" else 0.0,
            "igst": gst_amt if gst_type == "IGST" else 0.0,
        })
        subtotal += taxable
        total_gst += gst_amt

    return {
        "items": enriched,
        "subtotal": round(subtotal, 2),
        "total_gst": round(total_gst, 2),
        "total_amount": round(subtotal + total_gst, 2),
    }


async def _next_invoice_number(org_id: str, db) -> str:
    count = await db.biz_invoices.count_documents({"org_id": org_id})
    year = datetime.utcnow().year
    return f"INV-{year}-{count + 1:04d}"


async def _post_invoice_to_accounting(
    org_id: str, user_id: str, invoice: dict, db, request=None
) -> Optional[str]:
    """
    Post journal entry for a new invoice.
    DR  Accounts Receivable  = total_amount
    CR  Revenue account(s)   = subtotal
    CR  GST Payable          = total_gst
    Returns journal entry id, or None if accounts not found (non-fatal).
    """
    try:
        lines = [
            JournalLineRequest(
                account_code=invoice["receivable_account_code"],
                description=f"Invoice {invoice['invoice_number']}",
                debit=invoice["total_amount"],
                credit=0.0,
            ),
        ]
        # Revenue line
        lines.append(JournalLineRequest(
            account_code=invoice["revenue_account_code"],
            description=f"Revenue — {invoice['invoice_number']}",
            debit=0.0,
            credit=invoice["subtotal"],
        ))
        # GST line (only if gst > 0)
        if invoice["total_gst"] > 0:
            lines.append(JournalLineRequest(
                account_code=invoice["gst_payable_account_code"],
                description=f"GST — {invoice['invoice_number']}",
                debit=0.0,
                credit=invoice["total_gst"],
            ))

        entry = await create_journal_entry(
            org_id=org_id,
            user_id=user_id,
            data=CreateJournalEntryRequest(
                date=invoice["issue_date"],
                description=f"Invoice {invoice['invoice_number']} — {invoice.get('customer_name', '')}",
                reference=invoice["invoice_number"],
                lines=lines,
            ),
            db=db,
            request=request,
        )
        return str(entry["_id"])
    except Exception as e:
        # Non-fatal — invoice is created, journal entry is skipped with warning
        print(f"[invoice_service] auto-journal failed for {invoice['invoice_number']}: {e}")
        return None


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def create_invoice(org_id: str, user_id: str, data, db, request=None) -> dict:
    # Verify customer
    customer = await db.biz_customers.find_one(
        {"_id": ObjectId(data.customer_id), "org_id": org_id, "is_active": True}
    )
    if not customer:
        raise not_found("Customer")

    calc = _calculate_items([i.model_dump() for i in data.items])
    invoice_number = await _next_invoice_number(org_id, db)
    now = datetime.utcnow()

    doc = {
        "org_id": org_id,
        "invoice_number": invoice_number,
        "customer_id": data.customer_id,
        "customer_name": customer["name"],
        "customer_gstin": customer.get("gstin"),
        "issue_date": data.issue_date,
        "due_date": data.due_date,
        "items": calc["items"],
        "subtotal": calc["subtotal"],
        "total_gst": calc["total_gst"],
        "total_amount": calc["total_amount"],
        "amount_paid": 0.0,
        "amount_due": calc["total_amount"],
        "status": "SENT",
        "notes": data.notes,
        "billing_address": data.billing_address,
        "receivable_account_code": data.receivable_account_code,
        "revenue_account_code": data.revenue_account_code,
        "gst_payable_account_code": data.gst_payable_account_code,
        "journal_entry_id": None,
        "payments": [],
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.biz_invoices.insert_one(doc)
    invoice_id = str(result.inserted_id)
    doc["_id"] = invoice_id

    # Auto-post to accounting
    je_id = await _post_invoice_to_accounting(org_id, user_id, doc, db, request)
    if je_id:
        await db.biz_invoices.update_one(
            {"_id": ObjectId(invoice_id)},
            {"$set": {"journal_entry_id": je_id}},
        )
        doc["journal_entry_id"] = je_id

    await log_action(db, org_id=org_id, user_id=user_id,
        action=AuditAction.CREATE_INVOICE, entity_type="invoice",
        entity_id=invoice_id,
        new_value={"invoice_number": invoice_number, "total": calc["total_amount"]},
        request=request)
    return doc


async def list_invoices(
    org_id: str, db,
    page: int = 1, limit: int = 50,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    query: dict = {"org_id": org_id}
    if status:
        query["status"] = status.upper()
    if customer_id:
        query["customer_id"] = customer_id
    if search:
        query["$or"] = [
            {"invoice_number": {"$regex": search, "$options": "i"}},
            {"customer_name": {"$regex": search, "$options": "i"}},
        ]
    skip = (page - 1) * limit
    total = await db.biz_invoices.count_documents(query)
    cursor = db.biz_invoices.find(query).sort("issue_date", -1).skip(skip).limit(limit)
    items = [{**doc, "_id": str(doc["_id"])} async for doc in cursor]
    return {"data": items, "total": total, "page": page, "pages": (total + limit - 1) // limit}


async def get_invoice(org_id: str, invoice_id: str, db) -> dict:
    doc = await db.biz_invoices.find_one({"_id": ObjectId(invoice_id), "org_id": org_id})
    if not doc:
        raise not_found("Invoice")
    doc["_id"] = str(doc["_id"])
    return doc


async def cancel_invoice(org_id: str, invoice_id: str, user_id: str,
                          db, request=None) -> dict:
    doc = await db.biz_invoices.find_one({"_id": ObjectId(invoice_id), "org_id": org_id})
    if not doc:
        raise not_found("Invoice")
    if doc["status"] == "PAID":
        raise bad_request("Cannot cancel a fully paid invoice")
    if doc["status"] == "CANCELLED":
        raise bad_request("Invoice already cancelled")

    # Void the accounting entry if it exists
    if doc.get("journal_entry_id"):
        try:
            from app.business.accounting.journal_service import void_journal_entry
            await void_journal_entry(
                org_id=org_id,
                entry_id=doc["journal_entry_id"],
                user_id=user_id,
                reason=f"Invoice {doc['invoice_number']} cancelled",
                db=db,
                request=request,
            )
        except Exception:
            pass  # Non-fatal

    await db.biz_invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {"$set": {"status": "CANCELLED", "updated_at": datetime.utcnow()}},
    )
    await log_action(db, org_id=org_id, user_id=user_id,
        action=AuditAction.DELETE_INVOICE, entity_type="invoice",
        entity_id=invoice_id, request=request)

    return await get_invoice(org_id, invoice_id, db)


async def mark_overdue(org_id: str, db) -> int:
    """
    Mark all SENT/PARTIALLY_PAID invoices past due_date as OVERDUE.
    Intended to be called periodically.
    Returns count updated.
    """
    result = await db.biz_invoices.update_many(
        {
            "org_id": org_id,
            "status": {"$in": ["SENT", "PARTIALLY_PAID"]},
            "due_date": {"$lt": datetime.utcnow()},
        },
        {"$set": {"status": "OVERDUE", "updated_at": datetime.utcnow()}},
    )
    return result.modified_count
