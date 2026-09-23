'use client';

import { useEffect, useState } from 'react';
import { businessOrg as api } from '@/lib/api';
import { Building2, Plus, Users, ChevronRight, Pencil, Check, X, UserPlus, Shield } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Org {
  id?: string;
  _id?: string;
  name: string;
  legal_name: string;
  business_type: string;
  industry: string;
  pan_number: string;
  gstin: string;
  tan: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  financial_year_start: number;
  accounting_method: string;
  currency: string;
  fiscal_year_label: string;
  website: string;
  phone: string;
  email: string;
  user_role: string;
  is_owner: boolean;
}

interface Member {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  role: string;
  joined_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BUSINESS_TYPES = [
  'SOLE_PROPRIETORSHIP','PARTNERSHIP','LLP',
  'PRIVATE_LIMITED','PUBLIC_LIMITED','STARTUP','FREELANCER','OTHER',
];
const ROLES = ['OWNER','ADMIN','CFO','ACCOUNTANT','HR_PAYROLL','FINANCE_MANAGER','CA','AUDITOR','EMPLOYEE','VIEWER'];
const ACCOUNTING_METHODS = ['ACCRUAL','CASH'];
const INDUSTRIES = [
  'Technology','E-Commerce','Manufacturing','Healthcare','Finance',
  'Education','Retail','Real Estate','Consulting','Other',
];
const ROLE_COLORS: Record<string, string> = {
  OWNER: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  ADMIN: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  CFO: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  ACCOUNTANT: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  VIEWER: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
};
const EMPTY_ORG = {
  name: '', legal_name: '', business_type: 'PRIVATE_LIMITED', industry: 'Technology',
  pan_number: '', gstin: '', tan: '', address: '', city: '', state: '',
  pincode: '', country: 'India', financial_year_start: 4,
  accounting_method: 'ACCRUAL', currency: 'INR', fiscal_year_label: '2024-25',
  website: '', phone: '', email: '',
  opening_cash_balance: 0, opening_bank_balance: 0,
};

// ── Onboarding form ───────────────────────────────────────────────────────────
function OnboardingForm({ onCreated }: { onCreated: (org: Org) => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_ORG);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string, value: any) =>
    setForm(p => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const org: any = await api.createOrganization(form);
      onCreated(org);
    } catch (err: any) {
      setError(err.message || 'Failed to create organisation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
              s < step ? 'bg-indigo-600 border-indigo-600 text-white'
              : s === step ? 'border-indigo-500 text-indigo-400'
              : 'border-slate-700 text-slate-600'
            }`}>
              {s < step ? <Check size={14} /> : s}
            </div>
            <span className={`text-sm ${s === step ? 'text-white' : 'text-slate-500'}`}>
              {s === 1 ? 'Business Info' : s === 2 ? 'Tax & Legal' : 'Financial Setup'}
            </span>
            {s < 3 && <ChevronRight size={14} className="text-slate-700 mx-1" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Step 1 — Business Info */}
        {step === 1 && (
          <>
            <h2 className="text-base font-semibold text-white">Tell us about your business</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="input-label">Business Name *</label>
                <input className="input" value={form.name} placeholder="TechNova Solutions Pvt. Ltd."
                  onChange={e => set('name', e.target.value)} required />
              </div>
              <div>
                <label className="input-label">Legal Name</label>
                <input className="input" value={form.legal_name} placeholder="Same as business name"
                  onChange={e => set('legal_name', e.target.value)} />
              </div>
              <div>
                <label className="input-label">Business Type *</label>
                <select className="select" value={form.business_type}
                  onChange={e => set('business_type', e.target.value)}>
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Industry</label>
                <select className="select" value={form.industry}
                  onChange={e => set('industry', e.target.value)}>
                  {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Business Email</label>
                <input className="input" type="email" value={form.email} placeholder="finance@company.com"
                  onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label className="input-label">Phone</label>
                <input className="input" value={form.phone} placeholder="+91 98765 43210"
                  onChange={e => set('phone', e.target.value)} />
              </div>
              <div>
                <label className="input-label">Website</label>
                <input className="input" value={form.website} placeholder="https://company.com"
                  onChange={e => set('website', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="input-label">Address</label>
                <input className="input" value={form.address} placeholder="123, Business Park"
                  onChange={e => set('address', e.target.value)} />
              </div>
              <div>
                <label className="input-label">City</label>
                <input className="input" value={form.city} placeholder="Bengaluru"
                  onChange={e => set('city', e.target.value)} />
              </div>
              <div>
                <label className="input-label">State</label>
                <input className="input" value={form.state} placeholder="Karnataka"
                  onChange={e => set('state', e.target.value)} />
              </div>
              <div>
                <label className="input-label">Pincode</label>
                <input className="input" value={form.pincode} placeholder="560001"
                  onChange={e => set('pincode', e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={() => setStep(2)} disabled={!form.name}
                className="btn-primary">Next →</button>
            </div>
          </>
        )}

        {/* Step 2 — Tax & Legal */}
        {step === 2 && (
          <>
            <h2 className="text-base font-semibold text-white">Tax & Legal Details</h2>
            <p className="text-slate-400 text-sm">These identifiers are used for invoicing and GST calculations.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="input-label">PAN Number</label>
                <input className="input font-mono uppercase" value={form.pan_number}
                  placeholder="ABCDE1234F" maxLength={10}
                  onChange={e => set('pan_number', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="input-label">GSTIN</label>
                <input className="input font-mono uppercase" value={form.gstin}
                  placeholder="27ABCDE1234F1Z5" maxLength={15}
                  onChange={e => set('gstin', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="input-label">TAN Number</label>
                <input className="input font-mono uppercase" value={form.tan}
                  placeholder="BLRA12345B" maxLength={10}
                  onChange={e => set('tan', e.target.value.toUpperCase())} />
              </div>
            </div>
            <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">ℹ️ Note</p>
              <p>Tax numbers are used for invoice generation and compliance tracking. Ensure these match your official registration documents.</p>
            </div>
            <div className="flex gap-3 justify-between pt-2">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">← Back</button>
              <button type="button" onClick={() => setStep(3)} className="btn-primary">Next →</button>
            </div>
          </>
        )}

        {/* Step 3 — Financial Setup */}
        {step === 3 && (
          <>
            <h2 className="text-base font-semibold text-white">Financial Setup</h2>
            <p className="text-slate-400 text-sm">These settings configure your accounting engine.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="input-label">Accounting Method</label>
                <select className="select" value={form.accounting_method}
                  onChange={e => set('accounting_method', e.target.value)}>
                  {ACCOUNTING_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {form.accounting_method === 'ACCRUAL'
                    ? 'Revenue recognised when earned, expenses when incurred.'
                    : 'Revenue and expenses recorded when cash moves.'}
                </p>
              </div>
              <div>
                <label className="input-label">Fiscal Year Label</label>
                <input className="input" value={form.fiscal_year_label} placeholder="2024-25"
                  onChange={e => set('fiscal_year_label', e.target.value)} />
              </div>
              <div>
                <label className="input-label">Opening Cash Balance (₹)</label>
                <input className="input" type="number" step="0.01"
                  value={(form as any).opening_cash_balance}
                  onChange={e => set('opening_cash_balance', parseFloat(e.target.value) || 0)} />
                <p className="text-xs text-slate-500 mt-1">Cash in hand on the date you start using this platform.</p>
              </div>
              <div>
                <label className="input-label">Opening Bank Balance (₹)</label>
                <input className="input" type="number" step="0.01"
                  value={(form as any).opening_bank_balance}
                  onChange={e => set('opening_bank_balance', parseFloat(e.target.value) || 0)} />
                <p className="text-xs text-slate-500 mt-1">Combined balance across bank accounts on start date.</p>
              </div>
            </div>
            <div className="rounded-xl bg-indigo-950/40 border border-indigo-500/20 p-4 text-xs text-indigo-300">
              <p className="font-medium mb-1">✅ On completion</p>
              <p>A default Chart of Accounts (58 accounts) will be auto-generated for your business type. You can customise it after setup.</p>
            </div>
            {error && (
              <div className="rounded-xl bg-red-950/40 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-between pt-2">
              <button type="button" onClick={() => setStep(2)} className="btn-secondary">← Back</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Creating...' : '🚀 Create Business'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

// ── Profile edit form ─────────────────────────────────────────────────────────
function ProfileEditForm({ org, onSaved, onCancel }: {
  org: Org; onSaved: (org: Org) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: org.name || '',
    legal_name: org.legal_name || '',
    industry: org.industry || '',
    pan_number: org.pan_number || '',
    gstin: org.gstin || '',
    tan: org.tan || '',
    address: org.address || '',
    city: org.city || '',
    state: org.state || '',
    pincode: org.pincode || '',
    website: org.website || '',
    phone: org.phone || '',
    email: org.email || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const orgId = org.id || org._id || '';
  const set = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated: any = await api.updateOrganization(orgId, form);
      onSaved(updated);
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="card space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Edit Organisation</h2>
        <button type="button" onClick={onCancel} className="btn-ghost p-1.5"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {([
          ['Business Name', 'name', 'text'],
          ['Legal Name', 'legal_name', 'text'],
          ['Industry', 'industry', 'text'],
          ['PAN Number', 'pan_number', 'text'],
          ['GSTIN', 'gstin', 'text'],
          ['TAN', 'tan', 'text'],
          ['Address', 'address', 'text'],
          ['City', 'city', 'text'],
          ['State', 'state', 'text'],
          ['Pincode', 'pincode', 'text'],
          ['Website', 'website', 'url'],
          ['Phone', 'phone', 'tel'],
          ['Email', 'email', 'email'],
        ] as [string, string, string][]).map(([label, field, type]) => (
          <div key={field} className={field === 'address' ? 'sm:col-span-2' : ''}>
            <label className="input-label">{label}</label>
            <input className={`input ${['pan_number','gstin','tan'].includes(field) ? 'font-mono uppercase' : ''}`}
              type={type} value={(form as any)[field]}
              onChange={e => set(field, ['pan_number','gstin','tan'].includes(field)
                ? e.target.value.toUpperCase() : e.target.value)} />
          </div>
        ))}
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

// ── Members panel ─────────────────────────────────────────────────────────────
function MembersPanel({ org }: { org: Org }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('VIEWER');
  const [inviting, setInviting] = useState(false);
  const orgId = org.id || org._id || '';
  const canManage = ['OWNER', 'ADMIN'].includes(org.user_role);

  useEffect(() => {
    api.getMembers(orgId).then((m: any) => setMembers(m)).finally(() => setLoading(false));
  }, [orgId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const m: any = await api.inviteMember(orgId, { user_email: inviteEmail, role: inviteRole });
      setMembers(prev => [...prev, m]);
      setShowInvite(false);
      setInviteEmail('');
      setInviteRole('VIEWER');
    } catch (err: any) {
      alert(err.message || 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Users size={16} className="text-indigo-400" /> Team Members
        </h2>
        {canManage && (
          <button onClick={() => setShowInvite(s => !s)} className="btn-secondary text-sm py-1.5 px-3">
            <UserPlus size={14} /> Invite
          </button>
        )}
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} className="flex gap-2 flex-wrap items-end p-3 rounded-xl bg-slate-800/60 border border-slate-700">
          <div className="flex-1 min-w-48">
            <label className="input-label">Email</label>
            <input className="input" type="email" placeholder="colleague@company.com"
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
          </div>
          <div>
            <label className="input-label">Role</label>
            <select className="select" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              {ROLES.filter(r => r !== 'OWNER').map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <button type="submit" disabled={inviting} className="btn-primary text-sm py-2">
            {inviting ? '...' : 'Send'}
          </button>
          <button type="button" onClick={() => setShowInvite(false)} className="btn-ghost p-2"><X size={14} /></button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">{Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-sm font-bold text-indigo-300">
                  {m.user_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{m.user_name}</p>
                  <p className="text-slate-500 text-xs">{m.user_email}</p>
                </div>
              </div>
              <span className={`badge text-[11px] border ${ROLE_COLORS[m.role] || 'text-slate-400 bg-slate-400/10 border-slate-400/20'}`}>
                {m.role}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BusinessProfilePage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'members'>('overview');

  useEffect(() => {
    api.listOrganizations()
      .then((data: any) => {
        setOrgs(data);
        if (data.length > 0) setActiveOrg(data[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="p-8 space-y-4">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );

  // No org yet — show onboarding
  if (!activeOrg) return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Building2 size={24} className="text-indigo-400" /> Set Up Your Business
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Create your organisation to unlock accounting, invoicing, payroll, and AI CFO.
        </p>
      </div>
      <OnboardingForm onCreated={(org) => { setActiveOrg(org); setOrgs([org]); }} />
    </div>
  );

  const orgId = activeOrg.id || (activeOrg as any)._id || '';

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400">
              <Building2 size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{activeOrg.name}</h1>
              <p className="text-slate-400 text-sm">{activeOrg.business_type?.replace(/_/g, ' ')} · {activeOrg.industry}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {orgs.length > 1 && (
            <select className="select text-sm py-1.5 px-3" value={orgId}
              onChange={e => setActiveOrg(orgs.find(o => (o.id || (o as any)._id) === e.target.value) || null)}>
              {orgs.map(o => {
                const id = o.id || (o as any)._id;
                return <option key={id} value={id}>{o.name}</option>;
              })}
            </select>
          )}
          <span className={`badge text-[11px] border ${ROLE_COLORS[activeOrg.user_role] || 'text-slate-400 bg-slate-400/10 border-slate-400/20'}`}>
            <Shield size={10} className="inline mr-1" />{activeOrg.user_role}
          </span>
          {['OWNER', 'ADMIN'].includes(activeOrg.user_role) && !editing && (
            <button onClick={() => setEditing(true)} className="btn-secondary text-sm py-1.5 px-3">
              <Pencil size={14} /> Edit
            </button>
          )}
          <button onClick={() => {
            setActiveOrg(null);
            setOrgs([]);
          }} className="btn-secondary text-sm py-1.5 px-3">
            <Plus size={14} /> New Org
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <ProfileEditForm
          org={activeOrg}
          onSaved={(updated) => { setActiveOrg(updated as Org); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Tabs */}
      {!editing && (
        <>
          <div className="flex gap-2">
            {(['overview', 'members'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={tab === t ? 'btn-primary py-1.5 px-4 text-sm' : 'btn-secondary py-1.5 px-4 text-sm'}>
                {t === 'overview' ? '🏢 Overview' : '👥 Team'}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Business Details */}
              <div className="card space-y-3">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Business Details</h2>
                {[
                  ['Legal Name', activeOrg.legal_name],
                  ['Industry', activeOrg.industry],
                  ['Country', activeOrg.country],
                  ['Fiscal Year', activeOrg.fiscal_year_label],
                  ['Accounting', activeOrg.accounting_method],
                  ['Currency', activeOrg.currency],
                ].map(([label, value]) => value ? (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-200">{value}</span>
                  </div>
                ) : null)}
              </div>

              {/* Tax Details */}
              <div className="card space-y-3">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Tax & Legal</h2>
                {[
                  ['PAN', activeOrg.pan_number],
                  ['GSTIN', activeOrg.gstin],
                  ['TAN', activeOrg.tan],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className={`font-mono text-sm ${value ? 'text-slate-200' : 'text-slate-600 italic'}`}>
                      {value || 'Not provided'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Contact */}
              <div className="card space-y-3">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Contact</h2>
                {[
                  ['Email', activeOrg.email],
                  ['Phone', activeOrg.phone],
                  ['Website', activeOrg.website],
                  ['Address', [activeOrg.address, activeOrg.city, activeOrg.state, activeOrg.pincode].filter(Boolean).join(', ')],
                ].map(([label, value]) => value ? (
                  <div key={label} className="flex justify-between items-center text-sm gap-4">
                    <span className="text-slate-500 shrink-0">{label}</span>
                    <span className="text-slate-200 text-right truncate">{value}</span>
                  </div>
                ) : null)}
              </div>

              {/* Status */}
              <div className="card space-y-3">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Platform Status</h2>
                {[
                  ['Chart of Accounts', '✅ Auto-generated'],
                  ['Accounting Engine', '✅ Ready'],
                  ['Invoicing', '🔜 Phase 3'],
                  ['Payroll', '🔜 Phase 5'],
                  ['AI CFO', '🔜 Phase 10'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-300">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'members' && <MembersPanel org={activeOrg} />}
        </>
      )}
    </div>
  );
}
