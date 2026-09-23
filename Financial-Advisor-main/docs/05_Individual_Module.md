# 05 — Individual Module

## 5.1 Overview

The Individual module serves **personal finance management** for individual users. It provides a complete financial picture through 12 sub-modules, each accessible via the sidebar navigation.

```
individual/
├── dashboard/       # Aggregated financial overview
├── income/          # Income tracking (salary, freelance, etc.)
├── expenses/        # Expense tracking with ML classification
│   └── analytics/   # Expense analytics & trends
├── investments/     # Portfolio management
│   ├── portfolio/   # Holdings tracker
│   └── performance/ # Return analysis
├── goals/           # Financial goal planning
├── credit/          # Credit health score (ML-based)
├── tax/             # Tax calculator (Old vs New regime)
├── retirement/      # Retirement planning (SWP, corpus)
├── financial_health/# Composite health score
├── ai/              # AI Financial Advisor (Gemini)
│   └── tools/       # Function calling tools
└── recommendations/ # AI-generated actionable tips
```

---

## 5.2 Dashboard (`individual/dashboard/router.py`)

The personal dashboard aggregates data from all sub-modules into a single view:

### KPIs Displayed
| Metric | Source | Calculation |
|--------|--------|-------------|
| Total Income (MTD) | `income` collection | Sum where `date >= first of month` |
| Total Expenses (MTD) | `expenses` collection | Sum where `date >= first of month` |
| Net Savings | Computed | `income - expenses` |
| Savings Rate | Computed | `(income - expenses) / income * 100` |
| Investment Value | `investments` collection | Sum of `current_value` |
| Credit Score | `credit_profiles` collection | Latest computed score |

### Trend Charts
- **Income vs Expenses**: Last 6 months bar chart
- **Expense Breakdown**: Pie chart by category (Food, Travel, Shopping, etc.)
- **Savings Trend**: Line chart showing monthly savings rate

---

## 5.3 Income Management

Tracks all income sources with categorization:

### Categories
`SALARY`, `FREELANCE`, `BUSINESS`, `INVESTMENT`, `RENTAL`, `INTEREST`, `DIVIDEND`, `GIFT`, `OTHER`

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/income` | List income entries with pagination & date filters |
| POST | `/income` | Add new income entry |
| PUT | `/income/{id}` | Update an income entry |
| DELETE | `/income/{id}` | Delete an income entry |
| GET | `/income/summary` | Monthly summary with category breakdown |

---

## 5.4 Expense Tracking with ML Classification

### Auto-Classification
When a user adds an expense, the **ML Expense Classifier** (`ml/expense_classifier/classifier.py`) automatically suggests a category:

```python
class ExpenseClassifier:
    """Rule-based v1 — designed for upgrade to trained text classifier in v2."""

    def classify(self, text: str) -> dict:
        # Matches keywords like "swiggy" → FOOD, "uber" → TRAVEL
        for keywords, category in RULES:
            for kw in keywords:
                if kw in text_lower:
                    return {"category": category, "confidence": 0.85}
        return {"category": "OTHER", "confidence": 0.5}
```

**10 categories**: FOOD, TRAVEL, SHOPPING, BILLS, RENT, EMI, MEDICAL, EDUCATION, ENTERTAINMENT, INVESTMENT

**Why rule-based v1?**
- Works immediately without training data
- 85% confidence for matched keywords
- Architecture is designed so a trained ML model (e.g., fine-tuned BERT) can replace it by implementing the same `classify()` interface

### Anomaly Detection
The **Anomaly Detector** (`ml/expense_anomaly/detector.py`) uses Z-score analysis:

```python
class AnomalyDetector:
    threshold_sigma = 2.5  # Flag expenses > 2.5 standard deviations from mean

    def detect(self, amount, category, historical_avg, historical_std, sample_count):
        z_score = (amount - historical_avg) / std
        if z_score > self.threshold_sigma:
            return {"is_anomaly": True, "severity": "HIGH" if z_score > 4.0 else "MEDIUM"}
