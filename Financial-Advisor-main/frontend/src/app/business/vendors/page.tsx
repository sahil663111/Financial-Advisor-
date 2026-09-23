'use client';

import { useEffect, useState, useCallback } from 'react';
import { businessOrg as orgApi, businessSales as api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { Plus, Search, Pencil, Trash2, Briefcase } from 'lucide-react';

const EMPTY = {
  name: '', email: '', phone: '', gstin: '', pan_number: '',
  address: '', city: '', state: '', pincode: '', country: 'India',
  payment_terms_days: 30,
  bank_name: '', bank_account_number: '', ifsc_code: '', notes: '',
};

export default function VendorsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [data, setData] = useState<any>({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editVendor, setEditVendor] = useState<any | null>(null);
  const [form, setForm] = useState(EMPTY);
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
      const res: any = await api.listVendors(orgId, { page, limit: 50, search: search || undefined });
      setData(res);
    } catch {} finally { setLoading(false); }
  }, [orgId, page, search]);

  useEffect(() => { load(); }, [load]);

  const openForm = (vendor?: any) => {
    setEditVendor(vendor || null);
    setForm(vendor ? {
      name: vendor.name || '', email: vendor.email || '', phone: vendor.phone || '',
      gstin: vendor.gstin || '', pan_number: vendor.pan_number || '',
      address: vendor.address || '', city: vendor.city || '', state: vendor.state || '',
      pincode: vendor.pincode || '', country: vendor.country || 'India',
      payment_terms_days: vendor.payment_terms_days || 30,
      bank_name: vendor.bank_name || '', bank_account_number: vendor.bank_account_number || '',
      ifsc_code: vendor.ifsc_code || '', notes: vendor.notes || '',
    } : EMPTY);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      if (editVendor) await api.updateVendor(orgId!, editVendor._id, form);
      else await api.createVendor(orgId!, form);
      setShowForm(false); load();
    } catch (err: any) { setFormError(err.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (v: any) => {
    if (!confirm(`Delete ${v.name}?`)) return;
    try { await api.deleteVendor(orgId!, v._id); load(); } catch (err: any) { alert(err.message); }
  };

  const set = (f: string, v: any) => setForm(p => ({ ...p, [f]: v }));

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Briefcase size={22} className="text-indigo-400" />Vendors</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data.total} vendors</p>
        </div>
        <button onClick={() => openForm()} className="btn-primary"><Plus size={16} />Add Vendor</button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
        <input className="input pl-9 text-sm" placeholder="Search vendors..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-semibold text-white mb-4">{editVendor ? 'Edit Vendor' : 'New Vendor'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className="input-label">Name *</label><input className="input" value={form.name} onChange={e => set('name', e.target.value)} required /></div>
                <div><label className="input-label">Email</label><input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} /></div>
                <div><label className="input-label">Phone</label><input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
                <div><label className="input-label">GSTIN</label><input className="input font-mono uppercase" value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} /></div>
                <div><label className="input-label">PAN</label><input className="input font-mono uppercase" value={form.pan_number} onChange={e => set('pan_number', e.target.value.toUpperCase())} /></div>
                <div className="sm:col-span-2"><label className="input-label">Address</label><input className="input" value={form.address} onChange={e => set('address', e.target.value)} /></div>
                <div><label className="input-label">City</label><input className="input" value={form.city} onChange={e => set('city', e.target.value)} /></div>
                <div><label className="input-label">State</label><input className="input" value={form.state} onChange={e => set('state', e.target.value)} /></div>
                <div><label className="input-label">Payment Terms (days)</label><input type="number" className="input" value={form.payment_terms_days} onChange={e => set('payment_terms_days', parseInt(e.target.value) || 30)} /></div>
              </div>
              <div className="border-t border-slate-800 pt-4">
                <p className="text-sm font-medium text-slate-400 mb-3">Bank Details (for payments)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="input-label">Bank Name</label><input className="input" value={form.bank_name} onChange={e => set('bank_name', e.target.value)} /></div>
                  <div><label className="input-label">Account Number</label><input className="input font-mono" value={form.bank_account_number} onChange={e => set('bank_account_number', e.target.value)} /></div>
                  <div><label className="input-label">IFSC Code</label><input className="input font-mono uppercase" value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value.toUpperCase())} /></div>
                </div>
              </div>
              {formError && <p className="text-red-400 text-sm">{formError}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Vendor'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : data.data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏭</div>
          <h3 className="text-white font-medium mb-1">No vendors yet</h3>
          <p className="text-slate-400 text-sm mb-4">Add vendors to track bills and payables</p>
          <button onClick={() => openForm()} className="btn-primary">Add Vendor</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table w-full">
            <thead><tr className="border-b border-slate-800">
              <th className="py-3 px-4 text-left">Vendor</th>
              <th className="py-3 px-4 text-left hidden md:table-cell">Contact</th>
              <th className="py-3 px-4 text-right">Outstanding Payable</th>
              <th className="py-3 px-4 text-right w-20"></th>
            </tr></thead>
            <tbody>
              {data.data.map((v: any) => (
                <tr key={v._id} className="border-b border-slate-800/50 hover:bg-slate-800/10">
                  <td className="py-3 px-4">
                    <p className="text-white font-medium text-sm">{v.name}</p>
                    {v.gstin && <p className="font-mono text-slate-600 text-xs">{v.gstin}</p>}
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    <p className="text-slate-400 text-sm">{v.email || '—'}</p>
                    {v.city && <p className="text-slate-600 text-xs">{v.city}</p>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-mono font-semibold text-sm ${v.outstanding_payable > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {v.outstanding_payable > 0 ? formatINR(v.outstanding_payable, true) : '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openForm(v)} className="btn-ghost p-1.5"><Pencil size={13} /></button>
                      <button onClick={() => handleDelete(v)} className="btn-ghost p-1.5 text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
