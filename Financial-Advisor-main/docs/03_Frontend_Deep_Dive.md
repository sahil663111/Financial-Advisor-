# 03 — Frontend Deep Dive

## 3.1 Framework & Rendering Strategy

### Next.js 16 with App Router
The frontend uses **Next.js 16.3.4** with the App Router (introduced in Next.js 13). This provides:

- **File-system routing**: Each `page.tsx` file in `src/app/` automatically becomes a route
- **Layouts**: Shared UI shells (`layout.tsx`) wrap child pages without re-rendering
- **Server Components** (default) and **Client Components** (`'use client'` directive)

**Why `'use client'` on all pages?**
Financial dashboards are highly interactive (real-time charts, form inputs, modal dialogs, filters). All pages use the `'use client'` directive because they need:
- `useState` for form state and data
- `useEffect` for API calls on mount
- Browser-only APIs (localStorage, cookies, window)

### Styling: TailwindCSS v4
TailwindCSS v4 is used with a custom dark theme:
- **Dark mode by default**: `bg-slate-950` backgrounds, `text-slate-200` text
- **Glassmorphism effects**: Semi-transparent cards with blur backdrops
- **Custom component classes**: `.card`, `.btn-primary`, `.input`, `.skeleton` defined in global CSS
- **Color palette**: Indigo (primary), Emerald (success/positive), Red (danger/negative), Amber (warning)

---

## 3.2 Project Structure

```
frontend/src/
├── app/
│   ├── layout.tsx                 # Root layout (HTML, fonts, AuthProvider)
│   ├── page.tsx                   # Landing page (redirects to dashboard or login)
│   ├── login/
│   │   └── page.tsx               # Login/Register page
│   ├── individual/
│   │   ├── layout.tsx             # Individual sidebar layout
│   │   ├── dashboard/page.tsx     # Personal finance dashboard
│   │   ├── expenses/
│   │   │   ├── page.tsx           # Expense tracker
│   │   │   └── analytics/page.tsx # Expense analytics
│   │   ├── income/page.tsx        # Income management
│   │   ├── investments/
│   │   │   ├── portfolio/page.tsx # Portfolio tracker
│   │   │   └── performance/page.tsx
│   │   ├── goals/page.tsx         # Financial goals
│   │   ├── credit/page.tsx        # Credit health score
│   │   ├── tax/page.tsx           # Tax calculator (Old vs New regime)
│   │   ├── retirement/page.tsx    # Retirement planner
│   │   ├── financial-health/page.tsx
│   │   └── ai-advisor/page.tsx    # AI chat advisor
│   └── business/
│       ├── layout.tsx             # Business sidebar layout (25+ nav items)
│       ├── dashboard/page.tsx     # Business dashboard
│       ├── profile/page.tsx       # Company profile & settings
│       ├── settings/page.tsx      # Org settings, members, RBAC
│       ├── accounting/
│       │   ├── page.tsx           # Chart of Accounts
│       │   ├── journal/page.tsx   # Journal Entries
│       │   ├── ledger/page.tsx    # General Ledger
│       │   └── trial-balance/page.tsx
│       ├── customers/page.tsx     # Customer management
│       ├── vendors/page.tsx       # Vendor management
│       ├── invoices/page.tsx      # Sales invoicing
│       ├── receivables/page.tsx   # Accounts receivable aging
│       ├── payables/page.tsx      # Accounts payable / bills
│       ├── expenses/page.tsx      # Business expenses + OCR
│       ├── employees/page.tsx     # HR: employee directory
│       ├── payroll/page.tsx       # Payroll runs
│       ├── gst/page.tsx           # GST dashboard
│       ├── tax/page.tsx           # Tax management (GST+TDS)
│       ├── reports/page.tsx       # P&L, Balance Sheet, Ratios
│       ├── cashflow/page.tsx      # Cash flow statement
│       ├── health/page.tsx        # Financial health score
│       ├── budgets/page.tsx       # Budget tracking
│       ├── intelligence/page.tsx  # ML forecasting & anomaly detection
│       ├── credit/page.tsx        # Business credit risk
│       └── ai-cfo/page.tsx        # AI Virtual CFO chat
├── contexts/
│   └── AuthContext.tsx            # Authentication state management
├── lib/
│   ├── api.ts                     # Centralized API client (120+ functions)
│   └── utils.ts                   # formatINR(), formatDate() helpers
└── types/
    └── index.ts                   # TypeScript interfaces
```

---

## 3.3 Authentication Flow

### AuthContext Provider
The `AuthContext.tsx` wraps the entire application and manages user state:

```typescript
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On app load, check if the user is already logged in
    auth.me()
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // login, register, logout functions...
}
```

