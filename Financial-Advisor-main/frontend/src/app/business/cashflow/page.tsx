'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessFinance as api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { RefreshCw, TrendingDown, TrendingUp, Gauge, AlertTriangle } from 'lucide-react';

function MetricCard({ label, value, sub, color = 'text-white' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="metric-card py-4 px-5">
      <p className="metric-label">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

const CFTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs shadow-2xl space-y-1">
      <p className="text-slate-400 font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-6" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-mono font-semibold">{formatINR(p.value, true)}</span>
        </div>
      ))}
    </div>
  );
};

export default function CashFlowPage() {
  const [orgId, setOrgId]     = useState<string | null>(null);
  const [cf, setCF]           = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<'statement' | 'metrics'>('metrics');

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const [cfData, metricsData]: any[] = await Promise.all([
        api.getCashFlow(id),
        api.getCashMetrics(id),
      ]);
      setCF(cfData);
      setMetrics(metricsData);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { if (orgId) load(orgId); }, [orgId]);

  if (!orgId) return (
    <div className="p-8 text-center"><div className="card max-w-md mx-auto py-12">
      <p className="text-slate-400 mb-4">No organisation found.</p>
      <a href="/business/profile" className="btn-primary">Set Up Business</a>
    </div></div>
  );

  const runwayWarning = metrics?.runway_months !== null && metrics?.runway_months < 3;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Cash Flow</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Burn rate · Runway · Operating / Investing / Financing
          </p>
        </div>
        <div className="flex gap-2">
          {(['metrics', 'statement'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={tab === t ? 'btn-primary py-1.5 px-4 text-sm' : 'btn-secondary py-1.5 px-4 text-sm'}>
              {t === 'metrics' ? '📈 Metrics' : '📋 Statement'}
            </button>
          ))}
          <button onClick={() => orgId && load(orgId)} disabled={loading}
            className="btn-secondary py-1.5 px-3">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Runway warning */}
      {runwayWarning && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-200 text-sm">
            <span className="font-semibold">Low runway warning:</span> At current burn rate, cash reserves will last approximately{' '}
            <span className="font-bold">{metrics?.runway_label}</span>. Review expenses or seek additional funding.
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
      ) : tab === 'metrics' ? (
        <>
          {/* KPI row */}
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label="Cash Balance"
                value={formatINR(metrics.cash_balance, true)}
                color={metrics.cash_balance > 0 ? 'text-white' : 'text-red-400'}
              />
              <MetricCard
                label="Monthly Burn Rate"
                value={metrics.burn_rate > 0 ? formatINR(metrics.burn_rate, true) : '—'}
                sub="avg last 3 months"
                color="text-amber-400"
              />
              <MetricCard
                label="Runway"
                value={metrics.runway_label || '—'}
                color={
                  !metrics.runway_months ? 'text-emerald-400'
                  : metrics.runway_months < 3 ? 'text-red-400'
                  : metrics.runway_months < 6 ? 'text-amber-400'
                  : 'text-emerald-400'
                }
              />
              <MetricCard
                label="Free Cash Flow"
                value={cf ? formatINR(cf.free_cash_flow, true) : '—'}
                color={cf?.free_cash_flow >= 0 ? 'text-emerald-400' : 'text-red-400'}
              />
            </div>
          )}

          {/* Monthly trend chart */}
          {metrics?.monthly_trend?.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-4">Monthly Cash Flow Trend</h2>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={metrics.monthly_trend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} />
                  <YAxis tickFormatter={v => formatINR(v, true)} tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} width={64} />
                  <Tooltip content={<CFTooltip />} />
                  <Legend formatter={v => v === 'cash_in' ? 'Cash In' : v === 'cash_out' ? 'Cash Out' : 'Net CF'} />
                  <Area type="monotone" dataKey="cash_in" name="cash_in" stroke="#10b981" fill="url(#inGrad)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="cash_out" name="cash_out" stroke="#ef4444" fill="url(#outGrad)" strokeWidth={2} dot={false} />
                  <Bar dataKey="net_cf" name="net_cf" fill="#6366f1" radius={[3, 3, 0, 0]} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Burn rate gauge */}
          {metrics?.burn_rate > 0 && metrics?.cash_balance > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-4">Cash Runway Projection</h2>
              <div className="flex items-center gap-6">
                <div className="flex-1 h-4 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      !metrics.runway_months || metrics.runway_months > 12 ? 'bg-emerald-500'
                      : metrics.runway_months > 6 ? 'bg-amber-500'
                      : 'bg-red-500'
                    }`}
                    style={{
                      width: `${Math.min(100, ((metrics.runway_months || 12) / 12) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xl font-bold ${
                    !metrics.runway_months || metrics.runway_months > 12 ? 'text-emerald-400'
                    : metrics.runway_months > 6 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {metrics.runway_label}
                  </p>
                  <p className="text-slate-500 text-xs">at {formatINR(metrics.burn_rate, true)}/month burn</p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Cash Flow Statement */
        cf && (
          <div className="space-y-4">
            {/* Opening / Closing */}
            <div className="grid grid-cols-2 gap-4">
              <div className="metric-card py-4">
                <p className="metric-label">Opening Cash</p>
                <p className="metric-value">{formatINR(cf.opening_cash, true)}</p>
              </div>
              <div className="metric-card py-4">
                <p className="metric-label">Closing Cash</p>
                <p className={`text-2xl font-bold mt-1 ${cf.closing_cash >= 0 ? 'text-white' : 'text-red-400'}`}>
                  {formatINR(cf.closing_cash, true)}
                </p>
              </div>
            </div>

            {/* Three sections */}
            {[
              { key: 'operating', label: '⚙️ Operating Activities',  color: '#6366f1' },
              { key: 'investing', label: '📦 Investing Activities',  color: '#8b5cf6' },
              { key: 'financing', label: '🏦 Financing Activities',  color: '#06b6d4' },
            ].map(({ key, label, color }) => {
              const section = (cf as any)[key];
              return (
                <div key={key} className="card space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">{label}</h2>
                    <span
                      className={`font-mono font-bold text-sm ${section.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      style={{}}>
                      {section.net >= 0 ? '+' : ''}{formatINR(section.net)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/20 p-3">
                      <p className="text-emerald-400 text-xs uppercase tracking-wider">Inflow</p>
                      <p className="text-white font-mono font-semibold mt-1">{formatINR(section.inflow)}</p>
                    </div>
                    <div className="rounded-xl bg-red-950/30 border border-red-500/20 p-3">
                      <p className="text-red-400 text-xs uppercase tracking-wider">Outflow</p>
                      <p className="text-white font-mono font-semibold mt-1">{formatINR(section.outflow)}</p>
                    </div>
                  </div>
                  {section.lines?.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {section.lines.slice(0, 5).map((l: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-400 truncate max-w-xs">{l.label}</span>
                          <span className={`font-mono ml-4 shrink-0 ${l.type === 'inflow' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {l.type === 'inflow' ? '+' : '-'}{formatINR(l.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Net */}
            <div className={`card flex items-center justify-between py-5 ${
              cf.net_cash_flow >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'
            }`}>
              <span className="text-white font-semibold">Net Cash Flow</span>
              <span className={`font-mono font-bold text-xl ${cf.net_cash_flow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {cf.net_cash_flow >= 0 ? '+' : ''}{formatINR(cf.net_cash_flow)}
              </span>
            </div>

            <p className="text-slate-600 text-xs text-center">
              Period: {cf.period_start?.slice(0, 10)} → {cf.period_end?.slice(0, 10)}
            </p>
          </div>
        )
      )}
    </div>
  );
}
