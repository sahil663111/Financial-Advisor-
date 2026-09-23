'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessFinance, businessSales, businessPayroll, businessML, businessAI } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Users, FileText,
  Building2, AlertTriangle, ArrowRight, RefreshCw,
  ShieldCheck, Gauge, BrainCircuit, CheckCircle2
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';

// ── Metric card ───────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color = 'text-white', href }: {
  label: string; value: string; sub?: string; color?: string; href?: string;
}) {
  const inner = (
    <div className="metric-card py-4 px-5 group">
      <p className="metric-label">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
      {href && (
        <p className="text-indigo-400 text-xs mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          View <ArrowRight size={10} />
        </p>
      )}
    </div>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}

// ── Cash flow tooltip ─────────────────────────────────────────────────────────
const CFTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs shadow-xl space-y-1">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-6" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-mono font-semibold">{formatINR(p.value, true)}</span>
        </div>
      ))}
    </div>
  );
};

export default function BusinessDashboardPage() {
  const [orgId, setOrgId]         = useState<string | null>(null);
  const [orgName, setOrgName]     = useState('Your Business');
  const [summary, setSummary]     = useState<any>(null);
  const [cashMetrics, setCash]    = useState<any>(null);
  const [receivables, setRec]     = useState<any>(null);
  const [employees, setEmps]      = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [forecast, setForecast]   = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (!orgs?.length) { setLoading(false); return; }
      const org = orgs[0];
      const id  = org.id || org._id;
      setOrgId(id);
      setOrgName(org.name || 'Your Business');
    }).catch(() => setLoading(false));
  }, []);

  const load = async (id: string) => {
    setLoading(true);
    await Promise.allSettled([
      businessFinance.getReportsSummary(id).then(setSummary).catch(() => {}),
      businessFinance.getCashMetrics(id).then(setCash).catch(() => {}),
      businessSales.getReceivablesAging(id).then(setRec).catch(() => {}),
      businessPayroll.listEmployees(id, { limit: 1 }).then((d: any) => setEmps(d)).catch(() => {}),
      businessML.getAnomalies(id).then((d: any) => setAnomalies(d || [])).catch(() => {}),
      businessML.getForecast(id).then(setForecast).catch(() => {}),
      businessAI.getInsightsSummary(id).then(setAiSummary).catch(() => {}),
    ]);
    setLoading(false);
  };

  useEffect(() => { if (orgId) load(orgId); }, [orgId]);

  // No org yet
  if (!orgId && !loading) return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto text-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 text-indigo-400 mx-auto flex items-center justify-center mb-4">
        <Building2 size={32} />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Welcome to Business Portal</h2>
      <p className="text-slate-400 max-w-md mx-auto mb-6">
        Create your company profile to unlock accounting, invoicing, payroll, and AI CFO.
      </p>
      <a href="/business/profile" className="btn-primary">Create Company Profile</a>
    </div>
  );

  const runwayWarn = cashMetrics?.runway_months !== null &&
    cashMetrics?.runway_months !== undefined &&
    cashMetrics.runway_months < 3;

  const forecastData = forecast?.revenue_forecast?.map((r: any, i: number) => ({
    date: r.date,
    rev_actual: r.actual_value,
    rev_forecast: r.forecast_value,
    exp_actual: forecast.expense_forecast[i]?.actual_value,
    exp_forecast: forecast.expense_forecast[i]?.forecast_value,
    net_actual: forecast.net_cash_forecast[i]?.actual_value,
    net_forecast: forecast.net_cash_forecast[i]?.forecast_value,
  })) || [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{orgName}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Business Dashboard · {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        {orgId && (
          <button onClick={() => load(orgId)} disabled={loading}
            className="btn-secondary text-sm py-1.5 px-3">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Runway warning */}
      {runwayWarn && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-200 text-sm">
            <span className="font-semibold">Low runway warning:</span> At current burn rate, cash reserves are estimated at{' '}
            <span className="font-bold">{cashMetrics?.runway_label}</span>. Review expenses or plan for additional capital.
          </p>
        </div>
      )}

      {/* Anomaly alert */}
      {anomalies.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-400 shrink-0" />
            <p className="text-amber-200 text-sm">
              <span className="font-semibold">{anomalies.length} expense anomal{anomalies.length === 1 ? 'y' : 'ies'}</span> detected by ML.
            </p>
          </div>
          <a href="/business/intelligence" className="text-amber-400 text-xs hover:text-amber-300 flex items-center gap-1 shrink-0">
            Review <ArrowRight size={12} />
          </a>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array(8).fill(0).map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
          </div>
        </div>
      ) : (
        <>
          {/* Executive AI Summary */}
          {aiSummary && (
            <div className="card space-y-4 border-indigo-500/20 bg-indigo-950/10">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <BrainCircuit size={20} className="text-indigo-400" />
                  Executive AI Summary
                </h2>
                <span className="text-xs text-slate-500">
                  Updated: {new Date(aiSummary.generated_at).toLocaleDateString()}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-1">
                    <CheckCircle2 size={16} /> Key Insights
                  </h3>
                  <ul className="space-y-2">
                    {aiSummary.key_insights?.map((insight: string, i: number) => (
                      <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-indigo-500 mt-1">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-1">
                      <AlertTriangle size={16} /> Key Risks
                    </h3>
                    <ul className="space-y-1">
                      {aiSummary.risks?.map((risk: string, i: number) => (
                        <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                          <span className="text-red-500 mt-1">•</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-1">
                      <ArrowRight size={16} /> Recommended Actions
                    </h3>
                    <ul className="space-y-1">
                      {aiSummary.recommended_actions?.map((action: string, i: number) => (
                        <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                          <span className="text-amber-500 mt-1">•</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* P&L KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPI label="Revenue" href="/business/reports"
              value={summary ? formatINR(summary.revenue, true) : '—'}
              color="text-emerald-400" />
            <KPI label="Expenses" href="/business/expenses"
              value={summary ? formatINR(summary.expenses, true) : '—'}
              color="text-red-400" />
            <KPI label="Net Profit" href="/business/reports"
              value={summary ? formatINR(summary.net_profit, true) : '—'}
              color={summary?.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
              sub={summary ? `${summary.profit_margin}% margin` : undefined} />
            <KPI label="Cash Balance" href="/business/cashflow"
              value={cashMetrics ? formatINR(cashMetrics.cash_balance, true) : '—'}
              color={cashMetrics?.cash_balance >= 0 ? 'text-white' : 'text-red-400'} />
          </div>

          {/* Cash metrics + operational */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPI label="Burn Rate" href="/business/cashflow"
              value={cashMetrics?.burn_rate > 0 ? formatINR(cashMetrics.burn_rate, true) : '—'}
              sub="per month" color="text-amber-400" />
            <KPI label="Runway" href="/business/cashflow"
              value={cashMetrics?.runway_label || '—'}
              color={
                !cashMetrics?.runway_months ? 'text-emerald-400'
                : cashMetrics.runway_months < 3 ? 'text-red-400'
                : cashMetrics.runway_months < 6 ? 'text-amber-400'
                : 'text-emerald-400'
              } />
            <KPI label="Receivables" href="/business/receivables"
              value={receivables ? formatINR(receivables.total_outstanding, true) : '—'}
              sub={receivables?.high_risk_amount > 0 ? `${formatINR(receivables.high_risk_amount, true)} high-risk` : 'All current'}
              color={receivables?.high_risk_amount > 0 ? 'text-amber-400' : 'text-white'} />
            <KPI label="Employees" href="/business/employees"
              value={employees?.total !== undefined ? String(employees.total) : '—'}
              sub="active" />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cash flow chart */}
            {cashMetrics?.monthly_trend?.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-white">6-Month Cash Flow</h2>
                  <a href="/business/cashflow" className="text-indigo-400 text-xs hover:text-indigo-300 flex items-center gap-1">
                    Full analysis <ArrowRight size={11} />
                  </a>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={cashMetrics.monthly_trend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cashInGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cashOutGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} width={64}
                      tickFormatter={v => formatINR(v, true)} />
                    <Tooltip content={<CFTooltip />} />
                    <Area type="monotone" dataKey="cash_in" name="Cash In"
                      stroke="#10b981" fill="url(#cashInGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="cash_out" name="Cash Out"
                      stroke="#ef4444" fill="url(#cashOutGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Revenue vs Expense Trend Chart */}
            {forecastData.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-white">Revenue & Expense Trend</h2>
                  <span className="text-indigo-400 text-xs">Past & Forecast</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={forecastData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} width={64} tickFormatter={v => formatINR(v, true)} />
                    <Tooltip content={<CFTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" dataKey="rev_actual" name="Revenue (Actual)" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="rev_forecast" name="Revenue (Forecast)" stroke="#60a5fa" strokeDasharray="5 5" fill="none" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="exp_actual" name="Expense (Actual)" stroke="#f59e0b" fill="url(#expGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="exp_forecast" name="Expense (Forecast)" stroke="#fbbf24" strokeDasharray="5 5" fill="none" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* P&L Net Cash Trend Chart */}
            {forecastData.length > 0 && (
              <div className="card lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-white">Net Cash (P&L) Trend</h2>
                  <span className="text-indigo-400 text-xs">Past & Forecast</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={forecastData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} width={64} tickFormatter={v => formatINR(v, true)} />
                    <Tooltip content={<CFTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="net_actual" name="Net Cash (Actual)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="net_forecast" name="Net Cash (Forecast)" fill="#34d399" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Bottom row: Receivables aging + Quick links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Receivables aging buckets */}
            {receivables?.buckets && (
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Receivables Aging</h2>
                  <a href="/business/receivables" className="text-indigo-400 text-xs hover:text-indigo-300 flex items-center gap-1">
                    Details <ArrowRight size={11} />
                  </a>
                </div>
                {Object.entries(receivables.buckets).map(([key, bucket]: [string, any]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-slate-500 text-xs w-36 shrink-0">{bucket.label}</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        key === 'current' ? 'bg-emerald-500'
                        : key === '31_60' ? 'bg-amber-500'
                        : 'bg-red-500'
                      }`} style={{
                        width: receivables.total_outstanding > 0
                          ? `${Math.min(100, (bucket.total / receivables.total_outstanding) * 100)}%`
                          : '0%',
                      }} />
                    </div>
                    <span className="text-white text-xs font-mono w-20 text-right shrink-0">
                      {formatINR(bucket.total, true)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick navigation */}
            <div className="card space-y-3">
              <h2 className="text-sm font-semibold text-white">Quick Access</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { href: '/business/invoices',     icon: '🧾', label: 'Invoices' },
                  { href: '/business/expenses',     icon: '💸', label: 'Expenses' },
                  { href: '/business/payroll',      icon: '👥', label: 'Payroll' },
                  { href: '/business/gst',          icon: '📋', label: 'GST & Tax' },
                  { href: '/business/reports',      icon: '📊', label: 'Reports' },
                  { href: '/business/intelligence', icon: '🤖', label: 'ML Insights' },
                  { href: '/business/ai-cfo',       icon: '💬', label: 'AI CFO' },
                  { href: '/business/accounting',   icon: '📒', label: 'Accounts' },
                ].map(item => (
                  <a key={item.href} href={item.href}
                    className="flex items-center gap-2 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/30 transition-all text-sm text-slate-300 hover:text-white">
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
