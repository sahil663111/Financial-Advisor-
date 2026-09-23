# 10 — AI & Machine Learning

## 10.1 AI Architecture Overview

The platform integrates AI at three levels:

```
┌─────────────────────────────────────────────────────────────┐
│                    AI INTEGRATION LAYERS                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  LAYER 1: LLM (Google Gemini)                               │
│  ├── Individual AI Advisor (conversational)                  │
│  ├── Business Virtual CFO (function calling + chat)          │
│  ├── OCR (receipt scanning via Gemini Vision)                │
│  └── Executive Summary Scheduler (daily insights)            │
│                                                              │
│  LAYER 2: Classical ML Models                                │
│  ├── Credit Scorer (weighted formula → future: XGBoost)      │
│  ├── Anomaly Detector (Z-score → future: Isolation Forest)   │
│  └── Expense Classifier (rule-based → future: fine-tuned NLP)│
│                                                              │
│  LAYER 3: Deterministic Financial Algorithms                 │
│  ├── Tax Calculator (slab-based computation)                 │
│  ├── P&L / Balance Sheet (accounting rules)                  │
│  ├── Financial Ratios (standard formulas)                    │
│  └── Health Score (weighted composite scoring)               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Design Decision**: AI augments but never replaces deterministic calculations. Financial statements, tax computations, and accounting entries are always computed algorithmically. AI provides explanations, insights, and natural language interaction.

---

## 10.2 Business Virtual CFO (Gemini + Function Calling)

### Architecture
```
User asks: "What's our cash runway?"
       │
       ▼
┌──────────────────┐
│ Gemini API       │
│ (gemini-3.6-flash)│
│                  │──── System Prompt: "You are a professional AI Virtual CFO..."
│ Function Calling │
└──────┬───────────┘
       │ Model decides to call: get_financial_summary()
       ▼
┌──────────────────┐
│ Tool Executor    │
│ (server-side)    │──── Queries MongoDB for real financial data
│                  │──── Returns: {cash_balance: 2455208, burn_rate: 150000, runway: 16}
└──────┬───────────┘
       │ Data fed back to Gemini
       ▼
┌──────────────────┐
│ Gemini generates │
│ natural language │──── "Based on your current cash balance of ₹24.55L and
│ response         │     monthly burn rate of ₹1.5L, you have approximately
│                  │     16 months of runway. This is healthy..."
└──────────────────┘
```

### Available Tools (8 functions)

| Tool Function | Data Source | What It Returns |
|--------------|-----------|-----------------|
| `get_financial_summary` | accounts, journal entries | Revenue, expenses, profit, cash, burn rate, runway |
| `get_financial_ratios` | accounts | Current ratio, debt-to-equity, ROE, margins |
| `get_cashflow` | journal entries (categorized) | Operating/investing/financing cash flows |
| `get_profit_loss` | accounts (REVENUE + EXPENSE) | Revenue groups, expense groups, net profit |
| `get_balance_sheet` | accounts (ASSET + LIABILITY + EQUITY) | Assets, liabilities, equity, balanced check |
| `get_cashflow_forecast` | ML forecasting service | 3-month predicted cash flow |
| `get_anomalies` | anomaly detection service | Unresolved expense anomalies |
| `get_credit_risk` | credit risk service | Business credit risk assessment |

### Tool Definitions (for Gemini)
```python
TOOL_DEFINITIONS = [
    genai.protos.Tool(function_declarations=[
        genai.protos.FunctionDeclaration(
            name="get_financial_summary",
            description="High-level executive summary: revenue, expenses, profit, cash balance, burn rate, runway",
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={"org_id": genai.protos.Schema(type=genai.protos.Type.STRING)},
            ),
        ),
        # ... 7 more tool declarations
    ])
]
```

### Multi-Turn Conversation
The system supports multi-turn conversations with history:
1. Messages are stored in `biz_ai_messages` collection
2. Previous messages are loaded and sent to Gemini as context
3. Each conversation can span multiple tool calls across turns

### Streaming Response
Responses are streamed to the frontend using Server-Sent Events:
```python
async def stream_response():
    for chunk in response:
        if chunk.text:
            yield f"data: {json.dumps({'text': chunk.text})}\n\n"
```

---

## 10.3 Individual AI Advisor

Similar to the Virtual CFO but personalized for individual users:

### Available Tools
| Tool | Data Retrieved |
|------|---------------|
| `get_expense_summary` | Monthly expense breakdown by category |
| `get_income_summary` | Income sources and totals |
| `get_investment_portfolio` | Holdings, returns, allocation |
| `get_credit_score` | Credit health score and components |
| `get_financial_goals` | Goal progress and projected completion |
| `get_tax_estimate` | Tax under Old vs New regime |

### Example Interaction
```
User: "Should I switch to the new tax regime?"

