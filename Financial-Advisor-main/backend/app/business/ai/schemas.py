from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class Conversation(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime

class Message(BaseModel):
    id: str
    role: str  # 'user' or 'model'
    content: str
    created_at: datetime

class SendMessageRequest(BaseModel):
    message: str

class ExecutiveSummary(BaseModel):
    revenue: float
    expenses: float
    net_profit: float
    cash_balance: float
    runway_months: float
    key_insights: List[str]
    risks: List[str]
    recommended_actions: List[str]
    generated_at: datetime
