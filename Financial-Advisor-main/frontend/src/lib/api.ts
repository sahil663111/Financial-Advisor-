// API requests go through the Next.js rewrite proxy configured in next.config.ts
const API_V1 = '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Token Storage ────────────────────────────────────────────────────────────
export const tokenStore = {
  get: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('access_token');
  },
  set: (token: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('access_token', token);
  },
  clear: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  },
  setRefresh: (token: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('refresh_token', token);
  },
  getRefresh: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refresh_token');
  },
};

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_V1}${path}`;
  const token = tokenStore.get();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['X-Access-Token'] = token;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let detail: string = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') {
        detail = data.detail;
      } else if (Array.isArray(data.detail)) {
        // Pydantic validation errors
        detail = data.detail.map((e: any) => {
          const field = e.loc?.slice(1).join('.') || '';
          return field ? `${field}: ${e.msg}` : e.msg;
        }).join('; ');
      } else if (data.detail) {
        detail = JSON.stringify(data.detail);
      }
    } catch {}
    throw new ApiError(res.status, detail);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
// NOTE: Backend auth routes have NO trailing slash (/auth/login not /auth/login/)
export const auth = {
  register: async (email: string, password: string, full_name: string, account_type = 'INDIVIDUAL') => {
    const data: any = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name, account_type }) });
    if (data?.access_token) tokenStore.set(data.access_token);
    if (data?.refresh_token) tokenStore.setRefresh(data.refresh_token);
    return data;
  },

  login: async (email: string, password: string) => {
    const data: any = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data?.access_token) tokenStore.set(data.access_token);
    if (data?.refresh_token) tokenStore.setRefresh(data.refresh_token);
    return data;
  },

  logout: async () => {
    try { await request('/auth/logout', { method: 'POST' }); } catch {}
    tokenStore.clear();
  },

  me: () => request('/auth/me'),
  updateMe: (data: object) => request('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),
  refresh: () => request('/auth/refresh', { method: 'POST' }),
};

// ─── Individual Dashboard ─────────────────────────────────────────────────────
// Backend: prefix="/dashboard", route="/" → full path = /dashboard/
export const dashboard = {
  get: () => request('/individual/dashboard/'),
};

// ─── Income ───────────────────────────────────────────────────────────────────
// Backend: prefix="/income", root route "/" → /income/
// other routes: "/summary" → /income/summary  (no slash)
export const income = {
  list: () => request('/individual/income/'),
  create: (data: object) => request('/individual/income/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) => request(`/individual/income/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/individual/income/${id}`, { method: 'DELETE' }),
  summary: () => request('/individual/income/summary'),
};

// ─── Expenses ─────────────────────────────────────────────────────────────────
// Backend: prefix="/expenses", root route "/" → /expenses/
// other routes: "/analytics" "/classify" "/anomalies" → no trailing slash
export const expenses = {
  list: (params?: Record<string, string | number>) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request(`/individual/expenses/${qs}`);
  },
  create: (data: object) => request('/individual/expenses/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) => request(`/individual/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/individual/expenses/${id}`, { method: 'DELETE' }),
  classify: (text: string) => request('/individual/expenses/classify', { method: 'POST', body: JSON.stringify({ text }) }),
  analytics: (months = 6) => request(`/individual/expenses/analytics?months=${months}`),
  anomalies: () => request('/individual/expenses/anomalies'),
};

// ─── Investments ──────────────────────────────────────────────────────────────
// Backend: prefix="/investments", routes "/portfolio" "/holdings" etc → no trailing slash
export const investments = {
  portfolio: () => request('/individual/investments/portfolio'),
  holdings: () => request('/individual/investments/holdings'),
  addHolding: (data: object) => request('/individual/investments/holdings', { method: 'POST', body: JSON.stringify(data) }),
  updateHolding: (id: string, data: object) => request(`/individual/investments/holdings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHolding: (id: string) => request(`/individual/investments/holdings/${id}`, { method: 'DELETE' }),
  liquidityInfo: () => request('/individual/investments/liquidity-info'),
};

