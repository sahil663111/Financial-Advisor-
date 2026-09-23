from app.business.ocr.provider import OCRProvider, GeminiOCRProvider, MockOCRProvider
from app.config import settings

def get_ocr_provider() -> OCRProvider:
    if settings.LLM_API_KEY:
        return GeminiOCRProvider()
    return MockOCRProvider()

async def process_receipt_image(image_bytes: bytes, mime_type: str) -> dict:
    """
    Passes the receipt image to the configured OCR provider and returns structured data.
    """
    provider = get_ocr_provider()
    return await provider.extract_receipt_data(image_bytes, mime_type)
