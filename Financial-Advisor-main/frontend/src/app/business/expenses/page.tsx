'use client';

import { useEffect, useState, useCallback } from 'react';
import { businessOrg as orgApi, businessExpenses as api } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import {
  Plus, Search, X, Trash2, CheckCircle, XCircle,
  BarChart3, List, AlertTriangle, RefreshCw, Filter, Camera
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'RENT','UTILITIES','INTERNET','SOFTWARE','MARKETING','TRAVEL','MEALS',
  'OFFICE_SUPPLIES','SALARIES','PROFESSIONAL_FEES','REPAIRS','INSURANCE',
  'DEPRECIATION','BANK_CHARGES','OTHER',
];
const PAYMENT_METHODS = ['BANK_TRANSFER','UPI','CASH','CREDIT_CARD','CHEQUE','OTHER'];

const CATEGORY_EMOJI: Record<string, string> = {
  RENT:'🏢', UTILITIES:'💡', INTERNET:'🌐', SOFTWARE:'💻', MARKETING:'📣',
  TRAVEL:'✈️', MEALS:'🍽️', OFFICE_SUPPLIES:'📦', SALARIES:'👥',
  PROFESSIONAL_FEES:'💼', REPAIRS:'🔧', INSURANCE:'🛡️',
  DEPRECIATION:'📉', BANK_CHARGES:'🏦', OTHER:'📋',
};

const STATUS_STYLES: Record<string, string> = {
  PENDING:  'text-amber-400  bg-amber-400/10  border-amber-400/20',
  APPROVED: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  REJECTED: 'text-red-400    bg-red-400/10    border-red-400/20',
};

const CHART_COLORS = [
  '#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b',
  '#ef4444','#ec4899','#84cc16','#f97316','#14b8a6',
];

