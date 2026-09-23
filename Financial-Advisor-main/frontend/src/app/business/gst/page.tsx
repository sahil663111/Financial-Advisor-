'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessTax as api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { RefreshCw, AlertTriangle, Calendar, CheckCircle, Clock } from 'lucide-react';

export default function GSTPage() {
  const [orgId, setOrgId]       = useState<string | null>(null);
  const [summary, setSummary]   = useState<any>(null);
  const [monthly, setMonthly]   = useState<any[]>([]);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'overview' | 'calendar'>('overview');

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    Promise.all([
      api.getGSTSummary(orgId),
      api.getGSTMonthly(orgId, 6),
      api.getTaxCalendar(orgId, 3),
      api.getComplianceCalendar(orgId),
    ]).then(([s, m, c]: any[]) => {
      setSummary(s);
      setMonthly(m || []);
      setCalendar(c || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [orgId]);

  if (!orgId) return (
    <div className="p-8 text-center"><div className="card max-w-md mx-auto py-12">
      <p className="text-slate-400 mb-4">No organisation found.</p>
      <a href="/business/profile" className="btn-primary">Set Up Business</a>
    </div></div>
  );

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">GST & Tax</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            GST decision-support tool — verify on GSTN portal before filing
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <a href="/business/tax" className="btn-secondary py-1.5 px-3 text-xs text-indigo-400 hover:text-white">
            Full Tax & TDS Hub →
          </a>
          {(['overview', 'calendar'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={tab === t ? 'btn-primary py-1.5 px-4 text-sm' : 'btn-secondary py-1.5 px-4 text-sm'}>
              {t === 'overview' ? '📊 Overview' : '📅 Calendar'}
            </button>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">
          {summary?.disclaimer || 'This is a computed GST estimate. Verify all figures on the GSTN portal before filing returns.'}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      ) : tab === 'overview' ? (
        <>
          {/* KPI cards */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card py-5">
                <p className="text-slate-500 text-xs uppercase tracking-wider">Output GST (Sales)</p>
                <p className="text-2xl font-bold text-white mt-1">{formatINR(summary.output_gst?.total || 0, true)}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between"><span>CGST</span><span className="font-mono">{formatINR(summary.output_gst?.cgst || 0)}</span></div>
                  <div className="flex justify-between"><span>SGST</span><span className="font-mono">{formatINR(summary.output_gst?.sgst || 0)}</span></div>
                  <div className="flex justify-between"><span>IGST</span><span className="font-mono">{formatINR(summary.output_gst?.igst || 0)}</span></div>
                </div>
                <p className="text-slate-600 text-xs mt-2">{summary.output_gst?.invoice_count || 0} invoices</p>
              </div>

              <div className="card py-5">
                <p className="text-slate-500 text-xs uppercase tracking-wider">Input Tax Credit (ITC)</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{formatINR(summary.input_itc?.total || 0, true)}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between"><span>From Bills</span><span className="font-mono">{formatINR(summary.input_itc?.from_bills || 0)}</span></div>
                  <div className="flex justify-between"><span>From Expenses</span><span className="font-mono">{formatINR(summary.input_itc?.from_expenses || 0)}</span></div>
                </div>
                <p className="text-slate-600 text-xs mt-2">{summary.input_itc?.bill_count || 0} bills</p>
              </div>

              <div className={`card py-5 ${summary.net_liability > 0 ? 'border-red-500/20 bg-red-950/10' : 'border-emerald-500/20 bg-emerald-950/10'}`}>
                <p className="text-slate-500 text-xs uppercase tracking-wider">
                  {summary.is_refund_eligible ? 'ITC Excess (Refund Eligible)' : 'Net GST Liability'}
                </p>
                <p className={`text-2xl font-bold mt-1 ${summary.net_liability > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {formatINR(summary.net_liability > 0 ? summary.net_liability : summary.itc_excess, true)}
                </p>
                <p className="text-slate-400 text-xs mt-3">
                  {summary.is_refund_eligible
                    ? 'Input credit exceeds output tax — may be eligible for refund'
                    : 'Amount payable to government after ITC setoff'}
                </p>
              </div>
            </div>
          )}

          {/* Monthly trend chart */}
          {monthly.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-4">6-Month GST Trend</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} />
                  <YAxis tickFormatter={v => formatINR(v, true)} tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} width={64} />
                  <Tooltip
                    contentStyle={{ background: 'rgb(15,23,42)', border: '1px solid rgb(51,65,85)', borderRadius: 12 }}
                    formatter={(v: number, name: string) => [formatINR(v), name]}
                  />
                  <Legend formatter={v => v === 'output_gst' ? 'Output GST' : v === 'input_itc' ? 'Input ITC' : 'Net Liability'} />
                  <Bar dataKey="output_gst" name="output_gst" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="input_itc" name="input_itc" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="net_liability" name="net_liability" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      ) : (
        /* Compliance Calendar */
        <div className="space-y-3">
          <p className="text-slate-500 text-sm">
            Upcoming compliance deadlines. Dates are indicative — verify on official portals.
          </p>
          {calendar.length === 0 ? (
            <div className="empty-state py-10">
              <div className="empty-icon">📅</div>
              <p className="text-slate-400 text-sm">No upcoming deadlines found</p>
            </div>
          ) : (
            calendar.map((item: any) => (
              <div key={item.type + item.due_date}
                className={`card flex items-center justify-between gap-4 py-4 ${
                  item.status === 'DUE_SOON' ? 'border-red-500/30 bg-red-950/10' : ''
                }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    item.status === 'DUE_SOON' ? 'bg-red-600/20' : 'bg-indigo-600/20'
                  }`}>
                    {item.status === 'DUE_SOON'
                      ? <AlertTriangle size={18} className="text-red-400" />
                      : <Calendar size={18} className="text-indigo-400" />}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{item.label}</p>
                    <p className="text-slate-500 text-xs">{item.note}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white text-sm font-medium">
                    {new Date(item.due_date).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                  <p className={`text-xs font-semibold mt-0.5 ${
                    item.days_left <= 7 ? 'text-red-400' : item.days_left <= 15 ? 'text-amber-400' : 'text-slate-500'
                  }`}>
                    {item.days_left === 0 ? 'Due today' : `${item.days_left} days left`}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
