from fastapi import APIRouter, Depends
from bson import ObjectId
from app.database import get_db
from app.business.rbac.dependencies import OrgContext, require_org_member
from app.business.notifications.service import generate_notifications

router = APIRouter(tags=["Business - Notifications"])


@router.get("/organizations/{org_id}/notifications")
async def get_notifications(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Get notifications, auto-generating new ones from current business data first."""
    try:
        await generate_notifications(ctx.org_id, db)
    except Exception:
        pass  # Never block the response on notification generation failure

    cursor = db.notifications.find(
        {"org_id": ctx.org_id}
    ).sort("created_at", -1).limit(50)

    results = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        results.append(doc)
    return results


@router.get("/organizations/{org_id}/notifications/unread-count")
async def get_unread_count(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Lightweight endpoint for the bell badge — no generation, just the count."""
    count = await db.notifications.count_documents(
        {"org_id": ctx.org_id, "is_read": False}
    )
    return {"count": count}


@router.put("/organizations/{org_id}/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    await db.notifications.update_one(
        {"_id": ObjectId(notification_id), "org_id": ctx.org_id},
        {"$set": {"is_read": True}},
    )
    return {"status": "success"}


@router.put("/organizations/{org_id}/notifications/read-all")
async def mark_all_read(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    await db.notifications.update_many(
        {"org_id": ctx.org_id, "is_read": False},
        {"$set": {"is_read": True}},
    )
    return {"status": "success"}
