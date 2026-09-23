# 04 — Authentication & Security

## 4.1 Authentication Architecture

```
┌─────────────┐     POST /auth/login      ┌──────────────┐
│   Browser    │ ──────────────────────────►│   FastAPI     │
│  (React)     │                            │   Auth Router │
│              │◄──────────────────────────│               │
│              │  Set-Cookie: access_token  │   Validates   │
│              │  Set-Cookie: refresh_token │   password    │
└──────────────┘                            └───────┬──────┘
       │                                            │
       │  GET /api/v1/individual/dashboard          │
       │  Cookie: access_token=eyJ...               │
       ▼                                            ▼
┌──────────────┐                            ┌──────────────┐
│   FastAPI     │      Depends()            │   MongoDB     │
│   get_current │ ──────────────────────────►│   users       │
│   _user()     │      find_one(user_id)    │   collection  │
└──────────────┘                            └──────────────┘
```

### Registration Flow
1. User submits email + password + full_name + account_type
2. Backend validates with Pydantic schema (`RegisterRequest`)
3. Password is hashed with **bcrypt** (work factor auto-tuned)
4. User document inserted into `users` collection
5. Profile document created in `profiles` collection
6. JWT access + refresh tokens generated
7. Tokens set as HTTP-only cookies in the response
8. Frontend receives user object, sets AuthContext state

### Login Flow
1. User submits email + password
2. Backend looks up user by email
3. Compares password against stored bcrypt hash using `passlib`
4. If match → generate new JWT pair, set cookies
5. If mismatch → return 400 "Invalid email or password"

### Token Refresh Flow
1. Access token expires (15 minutes)
2. Frontend gets 401 on next request
3. Frontend calls `POST /auth/refresh`
4. Backend reads `refresh_token` cookie, validates it
5. If valid → issues new `access_token` cookie
6. If invalid → user must re-login

---

## 4.2 JWT Token Structure

### Access Token (15 min TTL)
```json
{
  "sub": "6ab38508a7ce8a53919d3e55",   // user_id (MongoDB ObjectId)
  "type": "access",
  "exp": 1727100000                     // expiration timestamp
}
```

### Refresh Token (7 day TTL)
```json
{
  "sub": "6ab38508a7ce8a53919d3e55",
  "type": "refresh",
  "exp": 1727700000
}
```

**Why separate token types?**
- Access tokens are short-lived to limit damage if intercepted
- Refresh tokens are long-lived for user convenience (stay logged in)
- The `type` field prevents using a refresh token as an access token

---

## 4.3 Cookie Security Configuration

```python
COOKIE_SETTINGS = {
    "httponly": True,                                           # JS cannot read
    "samesite": "none" if PRODUCTION else "lax",                # CSRF protection
    "secure": PRODUCTION,                                       # HTTPS only in prod
}
```

| Setting | Development | Production | Why |
|---------|------------|------------|-----|
| `httponly` | `True` | `True` | Prevents XSS from stealing tokens via `document.cookie` |
| `samesite` | `lax` | `none` | `lax` blocks cross-site POST. `none` needed for cross-origin in production (API on different domain) |
| `secure` | `False` | `True` | `secure` cookies only sent over HTTPS |

---

## 4.4 Role-Based Access Control (RBAC)

### Role Hierarchy
```
OWNER (full control)
  └── ADMIN (manage users + all operations)
       └── ACCOUNTANT (financial operations)
            └── VIEWER (read-only access)
```

### Permission Matrix

| Permission | OWNER | ADMIN | ACCOUNTANT | VIEWER |
|-----------|-------|-------|------------|--------|
| `view` | ✅ | ✅ | ✅ | ✅ |
| `create` | ✅ | ✅ | ✅ | ❌ |
| `edit` | ✅ | ✅ | ✅ | ❌ |
| `delete` | ✅ | ✅ | ❌ | ❌ |
| `void_journal` | ✅ | ✅ | ✅ | ❌ |
| `view_statements` | ✅ | ✅ | ✅ | ✅ |
| `export` | ✅ | ✅ | ✅ | ❌ |
| `manage_users` | ✅ | ✅ | ❌ | ❌ |
| `manage_payroll` | ✅ | ✅ | ❌ | ❌ |
| `manage_taxes` | ✅ | ✅ | ✅ | ❌ |
| `manage_settings` | ✅ | ✅ | ❌ | ❌ |

### Implementation: Dependency Injection

```python
# Any org member can access
@router.get("/organizations/{org_id}/dashboard")
async def dashboard(ctx: OrgContext = Depends(require_org_member)):
    ...

# Only users with "view_statements" permission
@router.get("/organizations/{org_id}/reports/profit-loss")
async def pnl(ctx: OrgContext = Depends(require_permission("view_statements"))):
    ...

# Only OWNER or ADMIN roles
@router.delete("/organizations/{org_id}/members/{member_id}")
async def remove_member(ctx: OrgContext = Depends(require_roles("OWNER", "ADMIN"))):
    ...
```

### OrgContext Object
Every business route receives a resolved `OrgContext`:
```python
@dataclass
class OrgContext:
    org: dict           # Full organization document
    member: dict        # User's membership record
    user: dict          # User document
    org_id: str         # Convenience: organization ID
    user_id: str        # Convenience: user ID
    role: str           # User's role in this org
    permissions: set    # Set of permission strings
```

**Why dependency injection for RBAC?**
1. Eliminates boilerplate: routes don't need to manually check permissions
2. Centralized authorization logic: changes propagate to all routes automatically
3. FastAPI caches resolved dependencies within a request, preventing duplicate DB queries
4. Type-safe: `ctx.org_id` is always available, never None

---

## 4.5 Security Hardening

### Rate Limiting
```python
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
```
- 200 requests per minute per IP address
- Protects against brute-force login attempts
- Prevents API abuse by automated scrapers

### CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],        # Dev frontend
    allow_origin_regex=r"https://.*\.vercel\.app",  # Production frontends
    allow_credentials=True,                         # Required for cookies
    allow_methods=["*"],
    allow_headers=["*", "X-Access-Token"],
)
```

### Input Validation
Every API endpoint validates input with Pydantic:
```python
class CreateJournalEntryRequest(BaseModel):
    date: datetime                              # Must be valid datetime
    description: str = Field(min_length=1)      # Cannot be empty
    lines: list[JournalLine] = Field(min_length=2)  # At least 2 lines
    reference: Optional[str] = None
```

If validation fails, FastAPI automatically returns a 422 with detailed error:
```json
{
  "detail": [
    {
      "loc": ["body", "description"],
      "msg": "ensure this value has at least 1 characters",
      "type": "value_error"
    }
  ]
}
```

---

## 4.6 Audit Trail

Every financial mutation is logged to the `audit_logs` collection:
```python
await log_action(
    db,
    org_id=org_id,
    user_id=user_id,
    action=AuditAction.CREATE_JOURNAL,
    entity_type="journal_entry",
    entity_id=entry_id,
    previous_value=None,
    new_value={"entry_number": "JE-0001", "total": 50000},
    request=request,  # Captures IP address
)
```

Audit logs are **append-only** — they can never be modified or deleted. This is a regulatory requirement for financial applications.
