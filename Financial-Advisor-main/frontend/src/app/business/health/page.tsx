'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessFinance as api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import {
  RefreshCw, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, ShieldCheck, Gauge
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Tooltip as RTooltip
} from 'recharts';

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius = 52;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color  = score >= 80 ? '#10b981' : score >= 65 ? '#6366f1'
               : score >= 50 ? '#f59e0b' : score >= 35 ? '#f97316' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg className="transform -rotate-90 w-36 h-36">
          <circle cx="72" cy="72" r={radius} stroke="rgb(51,65,85)" strokeWidth="10" fill="none" />
          <circle cx="72" cy="72" r={radius}
            stroke={color} strokeWidth="10" fill="none"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-white">{score}</span>
          <span className="text-slate-400 text-sm">/100</span>
        </div>
      </div>
      <span className={`text-2xl font-bold px-4 py-1 rounded-xl ${
        grade === 'A' ? 'text-emerald-400 bg-emerald-400/10'
        : grade === 'B' ? 'text-indigo-400 bg-indigo-400/10'
        : grade === 'C' ? 'text-amber-400 bg-amber-400/10'
        : grade === 'D' ? 'text-orange-400 bg-orange-400/10'
        : 'text-red-400 bg-red-400/10'
      }`}>Grade {grade}</span>
    </div>
  );
}

// ── Component bar ─────────────────────────────────────────────────────────────
function ComponentBar({ label, score, max, value, unit, note }: {
  label: string; score: number; max: number;
  value: number | null; unit: string; note: string;
}) {
  const pct   = Math.round((score / max) * 100);
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500'
              : pct >= 25 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-300 font-medium">{label}</span>
        <div className="flex items-center gap-3">
          {value !== null && value !== undefined && (
            <span className="text-slate-500 text-xs font-mono">{value}{unit}</span>
          )}
          <span className="text-white font-semibold text-xs w-12 text-right">
            {score}/{max} pts
          </span>
        </div>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }} />
      </div>
      <p className="text-slate-500 text-xs">{note}</p>
    </div>
  );
}

const COMPONENT_LABELS: Record<string, string> = {
  profitability:     'Profitability',
  liquidity:         'Liquidity',
  debt:              'Debt',
  cash_runway:       'Cash Runway',
  receivables:       'Receivables',
  expense_growth:    'Expense Growth',
  revenue_stability: 'Revenue Stability',
};

export default function BusinessHealthPage() {
  const [orgId, setOrgId]   = useState<string | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const [h, hist]: any[] = await Promise.all([
        api.getBusinessHealthScore(id),
        api.getHealthScoreHistory(id, 12),
      ]);
      setHealth(h);
      setHistory(hist || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { if (orgId) load(orgId); }, [orgId]);

  if (!orgId && !loading) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  // Radar chart data
  const radarData = health ? Object.entries(health.components).map(([key, comp]: [string, any]) => ({
    subject: COMPONENT_LABELS[key] || key,
    score:   Math.round((comp.score / comp.max) * 100),
    fullMark: 100,
  })) : [];

  // History trend data
  const historyData = history.map(h => ({
    date:  h.computed_at?.slice(0, 10) || '',
    score: h.pct_score,
    grade: h.grade,
  }));

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck size={22} className="text-indigo-400" />
            Business Financial Health
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Composite score across 7 financial dimensions
          </p>
        </div>
        {orgId && (
          <button onClick={() => load(orgId)} disabled={loading}
            className="btn-secondary text-sm py-1.5 px-3">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      ) : !health ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p className="text-slate-400 text-sm">No financial data available yet.</p>
        </div>
      ) : (
        <>
          {/* Top section: Score ring + summary + radar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Score */}
            <div className="card flex flex-col items-center justify-center py-6 gap-4">
              <ScoreRing score={health.pct_score} grade={health.grade} />
              <p className="text-slate-300 text-sm text-center font-medium">{health.summary}</p>
              <p className="text-slate-600 text-xs text-center">
                {health.score}/{health.max_score} weighted points
              </p>
            </div>

            {/* Radar chart */}
            <div className="card md:col-span-2">
              <h2 className="text-sm font-semibold text-white mb-3">Score by Dimension</h2>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                  <PolarGrid stroke="rgb(51,65,85)" />
                  <PolarAngleAxis dataKey="subject"
                    tick={{ fill: 'rgb(148,163,184)', fontSize: 11 }} />
                  <Radar name="Score" dataKey="score" stroke="#6366f1" fill="#6366f1"
                    fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Strengths + Risks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {health.strengths?.length > 0 && (
              <div className="card border-emerald-500/20 bg-emerald-950/10 space-y-2">
                <h2 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                  <CheckCircle size={15} /> Key Strengths
                </h2>
                {health.strengths.map((s: string, i: number) => (
                  <p key={i} className="text-slate-300 text-sm flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>{s}
                  </p>
                ))}
              </div>
            )}
            {health.risks?.length > 0 && (
              <div className="card border-amber-500/20 bg-amber-950/10 space-y-2">
                <h2 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                  <AlertTriangle size={15} /> Areas to Improve
                </h2>
                {health.risks.map((r: string, i: number) => (
                  <p key={i} className="text-slate-300 text-sm flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">⚠</span>{r}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Component breakdown */}
          <div className="card space-y-5">
            <h2 className="text-sm font-semibold text-white">Component Breakdown</h2>
            {Object.entries(health.components).map(([key, comp]: [string, any]) => (
              <ComponentBar
                key={key}
                label={COMPONENT_LABELS[key] || key}
                score={comp.score}
                max={comp.max}
                value={comp.value}
                unit={comp.unit || ''}
                note={comp.note}
              />
            ))}
          </div>

          {/* Data snapshot */}
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-white">Data Snapshot</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {[
                ['Revenue',       formatINR(health.data_snapshot?.revenue || 0, true)],
                ['Net Profit',    formatINR(health.data_snapshot?.net_profit || 0, true)],
                ['Net Margin',    `${health.data_snapshot?.net_margin_pct || 0}%`],
                ['Cash Balance',  formatINR(health.data_snapshot?.cash_balance || 0, true)],
                ['Monthly Burn',  health.data_snapshot?.monthly_burn > 0
                                    ? formatINR(health.data_snapshot.monthly_burn, true)
                                    : '—'],
                ['Runway',        health.data_snapshot?.runway_months
                                    ? `${health.data_snapshot.runway_months} months`
                                    : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-slate-500 text-xs">{label}</span>
                  <span className="text-white font-semibold font-mono text-sm">{value}</span>
                </div>
              ))}
            </div>
            <p className="text-slate-600 text-xs">
              Generated: {health.generated_at?.slice(0, 19)?.replace('T', ' ')} UTC
            </p>
          </div>

          {/* History chart */}
          {historyData.length > 1 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-4">Health Score History</h2>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={historyData} margin={{ left: 0, right: 10, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }}
                    tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }}
                    tickLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ background: 'rgb(15,23,42)', border: '1px solid rgb(51,65,85)', borderRadius: 12 }}
                    formatter={(v: number) => [`${v}/100`, 'Health Score']}
                  />
                  <Line type="monotone" dataKey="score" stroke="#6366f1"
                    strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
