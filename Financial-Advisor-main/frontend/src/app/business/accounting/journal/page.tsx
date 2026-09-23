'use client';

import { useEffect, useState, useCallback } from 'react';
import { businessOrg as api, businessAccounting } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import {
  Plus, X, Trash2, AlertCircle, CheckCircle,
  ChevronDown, ChevronRight, Ban, Search
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface JournalLine {
  account_code: string;
  account_name?: string;
  description: string;
  debit: string;
  credit: string;
}

interface JournalEntry {
  _id: string;
  entry_number: string;
  date: string;
  description: string;
  reference: string | null;
  status: 'POSTED' | 'VOID' | 'DRAFT';
  total_debit: number;
  total_credit: number;
  lines: Array<{
    account_code: string;
    account_name: string;
    description: string | null;
    debit: number;
    credit: number;
  }>;
  void_reason?: string;
}

const STATUS_STYLES: Record<string, string> = {
  POSTED: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  VOID:   'text-slate-500  bg-slate-500/10  border-slate-500/20',
  DRAFT:  'text-amber-400  bg-amber-400/10  border-amber-400/20',
};

const EMPTY_LINE: JournalLine = { account_code: '', description: '', debit: '', credit: '' };

// ── Journal entry form ────────────────────────────────────────────────────────
function JournalEntryForm({
  orgId,
  accounts,
  onCreated,
  onCancel,
}: {
  orgId: string;
  accounts: any[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { ...EMPTY_LINE },
    { ...EMPTY_LINE },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Live balance check
  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.005 && totalDebit > 0;

  const setLine = (i: number, field: keyof JournalLine, value: string) => {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const addLine = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (i: number) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, idx) => idx !== i));
  };

  // When account is selected, fill account_name for display
  const handleAccountSelect = (i: number, code: string) => {
    const acc = accounts.find(a => a.code === code);
    setLines(prev => prev.map((l, idx) =>
      idx === i ? { ...l, account_code: code, account_name: acc?.name || '' } : l
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) { setError('Entry is not balanced. Debits must equal credits.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        date: new Date(date).toISOString(),
        description,
        reference: reference || null,
        lines: lines
          .filter(l => l.account_code)
          .map(l => ({
            account_code: l.account_code,
            description: l.description || null,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
          })),
      };
      await businessAccounting.createJournalEntry(orgId, payload);
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create journal entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-3xl shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">New Journal Entry</h2>
          <button onClick={onCancel} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="input-label">Date *</label>
              <input type="date" className="input" value={date}
                onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <label className="input-label">Description *</label>
              <input className="input" placeholder="e.g. Office rent payment — June 2024"
                value={description} onChange={e => setDescription(e.target.value)} required />
            </div>
            <div>
              <label className="input-label">Reference (optional)</label>
              <input className="input font-mono" placeholder="INV-001 / PAY-042"
                value={reference} onChange={e => setReference(e.target.value)} />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="input-label mb-0">Journal Lines</label>
              <button type="button" onClick={addLine}
                className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1">
                <Plus size={12} /> Add Line
              </button>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 text-[11px] text-slate-500 uppercase tracking-wider px-1 mb-1">
              <span className="col-span-3">Account</span>
              <span className="col-span-4">Description</span>
              <span className="col-span-2 text-right">Debit (₹)</span>
              <span className="col-span-2 text-right">Credit (₹)</span>
              <span className="col-span-1" />
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <select className="select text-sm py-2"
                      value={line.account_code}
                      onChange={e => handleAccountSelect(i, e.target.value)}>
                      <option value="">Select account</option>
                      {accounts.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <input className="input text-sm py-2" placeholder="Narration"
                      value={line.description}
                      onChange={e => setLine(i, 'description', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <input type="number" step="0.01" min="0" className="input text-sm py-2 text-right"
                      placeholder="0.00"
                      value={line.debit}
                      onChange={e => {
                        setLine(i, 'debit', e.target.value);
                        if (e.target.value) setLine(i, 'credit', '');
                      }} />
                  </div>
                  <div className="col-span-2">
                    <input type="number" step="0.01" min="0" className="input text-sm py-2 text-right"
                      placeholder="0.00"
                      value={line.credit}
                      onChange={e => {
                        setLine(i, 'credit', e.target.value);
                        if (e.target.value) setLine(i, 'debit', '');
                      }} />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button type="button" onClick={() => removeLine(i)}
                      disabled={lines.length <= 2}
                      className="btn-ghost p-1 text-slate-600 hover:text-red-400 disabled:opacity-20">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals row */}
            <div className="grid grid-cols-12 gap-2 mt-3 pt-3 border-t border-slate-800">
              <div className="col-span-7 text-right text-sm font-semibold text-slate-300">Totals</div>
              <div className="col-span-2 text-right font-mono font-semibold text-sm text-white">
                {formatINR(totalDebit)}
              </div>
              <div className="col-span-2 text-right font-mono font-semibold text-sm text-white">
                {formatINR(totalCredit)}
              </div>
            </div>

            {/* Balance indicator */}
            <div className={`mt-2 flex items-center gap-2 text-sm ${isBalanced ? 'text-emerald-400' : diff > 0.005 ? 'text-red-400' : 'text-slate-500'}`}>
              {isBalanced
                ? <><CheckCircle size={14} /> Entry is balanced</>
                : totalDebit > 0 || totalCredit > 0
                  ? <><AlertCircle size={14} /> Unbalanced by {formatINR(diff)}</>
                  : null}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-950/40 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || !isBalanced} className="btn-primary">
              {saving ? 'Posting...' : 'Post Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Entry detail row ──────────────────────────────────────────────────────────
function EntryRow({ entry, onVoid }: { entry: JournalEntry; onVoid: (e: JournalEntry) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-slate-800/50 hover:bg-slate-800/20 cursor-pointer"
        onClick={() => setExpanded(o => !o)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown size={14} className="text-slate-500 shrink-0" />
              : <ChevronRight size={14} className="text-slate-500 shrink-0" />}
            <span className="font-mono text-xs text-indigo-400">{entry.entry_number}</span>
          </div>
        </td>
        <td className="py-3 px-4 text-slate-400 text-sm">{formatDate(entry.date)}</td>
        <td className="py-3 px-4">
          <p className="text-slate-200 text-sm">{entry.description}</p>
          {entry.reference && <p className="text-slate-600 text-xs font-mono">{entry.reference}</p>}
        </td>
        <td className="py-3 px-4">
          <span className={`badge text-[11px] border ${STATUS_STYLES[entry.status]}`}>
            {entry.status}
          </span>
        </td>
        <td className="py-3 px-4 text-right font-mono text-sm text-white">
          {formatINR(entry.total_debit)}
        </td>
        <td className="py-3 px-4 text-right">
          {entry.status === 'POSTED' && (
            <button
              onClick={e => { e.stopPropagation(); onVoid(entry); }}
              className="btn-ghost text-xs py-1 px-2 text-red-400 hover:text-red-300"
              title="Void entry">
              <Ban size={12} />
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-800/50 bg-slate-950/40">
          <td colSpan={6} className="px-4 py-3">
            <div className="ml-6">
              {entry.void_reason && (
                <p className="text-slate-500 text-xs mb-2 italic">Void reason: {entry.void_reason}</p>
              )}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 uppercase tracking-wider">
                    <th className="text-left pb-1">Account</th>
                    <th className="text-left pb-1">Narration</th>
                    <th className="text-right pb-1">Debit</th>
                    <th className="text-right pb-1">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-800/30">
                      <td className="py-1 font-mono text-indigo-300">{l.account_code} — {l.account_name}</td>
                      <td className="py-1 text-slate-400">{l.description || '—'}</td>
                      <td className="py-1 text-right font-mono text-slate-200">
                        {l.debit > 0 ? formatINR(l.debit) : '—'}
                      </td>
                      <td className="py-1 text-right font-mono text-slate-200">
                        {l.credit > 0 ? formatINR(l.credit) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Void confirmation modal ───────────────────────────────────────────────────
function VoidModal({ entry, orgId, onDone, onCancel }: {
  entry: JournalEntry; orgId: string; onDone: () => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVoid = async () => {
    if (!reason.trim()) { setError('Please provide a reason for voiding'); return; }
    setLoading(true);
    setError('');
    try {
      await businessAccounting.voidJournalEntry(orgId, entry._id, reason);
      onDone();
    } catch (err: any) {
      setError(err.message || 'Void failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">Void Journal Entry</h2>
        <p className="text-slate-400 text-sm mb-4">
          This will create a reversing entry to undo <span className="font-mono text-indigo-400">{entry.entry_number}</span>.
          The original entry will be marked as VOID. This action cannot be undone.
        </p>
        <div className="mb-4">
          <label className="input-label">Reason for voiding *</label>
          <textarea className="input resize-none" rows={3}
            placeholder="e.g. Entered wrong amount — see JE-2024-0042 for correction"
            value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={handleVoid} disabled={loading}
            className="bg-red-600 hover:bg-red-500 text-white font-medium text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
            {loading ? 'Voiding...' : 'Void Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JournalEntriesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any>({ data: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [voidEntry, setVoidEntry] = useState<JournalEntry | null>(null);

  // Resolve org
  useEffect(() => {
    api.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  // Load flat accounts for the form selector
  useEffect(() => {
    if (!orgId) return;
    api.getAccounts(orgId, false).then((a: any) => setAccounts(a || []));
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (statusFilter) params.status = statusFilter;
      if (search) params.reference = search;
      const data: any = await businessAccounting.listJournalEntries(orgId, params);
      setEntries(data);
    } catch {}
    setLoading(false);
  }, [orgId, page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  if (!orgId && !loading) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Journal Entries</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Double-entry bookkeeping · {entries.total} entries
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> New Entry
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
          <input className="input pl-9 text-sm" placeholder="Search by reference..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="select w-36 text-sm" value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="POSTED">Posted</option>
          <option value="VOID">Void</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array(6).fill(0).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
      ) : entries.data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📒</div>
          <h3 className="text-white font-medium mb-1">No journal entries yet</h3>
          <p className="text-slate-400 text-sm mb-4">
            Post your first double-entry journal to start your accounting records.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary">New Entry</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="py-3 px-4 text-left w-32">Entry #</th>
                <th className="py-3 px-4 text-left w-28">Date</th>
                <th className="py-3 px-4 text-left">Description</th>
                <th className="py-3 px-4 text-left w-24">Status</th>
                <th className="py-3 px-4 text-right w-36">Amount</th>
                <th className="py-3 px-4 w-16" />
              </tr>
            </thead>
            <tbody>
              {entries.data.map((e: JournalEntry) => (
                <EntryRow key={e._id} entry={e} onVoid={setVoidEntry} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {entries.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-slate-500 text-sm">Page {page} of {entries.pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="btn-secondary py-1.5 px-3 text-sm">←</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page === entries.pages} className="btn-secondary py-1.5 px-3 text-sm">→</button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showForm && orgId && (
        <JournalEntryForm
          orgId={orgId}
          accounts={accounts}
          onCreated={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {voidEntry && orgId && (
        <VoidModal
          entry={voidEntry}
          orgId={orgId}
          onDone={() => { setVoidEntry(null); load(); }}
          onCancel={() => setVoidEntry(null)}
        />
      )}
    </div>
  );
}