**How it works:**
1. On first load, `auth.me()` sends a GET request to `/api/v1/auth/me`
2. The browser automatically includes the `access_token` HTTP-only cookie
3. If valid → user state is set, app renders dashboard
4. If expired → frontend gets 401, redirects to login

### Cookie-Based JWT Strategy
```
Login → Server sets HTTP-only cookies:
  - access_token (15 min TTL, httpOnly, sameSite=lax)
  - refresh_token (7 day TTL, httpOnly, sameSite=lax)
```

**Why cookies instead of localStorage?**
- HTTP-only cookies cannot be read by JavaScript, preventing XSS attacks from stealing tokens
- Automatically sent with every request (no need for manual `Authorization` header)
- `sameSite=lax` prevents CSRF on state-changing requests from other domains

---

## 3.4 API Client (`lib/api.ts`)

The centralized API module contains **120+ functions** organized by domain:

```typescript
// Base request function with error handling
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',  // Always send cookies
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Request failed');
  }
  return res.json();
}

// Organized by module
export const auth = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: ... }),
  register: (...) => ...,
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

export const businessOrg = {
  listOrganizations: () => request('/business/organizations'),
  getAccounts: (orgId) => request(`/business/organizations/${orgId}/accounts`),
  // ... 30+ functions
};

export const businessAccounting = {
  createJournalEntry: (orgId, data) => request(`/...`, { method: 'POST', body: ... }),
  getLedger: (orgId, accountCode, params) => ...,
  getTrialBalance: (orgId) => ...,
};

export const businessFinance = {
  getProfitLoss: (orgId) => ...,
  getBalanceSheet: (orgId) => ...,
  exportPnL: (orgId, format) => ...,  // Returns Blob for file download
};
```

**Why a centralized API module?**
1. Single source of truth for all API URLs
2. Consistent error handling across all requests
3. Easy to add authentication headers or retry logic
4. TypeScript generics ensure type-safe responses

---

## 3.5 Layout Architecture

### Dual-Layout System
The app has two completely different sidebar layouts:

**Individual Layout** (`individual/layout.tsx`):
- Simpler navigation: Dashboard, Expenses, Income, Investments, Goals, Tax, Credit, Retirement
- Single-user context (no org selection)

**Business Layout** (`business/layout.tsx`):
- Comprehensive sidebar with 25+ items grouped into sections:
  - **Overview**: Dashboard, Company Profile, Settings
  - **Accounting**: Chart of Accounts, Journal Entries, Ledger, Trial Balance
  - **Sales**: Customers, Invoices, Receivables
  - **Purchases**: Vendors, Payables
  - **HR**: Employees, Payroll
  - **Compliance**: GST, Tax Management
  - **Analytics**: Reports, Cash Flow, Health Score, Budgets
  - **Intelligence**: ML Forecasting, Credit Risk
  - **AI**: Virtual CFO

The layout includes a mode toggle (Individual ↔ Business) that switches between the two experiences.

---

## 3.6 Data Fetching Pattern

Every page follows the same pattern:
```typescript
export default function SomePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Step 1: Resolve the organization
  useEffect(() => {
    businessOrg.listOrganizations().then((orgs) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  // Step 2: Load data when org is resolved
  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    someApi.getData(orgId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  // Step 3: Render with loading states
  if (!orgId) return <NoOrgPlaceholder />;
  if (loading) return <SkeletonLoader />;
  return <ActualContent data={data} />;
}
```

**Why this pattern?**
- Business routes require an `org_id`; we must resolve it before any API call
- Loading states prevent layout shift and provide visual feedback
- Error boundaries catch and display API failures gracefully

---

## 3.7 Charting & Visualization

**Recharts** is used throughout for financial data visualization:

| Chart Type | Where Used | Why |
|------------|------------|-----|
| `AreaChart` | Dashboard revenue trends | Shows growth trajectory with gradient fill |
| `BarChart` | Expense breakdown by category | Category comparison at a glance |
| `PieChart` | Budget allocation, expense split | Part-to-whole relationships |
| `LineChart` | Cash flow over time | Time-series trend analysis |
| `ComposedChart` | P&L (revenue bars + profit line) | Multiple data series overlaid |

All charts use the dark theme color palette:
- Emerald (`#34D399`) for positive values / revenue
- Red (`#F87171`) for negative values / expenses
- Indigo (`#818CF8`) for neutral/primary
- Amber (`#FBBF24`) for warnings

---

## 3.8 Utility Functions (`lib/utils.ts`)

```typescript
// Format amounts in Indian Rupee notation
export function formatINR(amount: number, compact?: boolean): string {
  if (compact) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    // ...
  }
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

// Format dates in Indian format
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}
```

**Why custom formatINR?**
Indian number formatting uses lakhs (1,00,000) and crores (1,00,00,000) instead of millions/billions. The compact mode (`₹45.00 L`, `₹6.00 Cr`) is essential for dashboard cards where space is limited.