// ── Expense form ──────────────────────────────────────────────────────────────
function ExpenseForm({ orgId, vendors, onCreated, onCancel }: {
  orgId: string;
  vendors: any[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: 'SOFTWARE',
    description: '',
    amount: '',
    payment_method: 'BANK_TRANSFER',
    vendor_id: '',
    vendor_name: '',
    reference: '',
    gst_amount: '0',
    notes: '',
    requires_approval: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  
  const set = (f: string, v: any) => setForm(p => ({ ...p, [f]: v }));

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setScanError('');
    try {
      const data = await api.parseReceipt(orgId, file);
      setForm(p => ({
        ...p,
        amount: data.amount ? String(data.amount) : p.amount,
        gst_amount: data.gst_amount ? String(data.gst_amount) : p.gst_amount,
        date: data.date || p.date,
        vendor_name: data.vendor_name || p.vendor_name,
        description: data.description || p.description,
        category: data.category || p.category,
      }));
    } catch (err: any) {
      setScanError(err.message || 'Failed to scan receipt');
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.createExpense(orgId, {
        ...form,
        date: new Date(form.date).toISOString(),
        amount: parseFloat(form.amount) || 0,
        gst_amount: parseFloat(form.gst_amount) || 0,
        vendor_id: form.vendor_id || null,
        vendor_name: form.vendor_name || null,
        reference: form.reference || null,
        notes: form.notes || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create expense');
    } finally { setSaving(false); }
  };

  const amount = parseFloat(form.amount) || 0;
  const gst = parseFloat(form.gst_amount) || 0;
  const net = Math.max(0, amount - gst);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-xl shadow-2xl mb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Add Business Expense</h2>
          <button onClick={onCancel} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <div className="mb-6 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Scan Receipt</h3>
              <p className="text-xs text-slate-400">Upload a receipt to auto-fill details using AI</p>
            </div>
            <label className="btn-secondary text-xs px-3 py-1.5 cursor-pointer relative overflow-hidden flex items-center gap-2">
              {scanning ? (
                <><RefreshCw size={14} className="animate-spin" /> Analyzing...</>
              ) : (
                <><Camera size={14} /> Upload Image</>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleScanReceipt} disabled={scanning} />
            </label>
          </div>
          {scanError && <p className="text-xs text-red-400 mt-2">{scanError}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Date *</label>
              <input type="date" className="input" value={form.date}
                onChange={e => set('date', e.target.value)} required />
            </div>
            <div>
              <label className="input-label">Category *</label>
              <select className="select" value={form.category}
                onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="input-label">Description *</label>
            <input className="input" placeholder="e.g. AWS hosting — June 2024"
              value={form.description} onChange={e => set('description', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Amount (₹) *</label>
              <input type="number" step="0.01" className="input" placeholder="0.00"
                value={form.amount} onChange={e => set('amount', e.target.value)} required />
            </div>
            <div>
              <label className="input-label">GST Amount (₹)</label>
              <input type="number" step="0.01" className="input" placeholder="0.00"
                value={form.gst_amount} onChange={e => set('gst_amount', e.target.value)} />
            </div>
          </div>

          {/* Net amount indicator */}
          {amount > 0 && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3 text-sm flex justify-between">
              <span className="text-slate-400">Net (excl. GST)</span>
              <span className="text-white font-mono font-semibold">{formatINR(net)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Payment Method</label>
              <select className="select" value={form.payment_method}
                onChange={e => set('payment_method', e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Reference</label>
              <input className="input font-mono" placeholder="UTR / Bill No"
                value={form.reference} onChange={e => set('reference', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Vendor (from list)</label>
              <select className="select" value={form.vendor_id}
                onChange={e => set('vendor_id', e.target.value)}>
                <option value="">— Select vendor —</option>
                {vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Vendor (free text)</label>
              <input className="input" placeholder="Or type vendor name"
                value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="input-label">Notes</label>
            <textarea className="input resize-none" rows={2}
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="req_approval" className="accent-indigo-500"
              checked={form.requires_approval}
              onChange={e => set('requires_approval', e.target.checked)} />
            <label htmlFor="req_approval" className="text-slate-300 text-sm select-none cursor-pointer">
              Requires approval before posting to accounting
            </label>
          </div>

          {error && (
            <div className="rounded-xl bg-red-950/40 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Approve / Reject modal ────────────────────────────────────────────────────
function ApprovalModal({ expense, orgId, mode, onDone, onCancel }: {
  expense: any; orgId: string; mode: 'approve' | 'reject';
  onDone: () => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'reject' && !reason.trim()) {
      setError('Please provide a reason for rejection'); return;
    }
    setLoading(true); setError('');
    try {
      if (mode === 'approve') {
        await api.approveExpense(orgId, expense._id, { comment: reason || null });
      } else {
        await api.rejectExpense(orgId, expense._id, { reason });
      }
      onDone();
    } catch (err: any) {
      setError(err.message || `${mode} failed`);
    } finally { setLoading(false); }
  };

  const isApprove = mode === 'approve';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">
          {isApprove ? '✅ Approve Expense' : '❌ Reject Expense'}
        </h2>
        <div className="rounded-xl bg-slate-800/50 p-3 my-4 text-sm space-y-1">
          <p className="text-slate-300">{expense.description}</p>
          <p className="text-slate-500">
            {CATEGORY_EMOJI[expense.category]} {expense.category.replace(/_/g, ' ')} ·{' '}
            <span className="text-white font-semibold">{formatINR(expense.amount)}</span>
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">
              {isApprove ? 'Comment (optional)' : 'Reason for rejection *'}
            </label>
            <textarea className="input resize-none" rows={3}
              placeholder={isApprove ? 'Add a note...' : 'Why is this being rejected?'}
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          {isApprove && (
            <div className="rounded-xl bg-indigo-950/40 border border-indigo-500/20 p-3 text-xs text-indigo-300">
              Approving will immediately post a journal entry to accounting:
              <span className="font-mono block mt-1">
                DR {expense.expense_account_code} / CR {expense.bank_account_code}
              </span>
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={loading}
              className={`font-medium text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-50 ${
                isApprove
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}>
              {loading ? '...' : isApprove ? 'Approve' : 'Reject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Analytics panel ───────────────────────────────────────────────────────────
function AnalyticsPanel({ analytics }: { analytics: any }) {
  if (!analytics) return null;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="metric-card py-4 px-5">
          <p className="metric-label">Avg Monthly</p>
          <p className="metric-value">{formatINR(analytics.average_monthly, true)}</p>
        </div>
        <div className="metric-card py-4 px-5">
          <p className="metric-label">MoM Change</p>
          <p className={`metric-value ${analytics.month_over_month_change_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {analytics.month_over_month_change_pct != null
              ? `${analytics.month_over_month_change_pct > 0 ? '+' : ''}${analytics.month_over_month_change_pct}%`
              : '—'}
          </p>
        </div>
        <div className="metric-card py-4 px-5">
          <p className="metric-label">Pending Approval</p>
          <p className="metric-value text-amber-400">{analytics.pending?.count || 0}</p>
        </div>
        <div className="metric-card py-4 px-5">
          <p className="metric-label">Pending Value</p>
          <p className="metric-value text-amber-400">{formatINR(analytics.pending?.total || 0, true)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly trend */}
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Monthly Expense Trend</h2>
          {analytics.monthly_trend.length === 0 ? (
            <div className="empty-state py-8"><p className="text-slate-500 text-sm">No data yet</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.monthly_trend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} />
                <YAxis tickFormatter={v => formatINR(v, true)} tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} width={64} />
                <Tooltip
                  contentStyle={{ background: 'rgb(15,23,42)', border: '1px solid rgb(51,65,85)', borderRadius: 12 }}
                  formatter={(v: number) => [formatINR(v), 'Expenses']}
                />
                <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Category distribution */}
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Category Breakdown</h2>
          {analytics.category_distribution.length === 0 ? (
            <div className="empty-state py-8"><p className="text-slate-500 text-sm">No data yet</p></div>
          ) : (
            <div className="flex gap-4 items-center">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={analytics.category_distribution} dataKey="total"
                    nameKey="category" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                    {analytics.category_distribution.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'rgb(15,23,42)', border: '1px solid rgb(51,65,85)', borderRadius: 12 }}
                    formatter={(v: number) => formatINR(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 text-xs">
                {analytics.category_distribution.slice(0, 7).map((c: any, i: number) => (
                  <div key={c.category} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-slate-400 truncate flex-1">
                      {CATEGORY_EMOJI[c.category]} {c.category.replace(/_/g, ' ')}
                    </span>
                    <span className="text-slate-200 font-mono shrink-0">{formatINR(c.total, true)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top vendors */}
      {analytics.top_vendors.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Top Vendors by Spend</h2>
          <div className="space-y-2">
            {analytics.top_vendors.map((v: any, i: number) => {
              const maxTotal = analytics.top_vendors[0].total;
              const pct = Math.round((v.total / maxTotal) * 100);
              return (
                <div key={v.vendor} className="flex items-center gap-3">
                  <span className="text-slate-500 text-xs w-5 text-right">{i + 1}</span>
                  <span className="text-slate-300 text-sm w-44 truncate">{v.vendor}</span>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-slate-200 font-mono text-sm w-24 text-right">
                    {formatINR(v.total, true)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const [orgId, setOrgId]         = useState<string | null>(null);
  const [vendors, setVendors]     = useState<any[]>([]);
  const [data, setData]           = useState<any>({ data: [], total: 0, pages: 1 });
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<'list' | 'analytics'>('list');
  const [showForm, setShowForm]   = useState(false);
  const [approvalModal, setApprovalModal] = useState<{ expense: any; mode: 'approve' | 'reject' } | null>(null);

  // Filters
  const [search, setSearch]           = useState('');
  const [category, setCategory]       = useState('');
  const [statusFilter, setStatus]     = useState('');
  const [page, setPage]               = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) {
        const id = orgs[0].id || orgs[0]._id;
        setOrgId(id);
        // Load vendors for the form
        import('@/lib/api').then(({ businessSales }) =>
          businessSales.listVendors(id, { limit: 200 }).then((res: any) =>
            setVendors(res?.data || [])
          )
        );
      }
    });
  }, []);

  const loadExpenses = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (search)       params.search          = search;
      if (category)     params.category        = category;
      if (statusFilter) params.approval_status = statusFilter;
      const res: any = await api.listExpenses(orgId, params);
      setData(res);
    } catch {} finally { setLoading(false); }
  }, [orgId, page, search, category, statusFilter]);

  const loadAnalytics = useCallback(async () => {
    if (!orgId) return;
    try {
      const res: any = await api.getExpenseAnalytics(orgId);
      setAnalytics(res);
    } catch {}
  }, [orgId]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  useEffect(() => { if (view === 'analytics') loadAnalytics(); }, [view, loadAnalytics]);

  const handleDelete = async (exp: any) => {
    if (!confirm(`Delete "${exp.description}"?`)) return;
    try { await api.deleteExpense(orgId!, exp._id); loadExpenses(); }
    catch (err: any) { alert(err.message); }
  };

  if (!orgId) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Business Expenses</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data.total} expenses</p>
        </div>
        <div className="flex items-center gap-2">
          {/* List / Analytics toggle */}
          <div className="flex rounded-xl bg-slate-800 p-1">
            {(['list', 'analytics'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                  view === v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}>
                {v === 'list' ? <><List size={13} />List</> : <><BarChart3 size={13} />Analytics</>}
              </button>
            ))}
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      {/* Analytics view */}
      {view === 'analytics' ? (
        analytics
          ? <AnalyticsPanel analytics={analytics} />
          : <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}</div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input className="input pl-9 text-sm" placeholder="Search expenses..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <button onClick={() => setShowFilters(f => !f)}
              className={`btn-secondary text-sm py-2 px-3 flex items-center gap-1.5 ${showFilters ? 'border-indigo-500/50' : ''}`}>
              <Filter size={14} /> Filters {(category || statusFilter) ? '•' : ''}
            </button>
            <button onClick={() => { loadExpenses(); loadAnalytics(); }}
              className="btn-secondary text-sm py-2 px-3">
              <RefreshCw size={14} />
            </button>
          </div>

          {showFilters && (
            <div className="flex gap-3 flex-wrap p-4 rounded-xl bg-slate-800/40 border border-slate-800">
              <div>
                <label className="input-label">Category</label>
                <select className="select text-sm w-44" value={category}
                  onChange={e => { setCategory(e.target.value); setPage(1); }}>
                  <option value="">All Categories</option>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Status</label>
                <select className="select text-sm w-36" value={statusFilter}
                  onChange={e => { setStatus(e.target.value); setPage(1); }}>
                  <option value="">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
              {(category || statusFilter) && (
                <div className="flex items-end">
                  <button onClick={() => { setCategory(''); setStatus(''); }}
                    className="btn-ghost text-sm text-red-400 py-2 px-3">
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pending approval banner */}
          {analytics?.pending?.count > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 flex items-center gap-3">
              <AlertTriangle size={18} className="text-amber-400 shrink-0" />
              <p className="text-amber-200 text-sm">
                <span className="font-semibold">{analytics.pending.count} expense(s)</span> worth{' '}
                <span className="font-semibold">{formatINR(analytics.pending.total)}</span> are
                awaiting approval.
              </p>
              <button onClick={() => { setStatus('PENDING'); setShowFilters(true); }}
                className="ml-auto text-amber-400 text-xs hover:text-amber-300 shrink-0">
                View →
              </button>
            </div>
          )}

          {/* Expense table */}
          {loading ? (
            <div className="space-y-2">
              {Array(6).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : data.data.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💸</div>
              <h3 className="text-white font-medium mb-1">No expenses found</h3>
              <p className="text-slate-400 text-sm mb-4">
                {search || category || statusFilter
                  ? 'Try adjusting your filters'
                  : 'Add your first business expense to start tracking'}
              </p>
              {!search && !category && !statusFilter && (
                <button onClick={() => setShowForm(true)} className="btn-primary">Add Expense</button>
              )}
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="table w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="py-3 px-4 text-left">Category</th>
                    <th className="py-3 px-4 text-left">Description</th>
                    <th className="py-3 px-4 text-left hidden sm:table-cell">Date</th>
                    <th className="py-3 px-4 text-left hidden md:table-cell">Vendor</th>
                    <th className="py-3 px-4 text-left">Status</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((exp: any) => (
                    <tr key={exp._id} className="border-b border-slate-800/50 hover:bg-slate-800/10">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{CATEGORY_EMOJI[exp.category] || '📋'}</span>
                          <span className="text-xs text-slate-500 hidden lg:block">
                            {exp.category.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-slate-200 text-sm truncate max-w-xs">{exp.description}</p>
                        {exp.reference && (
                          <p className="text-slate-600 text-xs font-mono">{exp.reference}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-sm hidden sm:table-cell whitespace-nowrap">
                        {formatDate(exp.date)}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-sm hidden md:table-cell truncate max-w-[120px]">
                        {exp.vendor_name || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge text-[11px] border ${STATUS_STYLES[exp.approval_status]}`}>
                          {exp.approval_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-sm text-white">
                        {formatINR(exp.amount)}
                        {exp.gst_amount > 0 && (
                          <span className="text-slate-600 text-xs block">
                            GST: {formatINR(exp.gst_amount)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          {exp.approval_status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => setApprovalModal({ expense: exp, mode: 'approve' })}
                                className="btn-ghost p-1.5 text-emerald-400"
                                title="Approve">
                                <CheckCircle size={14} />
                              </button>
                              <button
                                onClick={() => setApprovalModal({ expense: exp, mode: 'reject' })}
                                className="btn-ghost p-1.5 text-red-400"
                                title="Reject">
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                          {exp.approval_status === 'APPROVED' && (
                            <button
                              onClick={() => setApprovalModal({ expense: exp, mode: 'reject' })}
                              className="btn-ghost p-1.5 text-red-400"
                              title="Reverse (Reject)">
                              <XCircle size={14} />
                            </button>
                          )}
                          {exp.approval_status === 'PENDING' && (
                            <button
                              onClick={() => handleDelete(exp)}
                              className="btn-ghost p-1.5 text-slate-600 hover:text-red-400"
                              title="Delete">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-slate-500 text-sm">Page {page} of {data.pages} · {data.total} total</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                  className="btn-secondary py-1.5 px-3 text-sm">←</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page === data.pages}
                  className="btn-secondary py-1.5 px-3 text-sm">→</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showForm && orgId && (
        <ExpenseForm
          orgId={orgId}
          vendors={vendors}
          onCreated={() => { setShowForm(false); loadExpenses(); loadAnalytics(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {approvalModal && orgId && (
        <ApprovalModal
          expense={approvalModal.expense}
          orgId={orgId}
          mode={approvalModal.mode}
          onDone={() => { setApprovalModal(null); loadExpenses(); loadAnalytics(); }}
          onCancel={() => setApprovalModal(null)}
        />
      )}
    </div>
  );
}
