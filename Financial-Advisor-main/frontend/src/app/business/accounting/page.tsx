'use client';

import { useEffect, useState, useMemo } from 'react';
import { businessOrg as api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { Plus, ChevronRight, ChevronDown, Search, Building2, X, Check } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Account {
  _id?: string;
  id?: string;
  code: string;
  name: string;
  account_type: string;
  account_sub_type: string;
  parent_code: string | null;
  current_balance: number;
  opening_balance: number;
  is_system_account: boolean;
  is_active: boolean;
  is_bank_account: boolean;
  description: string | null;
  children?: Account[];
}

const TYPE_COLORS: Record<string, string> = {
  ASSET: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  LIABILITY: 'text-red-400 bg-red-400/10 border-red-400/20',
  EQUITY: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  REVENUE: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  EXPENSE: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
};

const TYPE_EMOJI: Record<string, string> = {
  ASSET: '🏦', LIABILITY: '💳', EQUITY: '📊', REVENUE: '💰', EXPENSE: '💸',
};

const ACCOUNT_TYPES = ['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'];
const ACCOUNT_SUB_TYPES: Record<string, string[]> = {
  ASSET: ['CURRENT_ASSET','FIXED_ASSET','BANK','CASH','ACCOUNTS_RECEIVABLE','INVENTORY','OTHER_ASSET'],
  LIABILITY: ['CURRENT_LIABILITY','LONG_TERM_LIABILITY','ACCOUNTS_PAYABLE','TAX_PAYABLE','LOANS','OTHER_LIABILITY'],
  EQUITY: ['OWNERS_EQUITY','RETAINED_EARNINGS'],
  REVENUE: ['OPERATING_REVENUE','OTHER_INCOME'],
  EXPENSE: ['COST_OF_GOODS','OPERATING_EXPENSE','PAYROLL_EXPENSE','TAX_EXPENSE','DEPRECIATION','INTEREST_EXPENSE','OTHER_EXPENSE'],
};

// ── Tree row component ────────────────────────────────────────────────────────
function AccountRow({
  account, depth, onSelect,
}: {
  account: Account; depth: number; onSelect: (a: Account) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (account.children?.length ?? 0) > 0;
  const indent = depth * 20;

  return (
    <>
      <tr
        className={`border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors ${!account.is_active ? 'opacity-40' : ''}`}
        onClick={() => hasChildren ? setOpen(o => !o) : onSelect(account)}
      >
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
            {hasChildren ? (
              open ? <ChevronDown size={14} className="text-slate-500 shrink-0" />
                   : <ChevronRight size={14} className="text-slate-500 shrink-0" />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className={`font-mono text-xs ${depth === 0 ? 'text-indigo-400 font-bold' : 'text-slate-500'}`}>
              {account.code}
            </span>
            <span className={`text-sm ${depth === 0 ? 'text-white font-semibold' : 'text-slate-300'}`}>
              {account.name}
            </span>
            {account.is_system_account && (
              <span className="text-[10px] text-slate-600 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded-full">system</span>
            )}
            {account.is_bank_account && (
              <span className="text-[10px] text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 py-0.5 rounded-full">bank</span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-4 hidden md:table-cell">
          <span className={`badge text-[11px] border ${TYPE_COLORS[account.account_type]}`}>
            {account.account_type}
          </span>
        </td>
        <td className="py-2.5 px-4 text-right font-mono text-sm">
          {account.current_balance !== 0 ? (
            <span className={account.current_balance >= 0 ? 'text-slate-200' : 'text-red-400'}>
              {formatINR(Math.abs(account.current_balance), true)}
            </span>
          ) : (
            <span className="text-slate-700">—</span>
          )}
        </td>
        <td className="py-2.5 px-4 text-right">
          {!hasChildren && (
            <button
              onClick={e => { e.stopPropagation(); onSelect(account); }}
              className="btn-ghost text-xs py-1 px-2 opacity-0 group-hover:opacity-100"
            >
              Edit
            </button>
          )}
        </td>
      </tr>
      {open && hasChildren && account.children!.map(child => (
        <AccountRow key={child.code} account={child} depth={depth + 1} onSelect={onSelect} />
      ))}
    </>
  );
}

// ── Add account form ──────────────────────────────────────────────────────────
function AddAccountForm({ orgId, onCreated, onCancel }: {
  orgId: string; onCreated: (a: Account) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    code: '', name: '', account_type: 'EXPENSE', account_sub_type: 'OPERATING_EXPENSE',
    parent_code: '', description: '', opening_balance: 0, is_bank_account: false,
    bank_name: '', bank_account_number: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (f: string, v: any) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: any = { ...form };
      if (!payload.parent_code) delete payload.parent_code;
      if (!payload.description) delete payload.description;
      if (!payload.bank_name) delete payload.bank_name;
      if (!payload.bank_account_number) delete payload.bank_account_number;
      const created: any = await api.createAccount(orgId, payload);
      onCreated(created);
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">New Account</h2>
          <button onClick={onCancel} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Account Code *</label>
              <input className="input font-mono" placeholder="5299" value={form.code}
                onChange={e => set('code', e.target.value)} required />
            </div>
            <div>
              <label className="input-label">Account Name *</label>
              <input className="input" placeholder="Cloud Hosting" value={form.name}
                onChange={e => set('name', e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Type *</label>
              <select className="select" value={form.account_type}
                onChange={e => {
                  const t = e.target.value;
                  set('account_type', t);
                  set('account_sub_type', ACCOUNT_SUB_TYPES[t]?.[0] || '');
                }}>
                {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Sub Type *</label>
              <select className="select" value={form.account_sub_type}
                onChange={e => set('account_sub_type', e.target.value)}>
                {(ACCOUNT_SUB_TYPES[form.account_type] || []).map(s =>
                  <option key={s}>{s.replace(/_/g, ' ')}</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="input-label">Parent Account Code</label>
            <input className="input font-mono" placeholder="5200 (optional)" value={form.parent_code}
              onChange={e => set('parent_code', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Description</label>
            <input className="input" value={form.description}
              onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Opening Balance (₹)</label>
            <input className="input" type="number" step="0.01" value={form.opening_balance}
              onChange={e => set('opening_balance', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_bank" className="accent-indigo-500"
              checked={form.is_bank_account}
              onChange={e => set('is_bank_account', e.target.checked)} />
            <label htmlFor="is_bank" className="text-slate-300 text-sm">Bank Account</label>
          </div>
          {form.is_bank_account && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Bank Name</label>
                <input className="input" value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
              </div>
              <div>
                <label className="input-label">Account Number</label>
                <input className="input font-mono" value={form.bank_account_number}
                  onChange={e => set('bank_account_number', e.target.value)} />
              </div>
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChartOfAccountsPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<'tree' | 'flat'>('tree');

  // Load orgs
  useEffect(() => {
    api.listOrganizations().then((data: any) => {
      setOrgs(data);
      if (data.length > 0) {
        const id = data[0].id || data[0]._id;
        setActiveOrgId(id);
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  // Load accounts when org changes
  useEffect(() => {
    if (!activeOrgId) return;
    setLoading(true);
    api.getAccounts(activeOrgId, view === 'tree').then((data: any) => {
      setAccounts(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [activeOrgId, view]);

  const filteredFlat = useMemo(() => {
    if (view === 'tree') return accounts;
    return accounts.filter(a => {
      const matchSearch = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.code.includes(search);
      const matchType = !filterType || a.account_type === filterType;
      return matchSearch && matchType;
    });
  }, [accounts, search, filterType, view]);

  // Summary totals by type
  const totals = useMemo(() => {
    const flat = view === 'flat' ? accounts : [];
    return ACCOUNT_TYPES.reduce((acc, t) => {
      acc[t] = flat.filter(a => a.account_type === t)
        .reduce((s, a) => s + (a.current_balance || 0), 0);
      return acc;
    }, {} as Record<string, number>);
  }, [accounts, view]);

  const handleAccountCreated = (account: Account) => {
    setShowAdd(false);
    // Reload
    if (activeOrgId) {
      api.getAccounts(activeOrgId, view === 'tree').then((data: any) => setAccounts(data));
    }
  };

  if (!activeOrgId && !loading) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <Building2 className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
        <h2 className="text-white font-semibold mb-2">No Organisation Found</h2>
        <p className="text-slate-400 text-sm mb-4">Set up your business profile first to access the Chart of Accounts.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Chart of Accounts</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {accounts.length} accounts · Double-entry bookkeeping structure
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {orgs.length > 1 && (
            <select className="select text-sm py-1.5" value={activeOrgId || ''}
              onChange={e => setActiveOrgId(e.target.value)}>
              {orgs.map(o => {
                const id = o.id || o._id;
                return <option key={id} value={id}>{o.name}</option>;
              })}
            </select>
          )}
          {/* Tree / Flat toggle */}
          <div className="flex rounded-xl bg-slate-800 p-1">
            {(['tree', 'flat'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${view === v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {v === 'tree' ? '🌳 Tree' : '📋 Flat'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm py-1.5 px-3">
            <Plus size={14} /> Add Account
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {view === 'flat' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ACCOUNT_TYPES.map(t => (
            <div key={t} className="metric-card py-3 px-4">
              <p className="text-slate-500 text-xs">{TYPE_EMOJI[t]} {t}</p>
              <p className={`text-lg font-bold mt-1 ${TYPE_COLORS[t].split(' ')[0]}`}>
                {formatINR(totals[t] || 0, true)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Search + filter (flat view only) */}
      {view === 'flat' && (
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input className="input pl-9 text-sm" placeholder="Search by name or code..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select w-40 text-sm" value={filterType}
            onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Accounts table */}
      {loading ? (
        <div className="space-y-2">
          {Array(8).fill(0).map((_, i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
        </div>
      ) : accounts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📒</div>
          <h3 className="text-white font-medium mb-1">No accounts found</h3>
          <p className="text-slate-400 text-sm mb-4">
            The Chart of Accounts is auto-generated when you set up your business.
          </p>
          <a href="/business/profile" className="btn-primary">Set Up Business</a>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="py-3 px-4 text-left">Account</th>
                <th className="py-3 px-4 text-left hidden md:table-cell">Type</th>
                <th className="py-3 px-4 text-right">Balance</th>
                <th className="py-3 px-4 text-right w-20"></th>
              </tr>
            </thead>
            <tbody>
              {view === 'tree'
                ? accounts.map((a: any) => (
                    <AccountRow key={a.code} account={a} depth={0} onSelect={() => {}} />
                  ))
                : filteredFlat.map((a: any) => (
                    <AccountRow key={a.code} account={a} depth={0} onSelect={() => {}} />
                  ))
              }
            </tbody>
          </table>
        </div>
      )}

      <p className="text-slate-600 text-xs text-center">
        Phase 2 will add Journal Entries, Ledger view, and Trial Balance to this accounting engine.
      </p>

      {showAdd && activeOrgId && (
        <AddAccountForm
          orgId={activeOrgId}
          onCreated={handleAccountCreated}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
