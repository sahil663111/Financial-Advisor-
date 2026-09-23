'use client';

import { useEffect, useState, useCallback } from 'react';
import { businessOrg as orgApi, businessSales as api } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import { Plus, Search, Pencil, Trash2, X, ChevronRight, Users, FileText } from 'lucide-react';

interface Customer {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  gstin?: string;
  city?: string;
  state?: string;
  credit_limit: number;
  payment_terms_days: number;
  outstanding_balance: number;
  is_active: boolean;
  recent_invoices?: any[];
}

const EMPTY = {
  name: '', email: '', phone: '', gstin: '', pan_number: '',
  address: '', city: '', state: '', pincode: '', country: 'India',
  credit_limit: 0, payment_terms_days: 30, notes: '',
};

function CustomerForm({ initial, onSave, onCancel, saving, error }: {
  initial: typeof EMPTY;
  onSave: (d: typeof EMPTY) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState(initial);
  const set = (f: string, v: any) => setForm(p => ({ ...p, [f]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="input-label">Name *</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Acme Corp" />
        </div>
        <div><label className="input-label">Email</label><input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} /></div>
        <div><label className="input-label">Phone</label><input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
        <div><label className="input-label">GSTIN</label><input className="input font-mono uppercase" value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} /></div>
        <div><label className="input-label">PAN</label><input className="input font-mono uppercase" value={form.pan_number} onChange={e => set('pan_number', e.target.value.toUpperCase())} /></div>
        <div className="sm:col-span-2"><label className="input-label">Address</label><input className="input" value={form.address} onChange={e => set('address', e.target.value)} /></div>
        <div><label className="input-label">City</label><input className="input" value={form.city} onChange={e => set('city', e.target.value)} /></div>
        <div><label className="input-label">State</label><input className="input" value={form.state} onChange={e => set('state', e.target.value)} /></div>
        <div><label className="input-label">Credit Limit (₹)</label><input type="number" className="input" value={form.credit_limit} onChange={e => set('credit_limit', parseFloat(e.target.value) || 0)} /></div>
        <div><label className="input-label">Payment Terms (days)</label><input type="number" className="input" value={form.payment_terms_days} onChange={e => set('payment_terms_days', parseInt(e.target.value) || 30)} /></div>
        <div className="sm:col-span-2"><label className="input-label">Notes</label><textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Customer'}</button>
      </div>
    </form>
  );
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm">
      <div className="h-full w-full max-w-lg bg-slate-900 border-l border-slate-800 overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">{customer.name}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-5">
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="metric-card py-3 px-4">
              <p className="metric-label">Outstanding</p>
              <p className={`text-lg font-bold ${customer.outstanding_balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {formatINR(customer.outstanding_balance, true)}
              </p>
            </div>
            <div className="metric-card py-3 px-4">
              <p className="metric-label">Credit Limit</p>
              <p className="text-lg font-bold text-white">{formatINR(customer.credit_limit, true)}</p>
            </div>
          </div>
          {/* Details */}
          <div className="card space-y-2.5">
            {[
              ['Email', customer.email],
              ['Phone', customer.phone],
              ['GSTIN', customer.gstin],
              ['City', customer.city],
              ['State', customer.state],
              ['Payment Terms', `Net-${customer.payment_terms_days}`],
            ].map(([label, val]) => val ? (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-200">{val}</span>
              </div>
            ) : null)}
          </div>
          {/* Recent invoices */}
          {customer.recent_invoices && customer.recent_invoices.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Recent Invoices</h3>
              <div className="space-y-2">
                {customer.recent_invoices.map((inv: any) => (
                  <div key={inv._id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 text-sm">
                    <div>
                      <p className="font-mono text-indigo-400 text-xs">{inv.invoice_number}</p>
                      <p className="text-slate-400 text-xs">{formatDate(inv.issue_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-medium">{formatINR(inv.total_amount)}</p>
                      <span className={`text-xs ${inv.status === 'PAID' ? 'text-emerald-400' : inv.status === 'OVERDUE' ? 'text-red-400' : 'text-amber-400'}`}>
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [data, setData] = useState<any>({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res: any = await api.listCustomers(orgId, { page, limit: 50, search: search || undefined });
      setData(res);
    } catch {} finally { setLoading(false); }
  }, [orgId, page, search]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (c: Customer) => {
    try {
      const detail: any = await api.getCustomer(orgId!, c._id);
      setDetailCustomer(detail);
    } catch { setDetailCustomer(c); }
  };

  const handleSave = async (form: typeof EMPTY) => {
    setSaving(true); setFormError('');
    try {
      if (editCustomer) {
        await api.updateCustomer(orgId!, editCustomer._id, form);
      } else {
        await api.createCustomer(orgId!, form);
      }
      setShowForm(false); setEditCustomer(null); load();
    } catch (err: any) {
      setFormError(err.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (c: Customer) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    try { await api.deleteCustomer(orgId!, c._id); load(); } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Users size={22} className="text-indigo-400" />Customers</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data.total} customers · click a row for details</p>
        </div>
        <button onClick={() => { setEditCustomer(null); setShowForm(true); }} className="btn-primary"><Plus size={16} />Add Customer</button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
        <input className="input pl-9 text-sm" placeholder="Search by name or email..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {(showForm || editCustomer) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-semibold text-white mb-4">{editCustomer ? 'Edit Customer' : 'New Customer'}</h2>
            <CustomerForm
              initial={editCustomer ? { name: editCustomer.name, email: editCustomer.email || '', phone: editCustomer.phone || '', gstin: editCustomer.gstin || '', pan_number: '', address: '', city: editCustomer.city || '', state: editCustomer.state || '', pincode: '', country: 'India', credit_limit: editCustomer.credit_limit, payment_terms_days: editCustomer.payment_terms_days, notes: '' } : EMPTY}
              onSave={handleSave} onCancel={() => { setShowForm(false); setEditCustomer(null); }}
              saving={saving} error={formError}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : data.data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <h3 className="text-white font-medium mb-1">No customers yet</h3>
          <p className="text-slate-400 text-sm mb-4">Add your first customer to start creating invoices</p>
          <button onClick={() => setShowForm(true)} className="btn-primary">Add Customer</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table w-full">
            <thead><tr className="border-b border-slate-800">
              <th className="py-3 px-4 text-left">Customer</th>
              <th className="py-3 px-4 text-left hidden md:table-cell">Contact</th>
              <th className="py-3 px-4 text-right">Outstanding</th>
              <th className="py-3 px-4 text-right hidden sm:table-cell">Credit Limit</th>
              <th className="py-3 px-4 text-right w-20"></th>
            </tr></thead>
            <tbody>
              {data.data.map((c: Customer) => (
                <tr key={c._id} onClick={() => openDetail(c)}
                  className="border-b border-slate-800/50 hover:bg-slate-800/20 cursor-pointer">
                  <td className="py-3 px-4">
                    <p className="text-white font-medium text-sm">{c.name}</p>
                    {c.gstin && <p className="font-mono text-slate-600 text-xs">{c.gstin}</p>}
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    <p className="text-slate-400 text-sm">{c.email || '—'}</p>
                    {c.city && <p className="text-slate-600 text-xs">{c.city}{c.state ? `, ${c.state}` : ''}</p>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-mono font-semibold text-sm ${c.outstanding_balance > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {c.outstanding_balance > 0 ? formatINR(c.outstanding_balance, true) : '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right hidden sm:table-cell">
                    <span className="text-slate-400 text-sm">{c.credit_limit > 0 ? formatINR(c.credit_limit, true) : '—'}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEditCustomer(c); setShowForm(false); }} className="btn-ghost p-1.5"><Pencil size={13} /></button>
                      <button onClick={() => handleDelete(c)} className="btn-ghost p-1.5 text-red-400"><Trash2 size={13} /></button>
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

      {detailCustomer && <CustomerDetail customer={detailCustomer} onClose={() => setDetailCustomer(null)} />}
    </div>
  );
}
