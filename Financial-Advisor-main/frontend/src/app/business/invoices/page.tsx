'use client';

import { useEffect, useState, useCallback } from 'react';
import { businessOrg as orgApi, businessSales as api } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import { Plus, Search, X, Trash2, CreditCard, FileText, Ban } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  DRAFT:          'text-slate-400  bg-slate-400/10  border-slate-400/20',
  SENT:           'text-blue-400   bg-blue-400/10   border-blue-400/20',
  PARTIALLY_PAID: 'text-amber-400  bg-amber-400/10  border-amber-400/20',
  PAID:           'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  OVERDUE:        'text-red-400    bg-red-400/10    border-red-400/20',
  CANCELLED:      'text-slate-600  bg-slate-600/10  border-slate-600/20',
};

const GST_RATES = [0, 5, 12, 18, 28];

function InvoiceForm({ orgId, customers, onCreated, onCancel }: {
  orgId: string; customers: any[]; onCreated: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    customer_id: '',
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    notes: '',
  });
  const [items, setItems] = useState([
    { description: '', quantity: '1', unit_price: '', discount_pct: '0', gst_rate_pct: '18', gst_type: 'CGST_SGST', account_code: '4002' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setItem = (i: number, f: string, v: string) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [f]: v } : item));

  const calcLine = (item: typeof items[0]) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    const disc = parseFloat(item.discount_pct) || 0;
    const gst = parseFloat(item.gst_rate_pct) || 0;
    const taxable = qty * price * (1 - disc / 100);
    const gstAmt = taxable * gst / 100;
    return { taxable, gstAmt, total: taxable + gstAmt };
  };

  const totals = items.reduce((acc, item) => {
    const { taxable, gstAmt, total } = calcLine(item);
    return { subtotal: acc.subtotal + taxable, gst: acc.gst + gstAmt, total: acc.total + total };
  }, { subtotal: 0, gst: 0, total: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.createInvoice(orgId, {
        ...form,
        issue_date: new Date(form.issue_date).toISOString(),
        due_date: new Date(form.due_date).toISOString(),
        items: items.map(i => ({
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unit_price: parseFloat(i.unit_price) || 0,
          discount_pct: parseFloat(i.discount_pct) || 0,
          gst_rate_pct: parseFloat(i.gst_rate_pct) || 18,
          gst_type: i.gst_type,
          account_code: i.account_code,
        })),
      });
      onCreated();
    } catch (err: any) { setError(err.message || 'Failed to create invoice'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-3xl shadow-2xl mb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Create Invoice</h2>
          <button onClick={onCancel} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="input-label">Customer *</label>
              <select className="select" value={form.customer_id}
                onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))} required>
                <option value="">Select customer</option>
                {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="input-label">Issue Date *</label>
              <input type="date" className="input" value={form.issue_date} onChange={e => setForm(p => ({ ...p, issue_date: e.target.value }))} required /></div>
            <div><label className="input-label">Due Date *</label>
              <input type="date" className="input" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} required /></div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="input-label mb-0">Line Items</label>
              <button type="button" onClick={() => setItems(p => [...p, { description: '', quantity: '1', unit_price: '', discount_pct: '0', gst_rate_pct: '18', gst_type: 'CGST_SGST', account_code: '4002' }])}
                className="text-indigo-400 text-xs hover:text-indigo-300 flex items-center gap-1"><Plus size={12} />Add Line</button>
            </div>
            <div className="grid text-[11px] text-slate-500 uppercase tracking-wider grid-cols-12 gap-2 px-1 mb-1">
              <span className="col-span-4">Description</span><span className="col-span-1">Qty</span>
              <span className="col-span-2">Unit Price</span><span className="col-span-1">Disc%</span>
              <span className="col-span-1">GST%</span><span className="col-span-2 text-right">Total</span><span className="col-span-1" />
            </div>
            <div className="space-y-2">
              {items.map((item, i) => {
                const { total } = calcLine(item);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4"><input className="input text-sm py-2" placeholder="Description" value={item.description} onChange={e => setItem(i, 'description', e.target.value)} required /></div>
                    <div className="col-span-1"><input type="number" className="input text-sm py-2" value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} /></div>
                    <div className="col-span-2"><input type="number" className="input text-sm py-2" placeholder="0.00" value={item.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)} required /></div>
                    <div className="col-span-1"><input type="number" className="input text-sm py-2" value={item.discount_pct} onChange={e => setItem(i, 'discount_pct', e.target.value)} /></div>
                    <div className="col-span-1">
                      <select className="select text-sm py-2" value={item.gst_rate_pct} onChange={e => setItem(i, 'gst_rate_pct', e.target.value)}>
                        {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 text-right font-mono text-sm text-slate-200">{formatINR(total)}</div>
                    <div className="col-span-1 flex justify-center">
                      <button type="button" onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} disabled={items.length <= 1} className="btn-ghost p-1 text-slate-600 hover:text-red-400 disabled:opacity-20"><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800 flex justify-end gap-8 text-sm">
              <div className="text-right"><p className="text-slate-500">Subtotal</p><p className="text-white font-mono">{formatINR(totals.subtotal)}</p></div>
              <div className="text-right"><p className="text-slate-500">GST</p><p className="text-white font-mono">{formatINR(totals.gst)}</p></div>
              <div className="text-right"><p className="text-slate-400 font-semibold">Total</p><p className="text-white font-mono font-bold text-base">{formatINR(totals.total)}</p></div>
            </div>
          </div>

          <div><label className="input-label">Notes</label><textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>

          {error && <div className="rounded-xl bg-red-950/40 border border-red-500/20 p-3 text-sm text-red-400">{error}</div>}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || !form.customer_id} className="btn-primary">{saving ? 'Creating...' : 'Create Invoice'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentModal({ invoice, orgId, onDone, onCancel }: {
  invoice: any; orgId: string; onDone: () => void; onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(invoice.amount_due));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.recordPayment(orgId, invoice._id, {
        amount: parseFloat(amount),
        payment_date: new Date(date).toISOString(),
        payment_method: method,
        reference: ref || null,
      });
      onDone();
    } catch (err: any) { setError(err.message || 'Payment failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Record Payment</h2>
          <button onClick={onCancel} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <div className="rounded-xl bg-slate-800/50 p-3 mb-4 text-sm">
          <p className="text-slate-400">Invoice: <span className="font-mono text-indigo-400">{invoice.invoice_number}</span></p>
          <p className="text-slate-400">Total: <span className="text-white font-semibold">{formatINR(invoice.total_amount)}</span></p>
          <p className="text-slate-400">Amount Due: <span className="text-amber-400 font-semibold">{formatINR(invoice.amount_due)}</span></p>
        </div>
        <form onSubmit={handlePay} className="space-y-4">
          <div><label className="input-label">Amount (₹) *</label>
            <input type="number" step="0.01" className="input" value={amount} onChange={e => setAmount(e.target.value)} max={invoice.amount_due} required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="input-label">Payment Date</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="input-label">Method</label>
              <select className="select" value={method} onChange={e => setMethod(e.target.value)}>
                {['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE'].map(m => <option key={m}>{m}</option>)}
              </select></div>
          </div>
          <div><label className="input-label">Reference (UTR / Cheque No)</label>
            <input className="input font-mono" value={ref} onChange={e => setRef(e.target.value)} /></div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary"><CreditCard size={14} />{saving ? 'Recording...' : 'Record Payment'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [data, setData] = useState<any>({ data: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [payInvoice, setPayInvoice] = useState<any | null>(null);

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) {
        const id = orgs[0].id || orgs[0]._id;
        setOrgId(id);
        api.listCustomers(id, { limit: 200 }).then((res: any) => setCustomers(res?.data || []));
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res: any = await api.listInvoices(orgId, params);
      setData(res);
    } catch {} finally { setLoading(false); }
  }, [orgId, page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (inv: any) => {
    if (!confirm(`Cancel invoice ${inv.invoice_number}? This will reverse the accounting entry.`)) return;
    try { await api.cancelInvoice(orgId!, inv._id); load(); } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><FileText size={22} className="text-indigo-400" />Invoices</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data.total} invoices</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={16} />New Invoice</button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
          <input className="input pl-9 text-sm" placeholder="Search invoice or customer..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="select w-40 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          {['SENT','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{Array(6).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : data.data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧾</div>
          <h3 className="text-white font-medium mb-1">No invoices yet</h3>
          <p className="text-slate-400 text-sm mb-4">Create your first invoice to start tracking receivables</p>
          <button onClick={() => setShowForm(true)} className="btn-primary">New Invoice</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table w-full">
            <thead><tr className="border-b border-slate-800">
              <th className="py-3 px-4 text-left w-32">Invoice #</th>
              <th className="py-3 px-4 text-left">Customer</th>
              <th className="py-3 px-4 text-left hidden sm:table-cell">Issue Date</th>
              <th className="py-3 px-4 text-left hidden sm:table-cell">Due Date</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-right">Amount</th>
              <th className="py-3 px-4 text-right">Due</th>
              <th className="py-3 px-4 w-24"></th>
            </tr></thead>
            <tbody>
              {data.data.map((inv: any) => (
                <tr key={inv._id} className="border-b border-slate-800/50 hover:bg-slate-800/10">
                  <td className="py-3 px-4 font-mono text-xs text-indigo-400">{inv.invoice_number}</td>
                  <td className="py-3 px-4 text-slate-200 text-sm">{inv.customer_name}</td>
                  <td className="py-3 px-4 text-slate-400 text-sm hidden sm:table-cell">{formatDate(inv.issue_date)}</td>
                  <td className="py-3 px-4 text-slate-400 text-sm hidden sm:table-cell">{formatDate(inv.due_date)}</td>
                  <td className="py-3 px-4"><span className={`badge text-[11px] border ${STATUS_STYLES[inv.status]}`}>{inv.status.replace('_', ' ')}</span></td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-white">{formatINR(inv.total_amount)}</td>
                  <td className="py-3 px-4 text-right font-mono text-sm">
                    <span className={inv.amount_due > 0 ? 'text-amber-400' : 'text-slate-600'}>
                      {inv.amount_due > 0 ? formatINR(inv.amount_due) : '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-1">
                      {['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status) && (
                        <button onClick={() => setPayInvoice(inv)} className="btn-ghost p-1.5 text-emerald-400" title="Record Payment"><CreditCard size={13} /></button>
                      )}
                      {!['PAID', 'CANCELLED'].includes(inv.status) && (
                        <button onClick={() => handleCancel(inv)} className="btn-ghost p-1.5 text-red-400" title="Cancel Invoice"><Ban size={13} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-slate-500 text-sm">Page {page} of {data.pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="btn-secondary py-1.5 px-3 text-sm">←</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page === data.pages} className="btn-secondary py-1.5 px-3 text-sm">→</button>
          </div>
        </div>
      )}

      {showForm && orgId && <InvoiceForm orgId={orgId} customers={customers} onCreated={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}
      {payInvoice && orgId && <PaymentModal invoice={payInvoice} orgId={orgId} onDone={() => { setPayInvoice(null); load(); }} onCancel={() => setPayInvoice(null)} />}
    </div>
  );
}
