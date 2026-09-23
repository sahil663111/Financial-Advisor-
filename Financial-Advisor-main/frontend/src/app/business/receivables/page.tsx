'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessSales as api } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import { RefreshCw, AlertTriangle, TrendingDown } from 'lucide-react';

const BUCKET_COLORS = ['text-emerald-400', 'text-amber-400', 'text-orange-400', 'text-red-400'];
const BUCKET_KEYS = ['current', '31_60', '61_90', 'over_90'] as const;

export default function ReceivablesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [aging, setAging] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<typeof BUCKET_KEYS[number]>('current');

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try { const d: any = await api.getReceivablesAging(orgId); setAging(d); }
    catch {} finally { setLoading(false); }
  };

  if (!orgId) return (
    <div className="p-8 text-center"><div className="card max-w-md mx-auto py-12">
      <p className="text-slate-400 mb-4">No organisation found.</p>
      <a href="/business/profile" className="btn-primary">Set Up Business</a>
    </div></div>
  );

  const buckets = aging?.buckets || {};

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Receivables Aging</h1>
          <p className="text-slate-400 text-sm mt-0.5">Outstanding invoices grouped by days overdue</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-sm py-1.5 px-3">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && !aging ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : !aging ? null : (
        <>
          {/* AI Insight */}
          {aging.insight && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-200 text-sm">{aging.insight}</p>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {BUCKET_KEYS.map((key, i) => {
              const bucket = buckets[key];
              return (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`metric-card text-left py-4 px-5 transition-all ${activeTab === key ? 'border-indigo-500/60 shadow-indigo-500/10 shadow-lg' : ''}`}>
                  <p className={`text-xs font-medium ${BUCKET_COLORS[i]}`}>{bucket?.label || key}</p>
                  <p className="text-xl font-bold text-white mt-1">{formatINR(bucket?.total || 0, true)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{bucket?.invoices?.length || 0} invoice(s)</p>
                </button>
              );
            })}
          </div>

          {/* Total + high-risk */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card py-4">
              <p className="text-slate-500 text-xs uppercase tracking-wider">Total Outstanding</p>
              <p className="text-3xl font-bold text-white mt-1">{formatINR(aging.total_outstanding, true)}</p>
            </div>
            <div className={`card py-4 ${aging.high_risk_amount > 0 ? 'border-red-500/20 bg-red-950/10' : ''}`}>
              <div className="flex items-center gap-2">
                <TrendingDown size={16} className="text-red-400" />
                <p className="text-slate-500 text-xs uppercase tracking-wider">High-Risk (61+ days)</p>
              </div>
              <p className={`text-3xl font-bold mt-1 ${aging.high_risk_amount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {formatINR(aging.high_risk_amount, true)}
              </p>
            </div>
          </div>

          {/* Invoice table for active bucket */}
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">
              {buckets[activeTab]?.label || activeTab} — {buckets[activeTab]?.invoices?.length || 0} invoices
            </h2>
            {(buckets[activeTab]?.invoices || []).length === 0 ? (
              <div className="empty-state py-8">
                <div className="empty-icon">✅</div>
                <p className="text-slate-400 text-sm">No invoices in this bucket</p>
              </div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="table w-full text-sm">
                  <thead><tr className="border-b border-slate-800">
                    <th className="py-3 px-4 text-left">Invoice #</th>
                    <th className="py-3 px-4 text-left">Customer</th>
                    <th className="py-3 px-4 text-left hidden sm:table-cell">Issue Date</th>
                    <th className="py-3 px-4 text-left hidden sm:table-cell">Due Date</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Amount Due</th>
                    <th className="py-3 px-4 text-right hidden md:table-cell">Days Overdue</th>
                  </tr></thead>
                  <tbody>
                    {buckets[activeTab].invoices.map((inv: any) => (
                      <tr key={inv._id} className="border-b border-slate-800/40 hover:bg-slate-800/10">
                        <td className="py-2.5 px-4 font-mono text-xs text-indigo-400">{inv.invoice_number}</td>
                        <td className="py-2.5 px-4 text-slate-200">{inv.customer_name}</td>
                        <td className="py-2.5 px-4 text-slate-400 hidden sm:table-cell">{formatDate(inv.issue_date)}</td>
                        <td className="py-2.5 px-4 text-slate-400 hidden sm:table-cell">{formatDate(inv.due_date)}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-white">{formatINR(inv.total_amount)}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-amber-400 font-semibold">{formatINR(inv.amount_due)}</td>
                        <td className="py-2.5 px-4 text-right hidden md:table-cell">
                          <span className={`font-semibold ${inv.days_overdue > 60 ? 'text-red-400' : inv.days_overdue > 30 ? 'text-amber-400' : 'text-slate-400'}`}>
                            {inv.days_overdue > 0 ? `${inv.days_overdue}d` : 'Current'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top customers */}
          {aging.top_customers?.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Top Customers by Outstanding Balance</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {aging.top_customers.slice(0, 6).map((c: any) => (
                  <div key={c.customer_id} className="card-sm flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium truncate max-w-[140px]">{c.customer_name}</p>
                      <p className="text-slate-500 text-xs">{c.invoice_count} invoice(s)</p>
                    </div>
                    <p className="text-amber-400 font-mono font-semibold text-sm">{formatINR(c.total_outstanding, true)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
