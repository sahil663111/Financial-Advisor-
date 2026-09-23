# 02 — Backend Deep Dive

## 2.1 Application Entry Point (`main.py`)

The backend is a **FastAPI** application initialized in `app/main.py`. Key aspects:

### Lifespan Events
FastAPI uses an async context manager for startup/shutdown:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongodb()          # Connect to Atlas or fallback to mock
    scheduler_task = asyncio.create_task(start_ai_summary_scheduler(db))
    yield
    scheduler_task.cancel()
    await close_mongodb_connection()
```

**Why this pattern?**
- **Startup**: Establishes the MongoDB connection pool and starts the background AI summary scheduler (generates daily executive summaries for all business orgs).
- **Shutdown**: Cancels the scheduler and cleanly closes the database connection.
- Using `asynccontextmanager` (not `on_event`) because it's the modern FastAPI pattern that properly handles resource cleanup.

### Middleware Stack
```
Request → CORS → Rate Limiter → Route Handler → Response
```

1. **CORS** (`CORSMiddleware`): Allows `http://localhost:3000` (dev) and `*.vercel.app` (production). Credentials are allowed because JWTs are sent via cookies.
2. **Rate Limiter** (`SlowAPI`): 200 requests per minute per IP. Prevents abuse of financial APIs.

### Router Registration
All routers are registered under `/api/v1`:
```python
API_V1 = "/api/v1"
app.include_router(auth_router, prefix=API_V1)
app.include_router(business_router, prefix=API_V1)
# ... 10+ individual routers
```

**Why separate `/individual` and `/business` prefixes?**
Individual routes are user-scoped (identified by JWT user_id). Business routes are org-scoped (identified by `org_id` path parameter + RBAC verification).

---

## 2.2 Configuration (`config.py`)

Uses **Pydantic Settings** for type-safe environment variable management:

```python
class Settings(BaseSettings):
    MONGODB_URI: str                           # Required
    JWT_SECRET: str                            # Required
    JWT_ALGORITHM: str = "HS256"               # Default
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15      # Short-lived
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7         # Long-lived
    LLM_API_KEY: str = ""                      # Gemini API key
    LLM_MODEL: str = "gemini-3.6-flash"        # Model selection
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
```

**Why Pydantic Settings?**
- Automatically reads from `.env` file
- Validates types at startup (fails fast if `JWT_SECRET` is missing)
- Provides IDE autocomplete via `settings.MONGODB_URI`
- Separates config from code (12-factor app principle)

---

## 2.3 Database Layer (`database.py`)

### Connection Strategy
```python
async def connect_to_mongodb():
    try:
        client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB_NAME]
        await client.admin.command('ping')  # Verify connectivity
    except Exception:
        # Fallback to in-memory mock for local development
        client = AsyncMongoMockClient()
        db = client[settings.MONGODB_DB_NAME]
```

**Why the fallback?**
During demos and development, you might not have MongoDB Atlas credentials configured. The `mongomock-motor` library provides a fully functional in-memory MongoDB that supports the same API. This means the app **always starts**, even without a database connection.

### Indexing Strategy
The `create_indexes()` function creates **40+ indexes** covering every collection. This is critical for financial applications where query performance directly impacts user experience.

Key indexing patterns:
| Pattern | Example | Why |
|---------|---------|-----|
| **Unique** | `(org_id, code)` on `accounts` | Prevents duplicate account codes within an org |
| **Compound sort** | `(org_id, date: -1)` on `journal_entries` | Fast date-ordered queries scoped to an org |
| **Sparse** | `gstin` on `organizations` | Not all orgs have GSTIN; sparse index skips nulls |
| **Text search** | `(org_id, name)` on `biz_customers` | Customer search within an organization |

### Demo User Seeding
In development mode, a demo user is automatically created:
- Email: `demo@financialos.in`
- Password: `Demo@1234`
- Profile: Moderate risk, INR currency

---

## 2.4 Service Layer Pattern

Every module follows the same pattern:
```
router.py → service.py → database (MongoDB)
     ↑            ↑
  schemas.py   utils/exceptions.py
```

- **`router.py`**: Defines FastAPI endpoints, handles HTTP concerns (status codes, query params)
- **`service.py`**: Contains business logic, operates on database directly
- **`schemas.py`**: Pydantic models for request validation and response serialization
- **`exceptions.py`**: Standardized error responses (`not_found()`, `bad_request()`, `forbidden()`)

**Why this separation?**
1. Routers are thin — they only handle HTTP I/O
2. Services are testable without HTTP
3. Schemas enforce contracts between frontend and backend
4. Exception helpers ensure consistent error format across 120+ endpoints

---

## 2.5 Utility Modules

### `utils/security.py`
```python
def hash_password(password: str) -> str:
    return bcrypt_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({**data, "exp": expire, "type": "access"}, settings.JWT_SECRET)
```

**Why bcrypt?** It uses a computationally expensive hashing algorithm (with salt), making brute-force attacks on stolen password hashes impractical. The `work factor` is automatically tuned.

### `utils/exceptions.py`
```python
def not_found(entity: str = "Resource"):
    raise HTTPException(status_code=404, detail=f"{entity} not found")

def bad_request(message: str):
    raise HTTPException(status_code=400, detail=message)

def forbidden():
    raise HTTPException(status_code=403, detail="Access denied")
```

**Why helper functions?** Ensures every 404 across 120+ endpoints uses the same format, making frontend error handling consistent.

---

## 2.6 Background Tasks

### AI Summary Scheduler
A background `asyncio` task runs every 24 hours:
1. Iterates over all business organizations
2. Calls `tool_get_financial_summary()` and `tool_get_financial_ratios()` for each
3. Sends the data to Gemini to generate executive insights
4. Saves the summary to `biz_ai_summaries` collection

**Why a scheduler instead of on-demand?**
Executive summaries aggregate data from multiple collections (accounts, journal entries, invoices). Computing them on every dashboard load would be expensive. Pre-computing ensures sub-second dashboard rendering.

---

## 2.7 Error Handling Strategy

```
Frontend Request
       ↓
  FastAPI Route
       ↓ (try/except)
  Service Layer
       ↓ (raises HTTPException)
  FastAPI Error Handler
       ↓
  JSON Response: {"detail": "Account '9999' not found"}
       ↓
  Frontend catches error, shows toast notification
```

All errors follow the pattern:
```json
{
  "detail": "Human-readable error message"
}
```

The frontend API client intercepts all non-2xx responses and surfaces them to the user.
