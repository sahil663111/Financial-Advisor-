'use client';

import { useEffect, useState } from 'react';
import { businessOrg as api, businessAccounting } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { CheckCircle, AlertCircle, RefreshCw, Download } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  ASSET:     'text-emerald-400',
  LIABILITY: 'text-red-400',
  EQUITY:    'text-purple-400',
  REVENUE:   'text-blue-400',
  EXPENSE:   'text-amber-400',
};

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

interface TBLine {
  account_code: string;
  account_name: string;
  account_type: string;
  debit_balance: number;
  credit_balance: number;
}

interface TrialBalance {
  org_id: string;
  as_of_date: string;
  lines: TBLine[];
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
  generated_at: string;
}

export default function TrialBalancePage() {
  const [orgId, setOrgId]       = useState<string | null>(null);
  const [tb, setTb]             = useState<TrialBalance | null>(null);
  const [loading, setLoading]   = useState(false);
  const [filterType, setFilter] = useState('');
  const [hideZero, setHideZero] = useState(true);

  useEffect(() => {
    api.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  useEffect(() => {
    if (orgId) loadTrialBalance();
  }, [orgId]);

  const loadTrialBalance = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data: any = await businessAccounting.getTrialBalance(orgId);
      setTb(data);
    } catch {}
    setLoading(false);
  };

  if (!orgId) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  const filteredLines = (tb?.lines || []).filter(l => {
    if (hideZero && l.debit_balance === 0 && l.credit_balance === 0) return false;
    if (filterType && l.account_type !== filterType) return false;
    return true;
  });

  // Group by account type for display
  const grouped: Record<string, TBLine[]> = {};
  for (const line of filteredLines) {
    if (!grouped[line.account_type]) grouped[line.account_type] = [];
    grouped[line.account_type].push(line);
  }

  const subtotals: Record<string, { debit: number; credit: number }> = {};
  for (const [type, lines] of Object.entries(grouped)) {
    subtotals[type] = {
      debit:  lines.reduce((s, l) => s + l.debit_balance, 0),
      credit: lines.reduce((s, l) => s + l.credit_balance, 0),
    };
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Trial Balance</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {tb ? `As of ${new Date(tb.as_of_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadTrialBalance} disabled={loading}
            className="btn-secondary text-sm py-1.5 px-3">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {orgId && (
            <button
              onClick={async () => {
                if (!orgId) return;
                try {
                  const { businessFinance } = await import('@/lib/api');
                  const blob = await businessFinance.exportTrialBalance(orgId);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `TrialBalance_${new Date().toISOString().slice(0,10)}.csv`;
                  a.click(); URL.revokeObjectURL(url);
                } catch (e: any) { alert(e.message || 'Export failed'); }
              }}
              className="btn-secondary text-sm py-1.5 px-3">
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Balance status banner */}
      {tb && (
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${
          tb.is_balanced
            ? 'bg-emerald-950/30 border-emerald-500/30'
            : 'bg-red-950/30 border-red-500/30'
        }`}>
          {tb.is_balanced
            ? <CheckCircle className="text-emerald-400 shrink-0" size={20} />
            : <AlertCircle className="text-red-400 shrink-0" size={20} />}
          <div>
            <p className={`font-semibold text-sm ${tb.is_balanced ? 'text-emerald-300' : 'text-red-300'}`}>
              {tb.is_balanced ? 'Trial balance is balanced' : 'Trial balance is NOT balanced'}
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              Total Debits: {formatINR(tb.total_debits)} &nbsp;·&nbsp; Total Credits: {formatINR(tb.total_credits)}
              {!tb.is_balanced && ` · Difference: ${formatINR(Math.abs(tb.total_debits - tb.total_credits))}`}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {tb && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {TYPE_ORDER.map(t => {
            const s = subtotals[t];
            const total = (s?.debit || 0) + (s?.credit || 0);
            return (
              <button
                key={t}
                onClick={() => setFilter(f => f === t ? '' : t)}
                className={`metric-card py-3 px-4 text-left transition-all ${filterType === t ? 'border-indigo-500/50' : ''}`}
              >
                <p className={`text-xs font-medium ${TYPE_COLORS[t]}`}>{t}</p>
                <p className="font-mono font-bold text-white text-sm mt-1">
                  {formatINR(total, true)}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer select-none">
          <input type="checkbox" className="accent-indigo-500"
            checked={hideZero} onChange={e => setHideZero(e.target.checked)} />
          Hide zero-balance accounts
        </label>
        {filterType && (
          <button onClick={() => setFilter('')} className="text-indigo-400 hover:text-indigo-300">
            Clear filter: {filterType} ×
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array(10).fill(0).map((_, i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
        </div>
      ) : !tb ? null : (
        <div className="card p-0 overflow-hidden">
          <table className="table w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="py-3 px-4 text-left w-24">Code</th>
                <th className="py-3 px-4 text-left">Account Name</th>
                <th className="py-3 px-4 text-left w-28 hidden md:table-cell">Type</th>
                <th className="py-3 px-4 text-right w-36">Debit (Dr)</th>
                <th className="py-3 px-4 text-right w-36">Credit (Cr)</th>
              </tr>
            </thead>
            <tbody>
              {TYPE_ORDER.filter(t => grouped[t]).map(type => (
                <>
                  {/* Type group header */}
                  <tr key={`hdr-${type}`} className="bg-slate-800/40">
                    <td colSpan={5} className="py-2 px-4">
                      <span className={`text-xs font-bold uppercase tracking-wider ${TYPE_COLORS[type]}`}>
                        {type}
                      </span>
                    </td>
                  </tr>

                  {/* Account rows */}
                  {(grouped[type] || []).map(line => (
                    <tr key={line.account_code} className="border-b border-slate-800/30 hover:bg-slate-800/10">
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-500">
                        {line.account_code}
                      </td>
                      <td className="py-2.5 px-4 text-slate-200 text-sm">{line.account_name}</td>
                      <td className="py-2.5 px-4 hidden md:table-cell">
                        <span className={`text-xs ${TYPE_COLORS[line.account_type]}`}>
                          {line.account_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm">
                        {line.debit_balance > 0
                          ? <span className="text-white">{formatINR(line.debit_balance)}</span>
                          : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm">
                        {line.credit_balance > 0
                          ? <span className="text-white">{formatINR(line.credit_balance)}</span>
                          : <span className="text-slate-700">—</span>}
                      </td>
                    </tr>
                  ))}

                  {/* Type subtotal */}
                  <tr key={`sub-${type}`} className="border-b border-slate-700 bg-slate-900">
                    <td colSpan={3} className="py-2 px-4 text-right text-xs text-slate-500 font-medium">
                      {type} subtotal
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-sm font-semibold text-slate-300">
                      {subtotals[type]?.debit > 0 ? formatINR(subtotals[type].debit) : '—'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-sm font-semibold text-slate-300">
                      {subtotals[type]?.credit > 0 ? formatINR(subtotals[type].credit) : '—'}
                    </td>
                  </tr>
                </>
              ))}

              {/* Grand total */}
              {tb && (
                <tr className="border-t-2 border-slate-600 bg-slate-800/60">
                  <td colSpan={3} className="py-3 px-4 text-right font-bold text-white">
                    TOTAL
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-lg text-white">
                    {formatINR(tb.total_debits)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-lg text-white">
                    {formatINR(tb.total_credits)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-slate-600 text-xs text-center">
        Trial Balance reflects current account balances. Refresh after posting new journal entries.
      </p>
    </div>
  );
}
