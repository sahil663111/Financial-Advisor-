import json
import asyncio
from datetime import datetime
import google.generativeai as genai

from app.config import settings
from app.business.ai.tools import TOOL_FUNCTIONS

# Configure Gemini
genai.configure(api_key=settings.LLM_API_KEY)

async def generate_and_save_executive_summary(org_id: str, db):
    """
    Generate a high-level executive summary using the LLM analyzing current data.
    """
    summary_data = await TOOL_FUNCTIONS["get_financial_summary"](org_id)
    ratios = await TOOL_FUNCTIONS["get_financial_ratios"](org_id)
    
    prompt = (
        f"Generate a daily/weekly executive summary based on this data:\n"
        f"Summary: {summary_data}\n"
        f"Ratios: {ratios}\n\n"
        "Format your response EXACTLY as a JSON object with these keys: "
        "'insights' (list of strings), 'risks' (list of strings), 'recommended_actions' (list of strings). "
        "Do not include markdown blocks like ```json."
    )
    
    model = genai.GenerativeModel(model_name=settings.LLM_MODEL)
    try:
        response = model.generate_content(prompt)
        raw_text = response.text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw_text)
    except Exception:
        parsed = {"insights": [], "risks": ["Failed to parse AI insights"], "recommended_actions": []}

    doc = {
        "org_id": org_id,
        "revenue": summary_data.get("total_revenue_inr", 0),
        "expenses": summary_data.get("total_expenses_inr", 0),
        "net_profit": summary_data.get("net_profit_inr", 0),
        "cash_balance": summary_data.get("current_cash_balance_inr", 0),
        "runway_months": summary_data.get("cash_runway_months", 0),
        "key_insights": parsed.get("insights", []),
        "risks": parsed.get("risks", []),
        "recommended_actions": parsed.get("recommended_actions", []),
        "generated_at": datetime.utcnow()
    }

    # Upsert or Insert (keep history by just inserting)
    await db.biz_ai_summaries.insert_one(doc)
    return doc

async def start_ai_summary_scheduler(db):
    """
    Background task that loops forever, running once every 24 hours.
    """
    while True:
        try:
            # Get all business organizations
            cursor = db.organizations.find({"type": "BUSINESS"})
            async for org in cursor:
                org_id = str(org["_id"])
                try:
                    await generate_and_save_executive_summary(org_id, db)
                except Exception as e:
                    print(f"[Scheduler] Failed to generate summary for {org_id}: {e}")
                
                # Small delay to prevent rate limiting
                await asyncio.sleep(2)
        except Exception as e:
            print(f"[Scheduler] Error in outer loop: {e}")
        
        # Sleep for 24 hours
        await asyncio.sleep(86400)
