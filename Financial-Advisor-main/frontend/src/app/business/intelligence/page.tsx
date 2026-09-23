'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessML } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import {
  TrendingUp, AlertTriangle, ShieldCheck, Activity,
  BrainCircuit, Search, CheckCircle2, DollarSign, RefreshCw,
  Play, Sliders, X, XCircle, HelpCircle
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// ── Health Score Ring ────────────────────────────────────────────────────────
function HealthScoreRing({ score }: { score: number }) {
  const max = 100;
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / max) * circ;
  const color = score >= 80 ? '#3b82f6' : score >= 60 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center justify-center">
      <div className="relative w-28 h-28">
        <svg className="transform -rotate-90 w-28 h-28">
          <circle cx="56" cy="56" r={radius} stroke="rgb(51,65,85)" strokeWidth="8" fill="none" />
          <circle cx="56" cy="56" r={radius}
            stroke={color} strokeWidth="8" fill="none"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{score}</span>
          <span className="text-xs text-slate-400">/100</span>
        </div>
      </div>
    </div>
  );
}

// ── Credit risk score ring ────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const max = 1000;
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / max) * circ;
  const color = score >= 750 ? '#10b981' : score >= 500 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center justify-center">
      <div className="relative w-28 h-28">
        <svg className="transform -rotate-90 w-28 h-28">
          <circle cx="56" cy="56" r={radius} stroke="rgb(51,65,85)" strokeWidth="8" fill="none" />
          <circle cx="56" cy="56" r={radius}
            stroke={color} strokeWidth="8" fill="none"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{score}</span>
          <span className="text-xs text-slate-400">/1000</span>
        </div>
      </div>
    </div>
  );
}

