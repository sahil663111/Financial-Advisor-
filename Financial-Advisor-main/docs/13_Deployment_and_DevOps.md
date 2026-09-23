# 13 — Deployment & DevOps

## 13.1 Local Development Setup

### Prerequisites
- Python 3.12+
- Node.js 20+
- MongoDB Atlas account (or use in-memory mock)

### Backend Setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials:
#   MONGODB_URI=mongodb+srv://...
#   JWT_SECRET=your-secret-key
#   LLM_API_KEY=your-gemini-api-key

# Start server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev                   # Starts on http://localhost:3000
```

### Startup Script (`start.ps1`)
A convenience script to start both services:
```powershell
# start.ps1 - Starts backend and frontend together
Start-Process powershell -ArgumentList "cd backend; .venv\Scripts\activate; uvicorn app.main:app --reload"
Start-Process powershell -ArgumentList "cd frontend; npm run dev"
```

---

## 13.2 Environment Variables

### Backend (`.env`)
```env
# Database
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxx.mongodb.net/?appName=Cluster0
MONGODB_DB_NAME=Financial_Advisor

# Security
JWT_SECRET=your-super-secret-key-change-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# AI
LLM_API_KEY=AIzaSy...                  # Google Gemini API key
LLM_MODEL=gemini-3.6-flash             # Model selection

# App
ALLOWED_ORIGINS=http://localhost:3000
ENVIRONMENT=development                 # "development" or "production"
```

### Frontend
```env
NEXT_PUBLIC_API_URL=http://localhost:8000   # Backend URL
```

---

## 13.3 Docker Deployment

### Architecture
```
docker-compose.yml
├── mongodb (mongo:6.0)           Port 27017
├── backend (python:3.12-slim)    Port 8000
└── frontend (node:20-alpine)     Port 3000
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6.0
    container_name: financial_advisor_mongo
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db          # Persistent storage
    environment:
      - MONGO_INITDB_DATABASE=Financial_Advisor
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: financial_advisor_backend
    ports:
      - "8000:8000"
    environment:
      - MONGODB_URI=${MONGODB_URI}     # From .env or cloud Atlas
      - LLM_API_KEY=${LLM_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - mongodb
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: financial_advisor_frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  mongo_data:                          # Named volume for data persistence
```

### Backend Dockerfile
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontend Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Deployment Commands
```bash
# Build and start all services
docker-compose up --build -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop all services
docker-compose down

# Stop and remove data
docker-compose down -v    # WARNING: Deletes MongoDB data
```

---

## 13.4 Database Seeding

### Demo Data Script (`scripts/seed_business_demo.py`)
Populates the database with realistic demo data:

```python
async def seed_demo_data():
    # 1. Find existing business organization
    org = await db.organizations.find_one({"type": "BUSINESS"})

    # 2. Create Chart of Accounts (9 accounts)
    await db.accounts.insert_many([
        {"code": "1000", "name": "HDFC Checking", "type": "ASSET", ...},
        {"code": "4000", "name": "Software Subscriptions", "type": "REVENUE", ...},
        # ... 7 more accounts
    ])

    # 3. Generate 2 years of daily journal entries (730+ days)
    for i in range(730):
        # Revenue entry (with growth + seasonality)
        entries.append({
            "date": date,
            "description": "Daily Subscription Revenue",
            "status": "POSTED",
            "lines": [
                {"account_code": "1000", "debit": amount},
                {"account_code": "4000", "credit": amount},
            ]
        })
        # Expense entry (randomized across categories)
        entries.append({...})

    # 4. Insert all entries (1,400+ documents)
    await db.journal_entries.insert_many(entries)

    # 5. Create budgets for tracking
    await db.biz_budgets.insert_many([...])
```

### Balance Fix Script (`scripts/fix_balances.py`)
Recalculates all account balances from journal entries:
```python
# Used after bulk-seeding to ensure current_balance matches journal history
for account in accounts:
    balance = opening_balance
    for journal_entry in all_posted_entries:
        for line in entry.lines:
            if line.account_code == account.code:
                balance += _balance_delta(account_type, debit, credit)
    update account.current_balance = balance
```

---

## 13.5 Production Considerations

### Security Checklist
- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Set `ENVIRONMENT=production` (disables Swagger docs)
- [ ] Use HTTPS (TLS termination at load balancer)
- [ ] Set `ALLOWED_ORIGINS` to production domain only
- [ ] Enable MongoDB Atlas authentication + IP whitelist
- [ ] Use environment variables (never commit `.env` files)

### Performance Checklist
- [ ] MongoDB Atlas M10+ tier for production workloads
- [ ] Enable connection pooling (Motor handles this automatically)
- [ ] Run behind a reverse proxy (Nginx/Caddy) for static files
- [ ] Enable gzip compression
- [ ] Set up monitoring (MongoDB Atlas has built-in metrics)

### Scaling Options
```
                    Load Balancer (Nginx/ALB)
                    ┌────────┬────────┐
                    ▼        ▼        ▼
               Backend 1  Backend 2  Backend 3    (horizontal scaling)
                    │        │        │
                    └────────┴────────┘
                           │
                    MongoDB Atlas
                    (auto-scaling)
```

The application is **stateless** (JWT auth, no server-side sessions), so it scales horizontally by adding more backend instances behind a load balancer.
