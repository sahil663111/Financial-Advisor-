import json
from datetime import datetime
from typing import AsyncGenerator, Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from bson import ObjectId
import google.generativeai as genai

from app.database import get_db
from app.config import settings
from app.business.rbac.dependencies import OrgContext, require_org_member
from app.business.ai.schemas import SendMessageRequest
from app.business.ai.tools import TOOL_DEFINITIONS, TOOL_FUNCTIONS

router = APIRouter(tags=["Business - AI CFO"])

# Configure Gemini
genai.configure(api_key=settings.LLM_API_KEY)

SYSTEM_PROMPT = """You are a highly professional AI Virtual CFO and CA for a business.

Your role:
- Answer questions about the business's finances using ONLY data from the provided tools.
- Give clear, actionable financial advice, insights, and scenario analysis based on real data.
- Distinguish between actual historical data, ML predictions/forecasts, and your own assumptions.
- Do NOT hallucinate financial facts, revenue, or cash figures. Use the tools.
- Use professional formatting (e.g. bolding key terms, using markdown tables if helpful).
- Format numbers in Indian format (₹, lakhs, crores).

If data is unavailable or the user asks for something not covered by your tools, state that the data is currently unavailable.
"""

@router.get("/organizations/{org_id}/ai/conversations")
async def list_conversations(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """List all AI conversations for the organization."""
    cursor = db.biz_ai_conversations.find({"org_id": ctx.org_id}).sort("updated_at", -1)
    results = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        results.append(doc)
    return results

@router.post("/organizations/{org_id}/ai/conversations")
async def create_conversation(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """Create a new AI conversation."""
    doc = {
        "org_id": ctx.org_id,
        "title": "New Conversation",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    result = await db.biz_ai_conversations.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@router.get("/organizations/{org_id}/ai/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """Get all messages in a conversation."""
    cursor = db.biz_ai_messages.find({"conversation_id": conversation_id}).sort("created_at", 1)
    messages = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        messages.append(doc)
    return messages

@router.post("/organizations/{org_id}/ai/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    request: SendMessageRequest,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """
    Send a message to the AI CFO. Uses Gemini tool calling.
    Returns a streaming Server-Sent Events (SSE) response.
    """
    # 1. Save user message
    now = datetime.utcnow()
    await db.biz_ai_messages.insert_one({
        "conversation_id": conversation_id,
        "role": "user",
        "content": request.message,
        "created_at": now
    })

    # Update conversation title if first real message
    count = await db.biz_ai_messages.count_documents({"conversation_id": conversation_id})
    if count <= 2:
        title = request.message[:50] + ("..." if len(request.message) > 50 else "")
        await db.biz_ai_conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {"title": title, "updated_at": now}}
        )

    # 2. Build History for Gemini
    history_cursor = db.biz_ai_messages.find(
        {"conversation_id": conversation_id}
    ).sort("created_at", 1).limit(20)
    history = [doc async for doc in history_cursor]
    
    chat_history = []
    for msg in history[:-1]: # exclude the one we just saved
        chat_history.append({"role": msg["role"], "parts": [msg["content"]]})

    # 3. Stream Generator
    async def generate() -> AsyncGenerator[str, None]:
        try:
            model = genai.GenerativeModel(
                model_name=settings.LLM_MODEL,
                system_instruction=SYSTEM_PROMPT,
                tools=[{"function_declarations": TOOL_DEFINITIONS}]
            )
            chat = model.start_chat(history=chat_history)
            
            # Send message and handle tool calling loop
            response = chat.send_message(request.message)

            while response.parts:
                part = response.parts[0]
                if not (
                    hasattr(part, "function_call")
                    and part.function_call
                    and getattr(part.function_call, "name", "")
                ):
                    break

                fc = part.function_call
                fn_name = fc.name
                args = dict(fc.args) if fc.args else {}
                
                # Execute tool locally (pass org_id automatically)
                if fn_name in TOOL_FUNCTIONS:
                    tool_res = await TOOL_FUNCTIONS[fn_name](ctx.org_id)
                else:
                    tool_res = {"error": f"Tool {fn_name} not found"}

                # Provide result back to Gemini
                response = chat.send_message(
                    genai.types.Part.from_function_response(
                        name=fn_name,
                        response={"result": tool_res}
                    )
                )

            # Finally, yield text chunks
            full_response = ""
            for chunk in response:
                if chunk.text:
                    full_response += chunk.text
                    yield f"data: {json.dumps({'content': chunk.text})}\n\n"

            # Save the final assistant message to DB
            await db.biz_ai_messages.insert_one({
                "conversation_id": conversation_id,
                "role": "model",
                "content": full_response,
                "created_at": datetime.utcnow()
            })
            
            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

from app.business.ai.scheduler import generate_and_save_executive_summary

@router.get("/organizations/{org_id}/ai/insights/summary")
async def get_insights_summary(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db)
):
    """
    Fetch the latest high-level executive summary, or generate one if none exists.
    """
    latest = await db.biz_ai_summaries.find_one(
        {"org_id": ctx.org_id},
        sort=[("generated_at", -1)]
    )
    
    if latest:
        latest.pop("_id", None)
        return latest
        
    # Fallback to on-the-fly generation if missing
    doc = await generate_and_save_executive_summary(ctx.org_id, db)
    doc.pop("_id", None)
    return doc