AI calls: get_income_summary() → ₹15L annual
AI calls: get_tax_estimate() → Old: ₹1.8L, New: ₹1.5L

AI Response: "Based on your annual income of ₹15,00,000, the New Tax Regime
would save you ₹30,000 per year. However, if you have significant investments
in 80C (up to ₹1.5L), 80D health insurance, or home loan interest, the Old
Regime might still be better. Currently, your 80C investments are..."
```

---

## 10.4 OCR Receipt Scanning (Gemini Vision)

### How It Works
```
User uploads receipt image
       │
       ▼
┌──────────────────────────┐
│ GeminiOCRProvider        │
│ (gemini-1.5-flash)       │
│                          │
│ Prompt: "Extract:        │
│ amount, gst_amount,      │
│ date, vendor_name,       │
│ description, category    │
│ from this receipt image"  │
│                          │
│ Input: image_bytes       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Parsed JSON:             │
│ {                        │
│   "amount": 1500.50,     │
│   "gst_amount": 270.09,  │
│   "date": "2026-09-15",  │
│   "vendor_name": "Cafe",  │
│   "description": "Lunch", │
│   "category": "MEALS"    │
│ }                        │
└──────────────────────────┘
```

### Provider Pattern
```python
class OCRProvider(abc.ABC):
    @abc.abstractmethod
    async def extract_receipt_data(self, image_bytes, mime_type) -> dict:
        pass

class GeminiOCRProvider(OCRProvider):      # Production: uses Gemini Vision
    ...

class MockOCRProvider(OCRProvider):         # Development: returns mock data
    ...
```

**Why the abstract base class?**
Allows swapping OCR providers without changing the calling code. Could switch to Tesseract, AWS Textract, or Azure Form Recognizer.

---

## 10.5 ML Models

### Credit Scorer (`ml/credit_model/scorer.py`)
- **Algorithm**: Weighted formula (v1), designed for upgrade to Gradient Boosting
- **Score Range**: 300–900 (mirrors CIBIL for familiarity)
- **5 Components**: Repayment (35%), Utilization (30%), DTI (20%), Mix (10%), Consistency (5%)
- **Output**: Score, risk category, component breakdown, improvement suggestions, 6-month trajectory

### Anomaly Detector (`ml/expense_anomaly/detector.py`)
- **Algorithm**: Z-score (σ = 2.5 threshold)
- **Input**: Expense amount, category, historical average, historical standard deviation
- **Output**: is_anomaly, z_score, severity (MEDIUM/HIGH), explanation
- **Designed for**: Upgrade to Isolation Forest or LSTM for time-series anomaly detection

### Expense Classifier (`ml/expense_classifier/classifier.py`)
- **Algorithm**: Rule-based keyword matching (v1)
- **10 Categories**: FOOD, TRAVEL, SHOPPING, BILLS, RENT, EMI, MEDICAL, EDUCATION, ENTERTAINMENT, INVESTMENT
- **Confidence**: 0.85 for keyword matches, 0.50 for "OTHER" fallback
- **Designed for**: Upgrade to fine-tuned text classifier (BERT/DistilBERT)

### Why "v1" Architecture?
All ML models implement a clean interface (`score()`, `detect()`, `classify()`) that returns a standardized dict. This allows:
1. **A/B testing**: Run v1 and v2 simultaneously, compare results
2. **Hot-swapping**: Replace the model class without changing router/service code
3. **Model versioning**: Every response includes `model_version` for auditability

---

## 10.6 Executive Summary Scheduler

A background task runs every 24 hours:

```python
async def start_ai_summary_scheduler(db):
    while True:
        for org in all_business_orgs:
            # 1. Fetch financial data
            summary = await get_financial_summary(org_id)
            ratios = await get_financial_ratios(org_id)

            # 2. Send to Gemini for analysis
            response = gemini.generate_content(f"Analyze this data: {summary}")

            # 3. Parse into structured insights
            parsed = json.loads(response.text)
            # {"insights": [...], "risks": [...], "recommended_actions": [...]}

            # 4. Save to database
            await db.biz_ai_summaries.insert_one({
                "org_id": org_id,
                "key_insights": parsed["insights"],
                "risks": parsed["risks"],
                "recommended_actions": parsed["recommended_actions"],
                "generated_at": datetime.utcnow()
            })

        await asyncio.sleep(86400)  # 24 hours
```

**Why pre-compute?**
Dashboard loads are sub-second because insights are pre-generated. Without this, every dashboard visit would trigger multiple API calls + LLM generation (5-10 seconds).