// ── Forecast chart tooltip ────────────────────────────────────────────────────
const ForecastTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs shadow-2xl space-y-1">
      <p className="text-slate-400 font-medium mb-1">{label}</p>
      {payload.map((p: any) => p.value != null && (
        <div key={p.name} className="flex justify-between gap-6" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-mono font-semibold">{formatINR(p.value, true)}</span>
        </div>
      ))}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BusinessIntelligencePage() {
  const [orgId, setOrgId]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [forecast, setForecast]   = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [creditRisk, setCreditRisk] = useState<any>(null);
  const [healthScore, setHealthScore] = useState<any>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [errors, setErrors]       = useState<Record<string, string>>({});

  // Scenario state
  const [revChange, setRevChange] = useState('0');
  const [expChange, setExpChange] = useState('0');
  const [newFixedCost, setNewFixedCost] = useState('0');
  const [scenarioForecast, setScenarioForecast] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);

  // Resolve org first
  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadMLData = async (id: string) => {
    setLoading(true);
    const newErrors: Record<string, string> = {};

    const [fData, aData, cData, hData] = await Promise.allSettled([
      businessML.getForecast(id),
      businessML.getAnomalies(id),
      businessML.getCreditRisk(id),
      businessML.getHealthScore(id),
    ]);

    if (fData.status === 'fulfilled') setForecast(fData.value);
    else newErrors.forecast = (fData.reason as any)?.message || 'Forecast unavailable';

    if (aData.status === 'fulfilled') setAnomalies((aData.value as any) || []);
    else newErrors.anomalies = (aData.reason as any)?.message || 'Anomaly scan failed';

    if (cData.status === 'fulfilled') setCreditRisk(cData.value);
    else newErrors.credit = (cData.reason as any)?.message || 'Credit risk unavailable';

    if (hData.status === 'fulfilled') setHealthScore(hData.value);
    else newErrors.health = (hData.reason as any)?.message || 'Health score unavailable';

    setErrors(newErrors);
    setLoading(false);
  };

  useEffect(() => { if (orgId) loadMLData(orgId); }, [orgId]);

  const handleResolveAnomaly = async (anomalyId: string) => {
    if (!orgId) return;
    setResolvingId(anomalyId);
    try {
      await businessML.resolveAnomaly(orgId, anomalyId, { resolution_note: 'Reviewed by user' });
      setAnomalies(prev => prev.filter((a: any) => a.id !== anomalyId));
    } catch {}
    setResolvingId(null);
  };

  const handleSimulate = async () => {
    if (!orgId) return;
    setSimulating(true);
    try {
      const res = await businessML.simulateScenario(orgId, {
        revenue_change_pct: parseFloat(revChange) || 0,
        expense_change_pct: parseFloat(expChange) || 0,
        new_fixed_cost_monthly: parseFloat(newFixedCost) || 0,
      });
      setScenarioForecast(res);
    } catch (err: any) {
      alert(err.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  const clearScenario = () => {
    setScenarioForecast(null);
    setRevChange('0');
    setExpChange('0');
    setNewFixedCost('0');
  };

  if (!orgId && !loading) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  // Merge historical + forecast into chart series
  const activeForecast = scenarioForecast || forecast;
  
  const chartData = activeForecast?.revenue_forecast?.map((rev: any, i: number) => {
    const exp = activeForecast.expense_forecast?.[i] || {};
    return {
      date: rev.date,
      'Revenue (Actual)':   rev.actual_value   ?? null,
      'Revenue (Forecast)': rev.forecast_value ?? null,
      'Expense (Actual)':   exp.actual_value   ?? null,
      'Expense (Forecast)': exp.forecast_value ?? null,
    };
  }) || [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BrainCircuit size={24} className="text-indigo-400" />
            Business Intelligence
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            ML forecasting · Anomaly detection · Credit risk — all from real business data
          </p>
        </div>
        {orgId && (
          <button onClick={() => loadMLData(orgId)} disabled={loading}
            className="btn-secondary text-sm py-1.5 px-3">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        )}
      </div>

      {/* Disclaimer */}
      <div className="rounded-2xl border border-slate-700 bg-slate-800/30 p-3 text-xs text-slate-400">
        <span className="font-medium text-slate-300">ℹ️ ML Disclaimer:</span> Forecasts use a linear trend model on historical journal data.
        Credit risk is a weighted indicator — not an official credit score.
        All outputs are for planning purposes only.
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column: Health Score + Credit Risk + Anomalies */}
          <div className="lg:col-span-1 space-y-6">

            {/* Business Health Score */}
            <div className="card space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Activity size={16} className="text-blue-400" />
                Business Health Score
              </h2>

              {errors.health ? (
                <p className="text-slate-500 text-sm text-center py-4">{errors.health}</p>
              ) : healthScore ? (
                <>
                  <HealthScoreRing score={healthScore.score} />
                  <div className="text-center">
                    <span className={`badge text-sm border font-semibold ${
                      healthScore.status === 'Excellent' || healthScore.status === 'Good'
                        ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                        : healthScore.status === 'Fair'
                        ? 'text-amber-400  bg-amber-400/10  border-amber-400/20'
                        : 'text-red-400    bg-red-400/10    border-red-400/20'
                    }`}>
                      {healthScore.status}
                    </span>
                  </div>

                  <div className="space-y-3 mt-4">
                    {healthScore.components.map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{c.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={
                            c.impact === 'Positive' ? 'text-emerald-400' :
                            c.impact === 'Negative' ? 'text-red-400' : 'text-slate-400'
                          }>
                            {c.impact === 'Positive' ? '↑' : c.impact === 'Negative' ? '↓' : '—'} {c.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-slate-500 text-sm text-center py-4">No data</p>
              )}
            </div>

            {/* Credit Risk */}
            <div className="card space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldCheck size={16} className="text-blue-400" />
                Predicted Credit Risk Indicator
              </h2>

              {errors.credit ? (
                <p className="text-slate-500 text-sm text-center py-4">{errors.credit}</p>
              ) : creditRisk ? (
                <>
                  <ScoreRing score={creditRisk.score} />
                  <div className="text-center">
                    <span className={`badge text-sm border font-semibold ${
                      creditRisk.risk_category === 'Low Risk'
                        ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                        : creditRisk.risk_category === 'Medium Risk'
                        ? 'text-amber-400  bg-amber-400/10  border-amber-400/20'
                        : 'text-red-400    bg-red-400/10    border-red-400/20'
                    }`}>
                      {creditRisk.risk_category}
                    </span>
                  </div>

                  {creditRisk.positive_factors.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Positive Factors</p>
                      <ul className="space-y-1.5">
                        {creditRisk.positive_factors.map((f: string, i: number) => (
                          <li key={i} className="text-xs text-emerald-400 flex items-start gap-2">
                            <CheckCircle2 size={13} className="mt-0.5 shrink-0" />{f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {creditRisk.risk_factors.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Risk Factors</p>
                      <ul className="space-y-1.5">
                        {creditRisk.risk_factors.map((f: string, i: number) => (
                          <li key={i} className="text-xs text-red-400 flex items-start gap-2">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />{f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-slate-600 text-[10px] text-center">
                    Not an official credit score. For planning use only.
                  </p>
                </>
              ) : (
                <div className="text-sm text-slate-500 text-center py-6">
                  <DollarSign size={28} className="mx-auto mb-2 text-slate-700" />
                  Not enough financial data to compute score.
                </div>
              )}
            </div>

            {/* Anomalies */}
            <div className="card space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Search size={16} className="text-amber-400" />
                Expense Anomalies
                {anomalies.length > 0 && (
                  <span className="ml-auto badge text-xs border text-red-400 bg-red-400/10 border-red-400/20">
                    {anomalies.length}
                  </span>
                )}
              </h2>

              {errors.anomalies ? (
                <p className="text-slate-500 text-sm text-center py-4">{errors.anomalies}</p>
              ) : anomalies.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <CheckCircle2 size={28} className="text-emerald-400 mx-auto" />
                  <p className="text-slate-400 text-sm">No anomalies in recent expenses</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {anomalies.map((a: any) => (
                    <div key={a.id} className="rounded-xl bg-slate-800/50 border border-slate-700 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{formatDate(a.date)}</span>
                        <span className={`badge text-[10px] border ${
                          a.severity === 'HIGH'
                            ? 'text-red-400 bg-red-400/10 border-red-400/20'
                            : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                        }`}>
                          {a.severity} · Z={a.z_score}
                        </span>
                      </div>
                      <p className="text-white font-medium text-sm">
                        {formatINR(a.amount)} — {a.category.replace(/_/g, ' ')}
                      </p>
                      <p className="text-slate-400 text-xs">{a.description}</p>
                      <p className="text-amber-300 text-xs bg-amber-500/5 rounded-lg p-2">{a.reason}</p>
                      <button
                        onClick={() => handleResolveAnomaly(a.id)}
                        disabled={resolvingId === a.id}
                        className="w-full btn-secondary text-xs py-1.5 disabled:opacity-50">
                        {resolvingId === a.id ? 'Resolving...' : '✓ Acknowledge'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Forecast chart */}
          <div className="lg:col-span-2">
            <div className="card h-full min-h-[520px] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <TrendingUp size={16} className={scenarioForecast ? 'text-amber-400' : 'text-indigo-400'} />
                  {scenarioForecast ? 'Simulated Revenue & Expense Forecast' : 'Revenue & Expense Forecast'}
                </h2>
                <span className={`badge text-[11px] border ${scenarioForecast ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20'}`}>
                  {scenarioForecast ? 'Scenario Active' : 'Linear Trend · 3-month horizon'}
                </span>
              </div>

              {errors.forecast ? (
                <div className="flex-1 flex items-center justify-center py-20">
                  <div className="text-center space-y-2">
                    <DollarSign size={32} className="text-slate-700 mx-auto" />
                    <p className="text-slate-500 text-sm">{errors.forecast}</p>
                    <p className="text-slate-600 text-xs">Post journal entries to build historical data for forecasting.</p>
                  </div>
                </div>
              ) : chartData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={380}>
                    <LineChart data={chartData} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }}
                        tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }}
                        tickLine={false} axisLine={false} width={70}
                        tickFormatter={v => formatINR(v, true)} />
                      <Tooltip content={<ForecastTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />

                      <Line type="monotone" dataKey="Revenue (Actual)"
                        stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="Revenue (Forecast)"
                        stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                      <Line type="monotone" dataKey="Expense (Actual)"
                        stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="Expense (Forecast)"
                        stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>

                  {/* Forecast table for the projected months */}
                  {forecast?.revenue_forecast && (() => {
                    const projected = forecast.revenue_forecast.filter((r: any) => r.forecast_value != null);
                    if (projected.length === 0) return null;
                    return (
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">3-Month Projection</p>
                        <div className="grid grid-cols-3 gap-3">
                          {projected.map((r: any, i: number) => {
                            const e = forecast.expense_forecast?.find((x: any) => x.date === r.date);
                            const n = forecast.net_cash_forecast?.find((x: any) => x.date === r.date);
                            return (
                              <div key={r.date} className="rounded-xl bg-slate-800/50 border border-slate-800 p-3 text-xs">
                                <p className="text-slate-400 font-medium mb-2">{r.date}</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Revenue</span>
                                    <span className="text-emerald-400 font-mono">{formatINR(r.forecast_value, true)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Expenses</span>
                                    <span className="text-red-400 font-mono">{formatINR(e?.forecast_value || 0, true)}</span>
                                  </div>
                                  <div className="flex justify-between border-t border-slate-700 pt-1">
                                    <span className="text-slate-400 font-medium">Net</span>
                                    <span className={`font-mono font-semibold ${(n?.forecast_value || 0) >= 0 ? 'text-white' : 'text-red-400'}`}>
                                      {formatINR(n?.forecast_value || 0, true)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center py-20">
                  <div className="text-center space-y-2">
                    <DollarSign size={32} className="text-slate-700 mx-auto" />
                    <p className="text-slate-500 text-sm">No historical data available for forecasting.</p>
                    <p className="text-slate-600 text-xs">Post journal entries to build your financial history.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Scenario Simulator */}
            <div className="card mt-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sliders size={16} className="text-indigo-400" />
                  Scenario Simulator (Decision Support)
                </h2>
                {scenarioForecast && (
                  <button onClick={clearScenario} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                    <X size={12} /> Clear
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="input-label">Revenue Change (%)</label>
                  <input type="number" step="0.1" className="input" value={revChange} onChange={e => setRevChange(e.target.value)} placeholder="e.g. -15 for 15% drop" />
                </div>
                <div>
                  <label className="input-label">Expense Change (%)</label>
                  <input type="number" step="0.1" className="input" value={expChange} onChange={e => setExpChange(e.target.value)} placeholder="e.g. 10 for 10% increase" />
                </div>
                <div>
                  <label className="input-label">New Fixed Cost (₹/mo)</label>
                  <input type="number" className="input" value={newFixedCost} onChange={e => setNewFixedCost(e.target.value)} placeholder="e.g. 50000" />
                </div>
              </div>
              
              <div className="flex justify-end">
                <button onClick={handleSimulate} disabled={simulating} className="btn-primary flex items-center gap-2">
                  {simulating ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                  Run Simulation
                </button>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
