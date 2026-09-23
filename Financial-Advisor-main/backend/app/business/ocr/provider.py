import abc
import json
import google.generativeai as genai

from app.config import settings

class OCRProvider(abc.ABC):
    @abc.abstractmethod
    async def extract_receipt_data(self, image_bytes: bytes, mime_type: str) -> dict:
        """Extract structured data from a receipt image."""
        pass

class MockOCRProvider(OCRProvider):
    async def extract_receipt_data(self, image_bytes: bytes, mime_type: str) -> dict:
        return {
            "amount": 1500.50,
            "gst_amount": 270.09,
            "date": "2024-06-15",
            "vendor_name": "Demo Vendor",
            "description": "Mocked OCR extraction",
            "category": "OFFICE_EXPENSES"
        }

class GeminiOCRProvider(OCRProvider):
    def __init__(self):
        genai.configure(api_key=settings.LLM_API_KEY)
        self.model = genai.GenerativeModel("gemini-1.5-flash")

    async def extract_receipt_data(self, image_bytes: bytes, mime_type: str) -> dict:
        prompt = (
            "You are an expert OCR AI. Extract the following fields from the attached receipt image: "
            "amount (total numerical amount), gst_amount (tax amount, if any, or 0.0), "
            "date (YYYY-MM-DD format), vendor_name, description (what the receipt is for), "
            "category (choose ONE from: OFFICE_EXPENSES, SOFTWARE_SUBSCRIPTIONS, TRAVEL, MEALS, EQUIPMENT, UTILITIES, LEGAL_PROFESSIONAL, MARKETING, OTHER). "
            "Respond ONLY with a valid JSON object matching these keys: "
            '{"amount": float, "gst_amount": float, "date": "string", "vendor_name": "string", "description": "string", "category": "string"}'
        )
        
        image_part = {
            "mime_type": mime_type,
            "data": image_bytes
        }
        
        try:
            response = await self.model.generate_content_async([image_part, prompt])
            text = response.text.strip()
            
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
                
            return json.loads(text.strip())
        except Exception as e:
            print(f"OCR Error: {e}")
            return {
                "amount": 0.0,
                "gst_amount": 0.0,
                "date": "",
                "vendor_name": "",
                "description": f"Failed to extract: {str(e)}",
                "category": "OTHER"
            }
