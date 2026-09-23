'use client';

import { useEffect, useState } from 'react';
import { businessOrg as api, businessAccounting } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import { Search, ArrowUpRight, ArrowDownLeft, Minus } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  ASSET:     'text-emerald-400',
  LIABILITY: 'text-red-400',
  EQUITY:    'text-purple-400',
  REVENUE:   'text-blue-400',
  EXPENSE:   'text-amber-400',
};

export default function LedgerPage() {
  const [orgId, setOrgId]           = useState<string | null>(null);
  const [accounts, setAccounts]     = useState<any[]>([]);
  const [selectedCode, setSelected] = useState('');
  const [ledger, setLedger]         = useState<any | null>(null);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');

  // Resolve org + load account list
  useEffect(() => {
    api.listOrganizations().then((orgs: any) => {
      if (!orgs?.length) return;
      const id = orgs[0].id || orgs[0]._id;
      setOrgId(id);
      api.getAccounts(id, false).then((accs: any) => setAccounts(accs || []));
    });
  }, []);

  const loadLedger = async (code: string) => {
    if (!orgId || !code) return;
    setLoading(true);
    setLedger(null);
    try {
      const params: any = {};
      if (startDate) params.start_date = new Date(startDate).toISOString();
      if (endDate)   params.end_date   = new Date(endDate).toISOString();
      const data: any = await businessAccounting.getLedger(orgId, code, params);
      setLedger(data);
    } catch {}
    setLoading(false);
  };

  const handleSelect = (code: string) => {
    setSelected(code);
    loadLedger(code);
  };

  const filteredAccounts = accounts.filter(a =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.code.includes(search)
  );

  if (!orgId) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">General Ledger</h1>
        <p className="text-slate-400 text-sm mt-0.5">Account-level transaction history with running balance</p>
      </div>

      <div className="flex gap-6 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Account list sidebar */}
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input className="input pl-8 text-sm py-2" placeholder="Search accounts..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto card p-2 space-y-0.5">
            {filteredAccounts.map(a => (
              <button
                key={a.code}
                onClick={() => handleSelect(a.code)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                  selectedCode === a.code
                    ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span className="font-mono text-xs text-slate-600">{a.code}</span>
                <p className="text-sm leading-tight mt-0.5 truncate">{a.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-[10px] font-medium ${TYPE_COLORS[a.account_type] || 'text-slate-500'}`}>
                    {a.account_type}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {formatINR(a.current_balance, true)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Ledger panel */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Date filters */}
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="input-label">From</label>
              <input type="date" className="input text-sm py-2" value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="input-label">To</label>
              <input type="date" className="input text-sm py-2" value={endDate}
                onChange={e => setEndDate(e.target.value)} />
            </div>
            {selectedCode && (
              <button onClick={() => loadLedger(selectedCode)} className="btn-secondary text-sm py-2">
                Apply
              </button>
            )}
          </div>

          {/* Ledger content */}
          {!selectedCode ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3">📖</div>
                <p className="text-slate-400">Select an account from the list to view its ledger</p>
              </div>
            </div>
          ) : loading ? (
            <div className="space-y-2 flex-1">
              {Array(8).fill(0).map((_, i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
            </div>
          ) : !ledger ? (
            <div className="empty-state flex-1">
              <div className="empty-icon">📋</div>
              <p className="text-slate-400 text-sm">No transactions found for this account</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-h-0">
              {/* Account header */}
              <div className="card py-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-slate-500 text-xs font-mono">{ledger.account_code}</p>
                    <h2 className="text-lg font-bold text-white">{ledger.account_name}</h2>
                    <span className={`text-sm font-medium ${TYPE_COLORS[ledger.account_type]}`}>
                      {ledger.account_type}
                    </span>
                  </div>
                  <div className="flex gap-6">
                    <div className="text-center">
                      <p className="text-slate-500 text-xs">Opening</p>
                      <p className="font-mono font-semibold text-slate-200">{formatINR(ledger.opening_balance)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-500 text-xs">Total Debits</p>
                      <p className="font-mono font-semibold text-emerald-400">{formatINR(ledger.total_debits)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-500 text-xs">Total Credits</p>
                      <p className="font-mono font-semibold text-red-400">{formatINR(ledger.total_credits)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-500 text-xs">Closing</p>
                      <p className={`font-mono font-bold text-lg ${ledger.closing_balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                        {formatINR(ledger.closing_balance)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactions table */}
              {ledger.entries.length === 0 ? (
                <div className="empty-state py-8">
                  <div className="empty-icon">📋</div>
                  <p className="text-slate-400 text-sm">No transactions in the selected period</p>
                </div>
              ) : (
                <div className="card p-0 overflow-hidden">
                  <table className="table w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="py-3 px-4 text-left">Date</th>
                        <th className="py-3 px-4 text-left">Entry #</th>
                        <th className="py-3 px-4 text-left">Description</th>
                        <th className="py-3 px-4 text-right">Debit</th>
                        <th className="py-3 px-4 text-right">Credit</th>
                        <th className="py-3 px-4 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.entries.map((e: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                            {formatDate(e.date)}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-xs text-indigo-400">
                            {e.entry_number}
                          </td>
                          <td className="py-2.5 px-4 text-slate-200">
                            <p className="truncate max-w-xs">{e.description}</p>
                            {e.reference && (
                              <p className="text-slate-600 text-xs font-mono">{e.reference}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {e.debit > 0 ? (
                              <span className="text-emerald-400 flex items-center justify-end gap-1">
                                <ArrowUpRight size={12} />{formatINR(e.debit)}
                              </span>
                            ) : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {e.credit > 0 ? (
                              <span className="text-red-400 flex items-center justify-end gap-1">
                                <ArrowDownLeft size={12} />{formatINR(e.credit)}
                              </span>
                            ) : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-medium">
                            <span className={e.balance >= 0 ? 'text-white' : 'text-red-400'}>
                              {formatINR(Math.abs(e.balance))}{e.balance < 0 ? ' Cr' : ''}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