// ─── Credit ───────────────────────────────────────────────────────────────────
export const credit = {
  profile: () => request('/individual/credit/profile'),
  update: (data: object) => request('/individual/credit/profile', { method: 'PUT', body: JSON.stringify(data) }),
  analyze: (data: object) => request('/individual/credit/analyze', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Tax ─────────────────────────────────────────────────────────────────────
export const tax = {
  profile: () => request('/individual/tax/profile'),
  updateProfile: (data: object) => request('/individual/tax/profile', { method: 'PUT', body: JSON.stringify(data) }),
  calculate: (data: object) => request('/individual/tax/calculate', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Goals ───────────────────────────────────────────────────────────────────
// Backend: root route "/" → /goals/
// other routes: "/{goal_id}" "/{goal_id}/projection" → no trailing slash
export const goals = {
  list: () => request('/individual/goals/'),
  create: (data: object) => request('/individual/goals/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) => request(`/individual/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/individual/goals/${id}`, { method: 'DELETE' }),
  projection: (id: string) => request(`/individual/goals/${id}/projection`),
};

// ─── Retirement ───────────────────────────────────────────────────────────────
// Backend routes: "/plan" "/calculate" → no trailing slash
export const retirement = {
  plan: () => request('/individual/retirement/plan'),
  calculate: (data: object) => request('/individual/retirement/calculate', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Financial Health ─────────────────────────────────────────────────────────
// Backend routes: "/score" "/history" → no trailing slash
export const financialHealth = {
  score: () => request('/individual/financial-health/score'),
  history: () => request('/individual/financial-health/history'),
};

// ─── AI ───────────────────────────────────────────────────────────────────────
// Backend: prefix="/ai", root route for conversations → check what's defined
export const ai = {
  conversations: () => request('/individual/ai/conversations'),
  createConversation: () => request('/individual/ai/conversations', { method: 'POST' }),
  messages: (conversationId: string) => request(`/individual/ai/conversations/${conversationId}/messages`),

  sendMessage: async (conversationId: string, content: string, onChunk: (chunk: string) => void): Promise<void> => {
    const token = tokenStore.get();
    const res = await fetch(`${API_V1}/individual/ai/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Access-Token': token } : {}),
      },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) throw new ApiError(res.status, 'AI request failed');
    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value));
    }
  },
};

// ─── Business (legacy dashboard stub) ────────────────────────────────────────
export const business = {
  dashboard: () => request('/business/dashboard'),
  profile: () => request('/business/profile'),
  customers: () => request('/business/customers'),
  vendors: () => request('/business/vendors'),
  invoices: () => request('/business/invoices'),
  reports: () => request('/business/reports/summary'),
};

// ─── Business Accounting (Phase 2) ────────────────────────────────────────────
export const businessAccounting = {
  // ── Journal Entries ─────────────────────────────────────────────────────────
  createJournalEntry: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/accounting/journal-entries`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  listJournalEntries: (
    orgId: string,
    params?: {
      page?: number; limit?: number; status?: string;
      start_date?: string; end_date?: string;
      reference?: string; account_code?: string;
    },
  ) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    ).toString() : '';
    return request<any>(`/business/organizations/${orgId}/accounting/journal-entries${qs}`);
  },

  getJournalEntry: (orgId: string, entryId: string) =>
    request(`/business/organizations/${orgId}/accounting/journal-entries/${entryId}`),

  voidJournalEntry: (orgId: string, entryId: string, reason: string) =>
    request(`/business/organizations/${orgId}/accounting/journal-entries/${entryId}/void`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),

  // ── Ledger ──────────────────────────────────────────────────────────────────
  getLedger: (
    orgId: string,
    accountCode: string,
    params?: { start_date?: string; end_date?: string },
  ) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v)
          .map(([k, v]) => [k, String(v)])
      )
    ).toString() : '';
    return request<any>(`/business/organizations/${orgId}/accounting/ledger/${accountCode}${qs}`);
  },

  getAccountBalances: (orgId: string) =>
    request<any[]>(`/business/organizations/${orgId}/accounting/account-balances`),

  // ── Trial Balance ────────────────────────────────────────────────────────────
  getTrialBalance: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/accounting/trial-balance`),
};
export const businessOrg = {
  // ── Organizations ───────────────────────────────────────────────────────────
  listOrganizations: () =>
    request<any[]>('/business/organizations'),

  createOrganization: (data: object) =>
    request('/business/organizations', { method: 'POST', body: JSON.stringify(data) }),

  getOrganization: (orgId: string) =>
    request(`/business/organizations/${orgId}`),

  updateOrganization: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ── Members ─────────────────────────────────────────────────────────────────
  getMembers: (orgId: string) =>
    request<any[]>(`/business/organizations/${orgId}/members`),

  inviteMember: (orgId: string, data: { user_email: string; role: string }) =>
    request(`/business/organizations/${orgId}/members`, { method: 'POST', body: JSON.stringify(data) }),

  updateMemberRole: (orgId: string, memberUserId: string, role: string) =>
    request(`/business/organizations/${orgId}/members/${memberUserId}/role`, {
      method: 'PUT', body: JSON.stringify({ role }),
    }),

  removeMember: (orgId: string, memberUserId: string) =>
    request(`/business/organizations/${orgId}/members/${memberUserId}`, { method: 'DELETE' }),

  // ── Chart of Accounts ───────────────────────────────────────────────────────
  getAccounts: (orgId: string, tree = false) =>
    request<any[]>(`/business/organizations/${orgId}/accounts${tree ? '?tree=true' : ''}`),

  createAccount: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/accounts`, { method: 'POST', body: JSON.stringify(data) }),

  updateAccount: (orgId: string, accountId: string, data: object) =>
    request(`/business/organizations/${orgId}/accounts/${accountId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  deactivateAccount: (orgId: string, accountId: string) =>
    request(`/business/organizations/${orgId}/accounts/${accountId}`, { method: 'DELETE' }),

  // ── Audit Log ───────────────────────────────────────────────────────────────
  getAuditLog: (orgId: string, params?: { page?: number; limit?: number; entity_type?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request<any>(`/business/organizations/${orgId}/audit-log${qs}`);
  },
};

// ─── Business Sales — Customers, Vendors, Invoices, Payments (Phase 3) ────────
const _qs = (params?: Record<string, any>) =>
  params
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))
      ).toString()
    : '';

export const businessSales = {
  // ── Customers ───────────────────────────────────────────────────────────────
  listCustomers: (orgId: string, params?: { page?: number; limit?: number; search?: string }) =>
    request<any>(`/business/organizations/${orgId}/customers${_qs(params)}`),

  createCustomer: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/customers`, { method: 'POST', body: JSON.stringify(data) }),

  getCustomer: (orgId: string, customerId: string) =>
    request<any>(`/business/organizations/${orgId}/customers/${customerId}`),

  updateCustomer: (orgId: string, customerId: string, data: object) =>
    request(`/business/organizations/${orgId}/customers/${customerId}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteCustomer: (orgId: string, customerId: string) =>
    request(`/business/organizations/${orgId}/customers/${customerId}`, { method: 'DELETE' }),

  // ── Vendors ─────────────────────────────────────────────────────────────────
  listVendors: (orgId: string, params?: { page?: number; limit?: number; search?: string }) =>
    request<any>(`/business/organizations/${orgId}/vendors${_qs(params)}`),

  createVendor: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/vendors`, { method: 'POST', body: JSON.stringify(data) }),

  getVendor: (orgId: string, vendorId: string) =>
    request<any>(`/business/organizations/${orgId}/vendors/${vendorId}`),

  updateVendor: (orgId: string, vendorId: string, data: object) =>
    request(`/business/organizations/${orgId}/vendors/${vendorId}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteVendor: (orgId: string, vendorId: string) =>
    request(`/business/organizations/${orgId}/vendors/${vendorId}`, { method: 'DELETE' }),

  // ── Invoices ────────────────────────────────────────────────────────────────
  listInvoices: (orgId: string, params?: { page?: number; limit?: number; status?: string; customer_id?: string; search?: string }) =>
    request<any>(`/business/organizations/${orgId}/invoices${_qs(params)}`),

  createInvoice: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/invoices`, { method: 'POST', body: JSON.stringify(data) }),

  getInvoice: (orgId: string, invoiceId: string) =>
    request<any>(`/business/organizations/${orgId}/invoices/${invoiceId}`),

  cancelInvoice: (orgId: string, invoiceId: string) =>
    request(`/business/organizations/${orgId}/invoices/${invoiceId}/cancel`, { method: 'POST' }),

  recordPayment: (orgId: string, invoiceId: string, data: object) =>
    request(`/business/organizations/${orgId}/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(data) }),

  // ── Bills (Payables) ────────────────────────────────────────────────────────
  listBills: (orgId: string, params?: { page?: number; limit?: number; status?: string; vendor_id?: string }) =>
    request<any>(`/business/organizations/${orgId}/bills${_qs(params)}`),

  createBill: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/bills`, { method: 'POST', body: JSON.stringify(data) }),

  recordBillPayment: (orgId: string, billId: string, data: object) =>
    request(`/business/organizations/${orgId}/bills/${billId}/payments`, { method: 'POST', body: JSON.stringify(data) }),

  // ── Aging Reports ───────────────────────────────────────────────────────────
  getReceivablesAging: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/receivables/aging`),

  getPayablesAging: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/payables/aging`),
};

// ─── Business Expenses (Phase 4) ──────────────────────────────────────────────
export const businessExpenses = {
  listExpenses: (
    orgId: string,
    params?: {
      page?: number; limit?: number; category?: string;
      approval_status?: string; start_date?: string; end_date?: string;
      search?: string; vendor_id?: string;
    },
  ) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/expenses${qs}`);
  },

  createExpense: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/expenses`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  getExpense: (orgId: string, expenseId: string) =>
    request<any>(`/business/organizations/${orgId}/expenses/${expenseId}`),

  updateExpense: (orgId: string, expenseId: string, data: object) =>
    request(`/business/organizations/${orgId}/expenses/${expenseId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  deleteExpense: (orgId: string, expenseId: string) =>
    request(`/business/organizations/${orgId}/expenses/${expenseId}`, {
      method: 'DELETE',
    }),

  approveExpense: (orgId: string, expenseId: string, data: { comment?: string | null }) =>
    request(`/business/organizations/${orgId}/expenses/${expenseId}/approve`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  rejectExpense: (orgId: string, expenseId: string, data: { reason: string }) =>
    request(`/business/organizations/${orgId}/expenses/${expenseId}/reject`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  getExpenseAnalytics: (orgId: string, months = 6) =>
    request<any>(`/business/organizations/${orgId}/expenses/analytics?months=${months}`),

  parseReceipt: async (orgId: string, file: File) => {
    const token = tokenStore.get();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/v1/business/organizations/${orgId}/expenses/parse-receipt`, {
      method: 'POST',
      headers: { ...(token ? { 'X-Access-Token': token } : {}) },
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to parse receipt');
    return res.json();
  },
};

// ─── Business Payroll (Phase 5) ────────────────────────────────────────────────
export const businessPayroll = {
  // ── Employees ───────────────────────────────────────────────────────────────
  listEmployees: (
    orgId: string,
    params?: { page?: number; limit?: number; search?: string; department?: string; status?: string },
  ) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/employees${qs}`);
  },

  createEmployee: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/employees`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  getEmployee: (orgId: string, employeeId: string) =>
    request<any>(`/business/organizations/${orgId}/employees/${employeeId}`),

  updateEmployee: (orgId: string, employeeId: string, data: object) =>
    request(`/business/organizations/${orgId}/employees/${employeeId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  terminateEmployee: (orgId: string, employeeId: string, reason?: string) =>
    request(`/business/organizations/${orgId}/employees/${employeeId}/terminate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getDepartmentSummary: (orgId: string) =>
    request<any[]>(`/business/organizations/${orgId}/employees/departments`),

  // ── Payroll Runs ─────────────────────────────────────────────────────────────
  listPayrollRuns: (orgId: string, params?: { page?: number; limit?: number }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/payroll${qs}`);
  },

  runPayroll: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/payroll/run`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  getPayrollRun: (orgId: string, runId: string) =>
    request<any>(`/business/organizations/${orgId}/payroll/${runId}`),

  approvePayroll: (orgId: string, runId: string, data: { comment?: string | null }) =>
    request(`/business/organizations/${orgId}/payroll/${runId}/approve`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  markPayrollPaid: (
    orgId: string,
    runId: string,
    data: { payment_reference?: string | null; payment_date?: string | null },
  ) =>
    request(`/business/organizations/${orgId}/payroll/${runId}/mark-paid`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  getPayslip: (orgId: string, runId: string, employeeId: string) =>
    request<any>(
      `/business/organizations/${orgId}/payroll/${runId}/payslip/${employeeId}`
    ),
};

// ─── Business Finance — GST, Cash Flow, Statements, Ratios (Phase 6) ──────────
export const businessFinance = {
  // ── GST ─────────────────────────────────────────────────────────────────────
  getGSTSummary: (orgId: string, params?: { period_start?: string; period_end?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, v as string]))
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/gst/summary${qs}`);
  },

  getGSTMonthly: (orgId: string, months = 6) =>
    request<any[]>(`/business/organizations/${orgId}/gst/monthly?months=${months}`),

  getComplianceCalendar: (orgId: string) =>
    request<any[]>(`/business/organizations/${orgId}/gst/calendar`),

  // ── Cash Flow ────────────────────────────────────────────────────────────────
  getCashFlow: (orgId: string, params?: { start_date?: string; end_date?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, v as string]))
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/cashflow${qs}`);
  },

  getCashMetrics: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/cashflow/metrics`),

  // ── Financial Statements ─────────────────────────────────────────────────────
  getProfitLoss: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/reports/profit-loss`),

  getBalanceSheet: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/reports/balance-sheet`),

  getFinancialRatios: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/reports/ratios`),

  getReportsSummary: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/reports/summary`),

  getBusinessHealthScore: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/health-score`),

  getHealthScoreHistory: (orgId: string, limit = 12) =>
    request<any[]>(`/business/organizations/${orgId}/health-score/history?limit=${limit}`),

  // ── Exports ──────────────────────────────────────────────────────────────────
  exportPnL: async (orgId: string, format: string = 'csv') => {
    const token = tokenStore.get();
    const res = await fetch(`/api/v1/business/organizations/${orgId}/reports/profit-loss/export?format=${format}`, {
      headers: { ...(token ? { 'X-Access-Token': token } : {}) },
    });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },

  exportBalanceSheet: async (orgId: string, format: string = 'csv') => {
    const token = tokenStore.get();
    const res = await fetch(`/api/v1/business/organizations/${orgId}/reports/balance-sheet/export?format=${format}`, {
      headers: { ...(token ? { 'X-Access-Token': token } : {}) },
    });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },

  exportTrialBalance: async (orgId: string, format: string = 'csv') => {
    const token = tokenStore.get();
    const res = await fetch(`/api/v1/business/organizations/${orgId}/reports/trial-balance/export?format=${format}`, {
      headers: { ...(token ? { 'X-Access-Token': token } : {}) },
    });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },

  exportCashFlow: async (orgId: string, format: string = 'csv') => {
    const token = tokenStore.get();
    const res = await fetch(`/api/v1/business/organizations/${orgId}/reports/cashflow/export?format=${format}`, {
      headers: { ...(token ? { 'X-Access-Token': token } : {}) },
    });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },
};

