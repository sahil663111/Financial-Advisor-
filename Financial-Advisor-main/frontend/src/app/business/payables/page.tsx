'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessSales as api } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import { RefreshCw, AlertTriangle, CreditCard, X, TrendingDown } from 'lucide-react';

const BUCKET_COLORS = ['text-emerald-400', 'text-amber-400', 'text-orange-400', 'text-red-400'];
const BUCKET_KEYS  = ['current', '31_60', '61_90', 'over_90'] as const;

// ── Pay bill modal ────────────────────────────────────────────────────────────
function PayModal({ bill, orgId, onDone, onCancel }: {
  bill: any; orgId: string; onDone: () => void; onCancel: () => void;
}) {
  const [amount, setAmount]   = useState(String(bill.amount_due));
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod]   = useState('BANK_TRANSFER');
  const [ref_, setRef]        = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.recordBillPayment(orgId, bill._id, {
        amount:         parseFloat(amount),
        payment_date:   new Date(date).toISOString(),
        payment_method: method,
        reference:      ref_ || null,
      });
      onDone();
    } catch (err: any) { setError(err.message || 'Payment failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Pay Vendor Bill</h2>
          <button onClick={onCancel} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <div className="rounded-xl bg-slate-800/50 p-3 mb-4 text-sm space-y-1">
          <p className="text-slate-400">Vendor: <span className="text-white font-medium">{bill.vendor_name}</span></p>
          <p className="text-slate-400">Bill #: <span className="font-mono text-indigo-400">{bill.bill_number || bill._id?.slice(-6)}</span></p>
          <p className="text-slate-400">Total: <span className="text-white font-semibold">{formatINR(bill.total_amount)}</span></p>
          <p className="text-slate-400">Amount Due: <span className="text-amber-400 font-semibold">{formatINR(bill.amount_due)}</span></p>
        </div>
        <form onSubmit={handlePay} className="space-y-4">
          <div>
            <label className="input-label">Amount (₹) *</label>
            <input type="number" step="0.01" className="input" value={amount}
              onChange={e => setAmount(e.target.value)}
              max={bill.amount_due} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Payment Date</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="input-label">Method</label>
              <select className="select" value={method} onChange={e => setMethod(e.target.value)}>
                {['BANK_TRANSFER','UPI','CASH','CHEQUE'].map(m => <option key={m}>{m.replace('_',' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="input-label">Reference (UTR / Cheque No)</label>
            <input className="input font-mono" value={ref_} onChange={e => setRef(e.target.value)} />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              <CreditCard size={14} />{saving ? 'Processing...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PayablesPage() {
  const [orgId, setOrgId]   = useState<string | null>(null);
  const [aging, setAging]   = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<typeof BUCKET_KEYS[number]>('current');
  const [payBill, setPayBill] = useState<any | null>(null);

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const d: any = await api.getPayablesAging(orgId);
      setAging(d);
    } catch {} finally { setLoading(false); }
  };

  if (!orgId) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  const buckets        = aging?.buckets || {};
  const upcoming       = aging?.upcoming_bills || [];
  const totalPayable   = aging?.total_payable || 0;
  const upcoming7Days  = aging?.upcoming_7_days || 0;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Accounts Payable</h1>
          <p className="text-slate-400 text-sm mt-0.5">Vendor bills grouped by days overdue</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-sm py-1.5 px-3">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && !aging ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      ) : !aging ? null : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {BUCKET_KEYS.map((key, i) => {
              const bucket = buckets[key];
              return (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`metric-card text-left py-4 px-5 transition-all ${activeTab === key ? 'border-indigo-500/60' : ''}`}>
                  <p className={`text-xs font-medium ${BUCKET_COLORS[i]}`}>{bucket?.label || key}</p>
                  <p className="text-xl font-bold text-white mt-1">{formatINR(bucket?.total || 0, true)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{bucket?.bills?.length || 0} bill(s)</p>
                </button>
              );
            })}
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card py-4">
              <p className="text-slate-500 text-xs uppercase tracking-wider">Total Payable</p>
              <p className="text-3xl font-bold text-white mt-1">{formatINR(totalPayable, true)}</p>
            </div>
            <div className={`card py-4 ${upcoming7Days > 0 ? 'border-amber-500/20 bg-amber-950/10' : ''}`}>
              <div className="flex items-center gap-2">
                <TrendingDown size={15} className="text-amber-400" />
                <p className="text-slate-500 text-xs uppercase tracking-wider">Due in 7 Days</p>
              </div>
              <p className={`text-3xl font-bold mt-1 ${upcoming7Days > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                {formatINR(upcoming7Days, true)}
              </p>
            </div>
          </div>

          {/* Upcoming bills alert */}
          {upcoming.length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <p className="text-amber-200 text-sm font-semibold">Bills due in the next 7 days</p>
              </div>
              {upcoming.slice(0, 5).map((b: any) => (
                <div key={b._id} className="flex items-center justify-between bg-slate-900/60 rounded-xl px-4 py-2.5 text-sm">
                  <div>
                    <p className="text-white font-medium">{b.vendor_name}</p>
                    <p className="text-slate-500 text-xs">Due: {formatDate(b.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-amber-400 font-mono font-semibold">{formatINR(b.amount_due, true)}</span>
                    {orgId && (
                      <button onClick={() => setPayBill(b)}
                        className="btn-primary text-xs py-1.5 px-3">
                        Pay
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bill table for active bucket */}
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">
              {buckets[activeTab]?.label || activeTab} — {buckets[activeTab]?.bills?.length || 0} bill(s)
            </h2>
            {(buckets[activeTab]?.bills || []).length === 0 ? (
              <div className="empty-state py-8">
                <div className="empty-icon">✅</div>
                <p className="text-slate-400 text-sm">No bills in this bucket</p>
              </div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="table w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="py-3 px-4 text-left">Bill #</th>
                      <th className="py-3 px-4 text-left">Vendor</th>
                      <th className="py-3 px-4 text-left hidden sm:table-cell">Bill Date</th>
                      <th className="py-3 px-4 text-left hidden sm:table-cell">Due Date</th>
                      <th className="py-3 px-4 text-left">Status</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-right">Due</th>
                      <th className="py-3 px-4 text-right hidden md:table-cell">Days</th>
                      <th className="py-3 px-4 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets[activeTab].bills.map((b: any) => (
                      <tr key={b._id} className="border-b border-slate-800/40 hover:bg-slate-800/10">
                        <td className="py-2.5 px-4 font-mono text-xs text-indigo-400">
                          {b.bill_number || b._id?.slice(-6)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-200">{b.vendor_name}</td>
                        <td className="py-2.5 px-4 text-slate-400 hidden sm:table-cell">{formatDate(b.bill_date)}</td>
                        <td className="py-2.5 px-4 text-slate-400 hidden sm:table-cell">{formatDate(b.due_date)}</td>
                        <td className="py-2.5 px-4">
                          <span className={`badge text-[11px] border ${
                            b.status === 'OVERDUE'  ? 'text-red-400 bg-red-400/10 border-red-400/20'
                            : b.status === 'PARTIAL' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                            : 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                          }`}>{b.status}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-white">{formatINR(b.total_amount)}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-amber-400 font-semibold">
                          {formatINR(b.amount_due)}
                        </td>
                        <td className="py-2.5 px-4 text-right hidden md:table-cell">
                          <span className={`font-semibold ${b.days_overdue > 60 ? 'text-red-400' : b.days_overdue > 30 ? 'text-amber-400' : 'text-slate-400'}`}>
                            {b.days_overdue > 0 ? `${b.days_overdue}d` : 'Current'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {orgId && ['PENDING','PARTIAL','OVERDUE'].includes(b.status) && (
                            <button onClick={() => setPayBill(b)}
                              className="btn-ghost p-1.5 text-emerald-400" title="Record Payment">
                              <CreditCard size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top vendors */}
          {aging.top_vendors?.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Top Vendors by Outstanding Balance</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {aging.top_vendors.slice(0, 6).map((v: any) => (
                  <div key={v.vendor_id} className="card-sm flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium truncate max-w-[140px]">{v.vendor_name}</p>
                      <p className="text-slate-500 text-xs">{v.bill_count} bill(s)</p>
                    </div>
                    <p className="text-amber-400 font-mono font-semibold text-sm">{formatINR(v.total_payable, true)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {payBill && orgId && (
        <PayModal
          bill={payBill} orgId={orgId}
          onDone={() => { setPayBill(null); load(); }}
          onCancel={() => setPayBill(null)}
        />
      )}
    </div>
  );
}