```

Example: If average FOOD expense is ₹5,000 and a ₹25,000 food expense is logged, it's flagged as anomalous.

---

## 5.5 Investment Portfolio

### Supported Asset Types
`STOCKS`, `MUTUAL_FUNDS`, `FIXED_DEPOSITS`, `GOLD`, `PPF`, `NPS`, `EPF`, `BONDS`, `CRYPTO`, `REAL_ESTATE`

### Features
- **Holdings Tracker**: Buy price, quantity, current value (fetched via yfinance)
- **Returns Calculation**: Absolute return, CAGR, XIRR
- **Allocation Analysis**: Pie chart showing asset distribution
- **India-focused**: Supports NSE/BSE stock symbols, Indian MF schemes

---

## 5.6 Credit Health Score

The **Credit Scorer** (`ml/credit_model/scorer.py`) provides an estimated credit health score (300–900 range, mirroring CIBIL):

### Scoring Components (5 factors)
| Factor | Weight | Methodology |
|--------|--------|-------------|
| Repayment History | 35% | `repayment_history_pct / 100 * 35` |
| Credit Utilization | 30% | Lower is better: `(1 - utilization/100) * 30` |
| Debt-to-Income | 20% | Ideal < 50% DTI |
| Credit Mix | 10% | More accounts = better diversification |
| Payment Consistency | 5% | Missed payments penalty |

### Risk Categories
| Score Range | Category | Color |
|-------------|----------|-------|
| 750–900 | LOW risk | 🟢 Green |
| 650–749 | MEDIUM risk | 🟡 Yellow |
| 300–649 | HIGH risk | 🔴 Red |

### Trajectory Prediction
The scorer predicts where the score will be in 6 months based on current trends:
```python
if repayment_pct >= 95 and utilization < 30:
    trajectory = "IMPROVING"
elif repayment_pct < 80 or utilization > 70:
    trajectory = "DECLINING"
else:
    trajectory = "STABLE"
```

---

## 5.7 Tax Calculator (India FY 2024-25)

### Dual-Regime Comparison
The tax engine (`individual/tax/engine/fy_2024_25.py`) calculates tax under **both** Old and New regimes and recommends the better option:

### New Regime Slabs (FY 2024-25)
| Income Range | Rate |
|-------------|------|
| Up to ₹3,00,000 | Nil |
| ₹3,00,001 – ₹7,00,000 | 5% |
| ₹7,00,001 – ₹10,00,000 | 10% |
| ₹10,00,001 – ₹12,00,000 | 15% |
| ₹12,00,001 – ₹15,00,000 | 20% |
| Above ₹15,00,000 | 30% |

Standard Deduction: ₹75,000 (New regime, FY 2024-25)

### Old Regime Slabs
| Income Range | Rate |
|-------------|------|
| Up to ₹2,50,000 | Nil |
| ₹2,50,001 – ₹5,00,000 | 5% |
| ₹5,00,001 – ₹10,00,000 | 20% |
| Above ₹10,00,000 | 30% |

Standard Deduction: ₹50,000 + 80C (up to ₹1.5L) + 80D + HRA + Section 24(b)

### Additional Calculations
- **Surcharge**: Applied on income above ₹50L
- **Health & Education Cess**: 4% on total tax
- **Capital Gains**: STCG @ 20%, LTCG @ 12.5% (above ₹1L exemption)
- **Smart Suggestions**: "You can save ₹X by investing ₹Y more in 80C"

---

## 5.8 Retirement Planning

### Monte Carlo Simulation Approach
The retirement planner calculates:
1. **Required Corpus**: How much you need at retirement
2. **SIP Required**: Monthly investment needed to reach corpus
3. **SWP Strategy**: Systematic Withdrawal Plan post-retirement

### Key Parameters
- Current age, retirement age, life expectancy
- Monthly expenses (inflated at 6% annually)
- Expected return on investments
- Existing retirement savings (EPF, PPF, NPS)

---

## 5.9 AI Financial Advisor

The Individual AI Advisor uses **Gemini with function calling** to provide personalized financial advice:

### Available Tools
| Tool | What It Does |
|------|-------------|
| `get_expense_summary` | Fetches monthly expense breakdown |
| `get_income_summary` | Fetches income sources and totals |
| `get_investment_portfolio` | Current holdings and returns |
| `get_credit_score` | Latest credit health score |
| `get_financial_goals` | Goal progress and timelines |
| `get_tax_estimate` | Tax liability under both regimes |

### How It Works
```
User: "Am I saving enough for retirement?"
  → Gemini calls get_income_summary() + get_expense_summary() + get_investment_portfolio()
  → Gemini receives real data: income ₹1.2L, expenses ₹80K, investments ₹15L
  → Gemini generates personalized analysis with actual numbers
```