// ─── Business Tax — GST, TDS, Rules Engine, Compliance Calendar (Phase 6) ─────
export const businessTax = {
  getTaxDashboard: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/tax/dashboard`),

  // ── Rules Engine ─────────────────────────────────────────────────────────────
  listTaxRules: (orgId: string, params?: { tax_type?: string; active_only?: boolean }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : '';
    return request<any[]>(`/business/organizations/${orgId}/tax/rules${qs}`);
  },

  createTaxRule: (orgId: string, data: object) =>
    request<any>(`/business/organizations/${orgId}/tax/rules`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTaxRule: (orgId: string, ruleId: string, data: object) =>
    request<any>(`/business/organizations/${orgId}/tax/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deactivateTaxRule: (orgId: string, ruleId: string) =>
    request<any>(`/business/organizations/${orgId}/tax/rules/${ruleId}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    }),

  seedTaxRules: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/tax/rules/seed-defaults`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  // ── GST ─────────────────────────────────────────────────────────────────────
  getGSTSummary: (orgId: string, params?: { period_start?: string; period_end?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, v as string]))
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/tax/gst/summary${qs}`);
  },

  getGSTMonthly: (orgId: string, months = 6) =>
    request<any[]>(`/business/organizations/${orgId}/tax/gst/monthly?months=${months}`),

  getGSTReturnData: (orgId: string, params?: { month?: number; year?: number }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/tax/gst/return-data${qs}`);
  },

  getITCReconciliation: (orgId: string, params?: { period_start?: string; period_end?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, v as string]))
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/tax/gst/itc-reconciliation${qs}`);
  },

  // ── TDS ─────────────────────────────────────────────────────────────────────
  listTDSRecords: (
    orgId: string,
    params?: {
      section?: string;
      status?: string;
      deductee_type?: string;
      page?: number;
      limit?: number;
    }
  ) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== null && v !== '')
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/tax/tds${qs}`);
  },

  recordTDSDeduction: (orgId: string, data: object) =>
    request<any>(`/business/organizations/${orgId}/tax/tds`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  markTDSDeposited: (orgId: string, data: object) =>
    request<any>(`/business/organizations/${orgId}/tax/tds/mark-deposited`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getTDSSummary: (orgId: string, params?: { quarter?: number; financial_year?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : '';
    return request<any>(`/business/organizations/${orgId}/tax/tds/summary${qs}`);
  },

  getPendingTDS: (orgId: string) =>
    request<any[]>(`/business/organizations/${orgId}/tax/tds/pending`),

  // ── Calendar ────────────────────────────────────────────────────────────────
  getTaxCalendar: (orgId: string, monthsAhead = 3) =>
    request<any[]>(`/business/organizations/${orgId}/tax/calendar?months_ahead=${monthsAhead}`),
};

// ─── Business ML & Forecasting (Phase 7) ──────────────────────────────────────
export const businessML = {
  getForecast: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/ml/forecast`),

  getAnomalies: (orgId: string) =>
    request<any[]>(`/business/organizations/${orgId}/ml/anomalies`),

  resolveAnomaly: (orgId: string, anomalyId: string, data: { resolution_note: string }) =>
    request(`/business/organizations/${orgId}/ml/anomalies/${anomalyId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCreditRisk: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/ml/credit-risk`),

  simulateScenario: (orgId: string, data: object) =>
    request<any>(`/business/organizations/${orgId}/ml/scenarios/simulate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getHealthScore: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/ml/health-score`),
};

// ─── Business AI CFO & Notifications (Phase 8) ────────────────────────────────
export const businessAI = {
  listConversations: (orgId: string) =>
    request<any[]>(`/business/organizations/${orgId}/ai/conversations`),

  createConversation: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/ai/conversations`, {
      method: 'POST',
    }),

  getMessages: (orgId: string, conversationId: string) =>
    request<any[]>(`/business/organizations/${orgId}/ai/conversations/${conversationId}/messages`),

  // For sending messages, we use fetch directly in the component for SSE streaming
  getInsightsSummary: (orgId: string) =>
    request<any>(`/business/organizations/${orgId}/ai/insights/summary`),
};

export const businessNotifications = {
  getNotifications: (orgId: string) =>
    request<any[]>(`/business/organizations/${orgId}/notifications`),

  getUnreadCount: (orgId: string) =>
    request<{ count: number }>(`/business/organizations/${orgId}/notifications/unread-count`),

  markAsRead: (orgId: string, notificationId: string) =>
    request(`/business/organizations/${orgId}/notifications/${notificationId}/read`, {
      method: 'PUT',
    }),

  markAllAsRead: (orgId: string) =>
    request(`/business/organizations/${orgId}/notifications/read-all`, {
      method: 'PUT',
    }),
};

// ─── Business Budgets (Phase 9) ───────────────────────────────────────────────
export const businessBudgets = {
  getBudgets: (orgId: string) =>
    request<any[]>(`/business/organizations/${orgId}/budgets`),

  createBudget: (orgId: string, data: object) =>
    request(`/business/organizations/${orgId}/budgets`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteBudget: (orgId: string, budgetId: string) =>
    request(`/business/organizations/${orgId}/budgets/${budgetId}`, {
      method: 'DELETE',
    }),
};
