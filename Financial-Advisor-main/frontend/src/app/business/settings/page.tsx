'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessTax } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Building2, Users, ShieldCheck, RefreshCw,
  Plus, X, Pencil, Check, UserPlus, ChevronDown, ChevronRight
} from 'lucide-react';

const ROLES = ['ADMIN','CFO','ACCOUNTANT','HR_PAYROLL','FINANCE_MANAGER','CA','AUDITOR','EMPLOYEE','VIEWER'];
const ROLE_COLORS: Record<string, string> = {
  OWNER:          'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  ADMIN:          'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  CFO:            'text-purple-400 bg-purple-400/10 border-purple-400/20',
  ACCOUNTANT:     'text-blue-400   bg-blue-400/10   border-blue-400/20',
  HR_PAYROLL:     'text-cyan-400   bg-cyan-400/10   border-cyan-400/20',
  FINANCE_MANAGER:'text-teal-400   bg-teal-400/10   border-teal-400/20',
  CA:             'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  AUDITOR:        'text-orange-400 bg-orange-400/10 border-orange-400/20',
  EMPLOYEE:       'text-slate-300  bg-slate-300/10  border-slate-300/20',
  VIEWER:         'text-slate-500  bg-slate-500/10  border-slate-500/20',
};
const TAX_TYPE_COLORS: Record<string, string> = {
  GST: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  TDS: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
};

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon, children }: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card space-y-4">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between group">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          {icon}{title}
        </h2>
        {open
          ? <ChevronDown size={15} className="text-slate-500" />
          : <ChevronRight size={15} className="text-slate-500" />}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

export default function SettingsPage() {
  const [org, setOrg]           = useState<any>(null);
  const [orgId, setOrgId]       = useState<string | null>(null);
  const [members, setMembers]   = useState<any[]>([]);
  const [taxRules, setTaxRules] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'org' | 'members' | 'tax'>('org');

  // Invite form
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState('VIEWER');
  const [inviting, setInviting]       = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Org edit form
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (!orgs?.length) { setLoading(false); return; }
      const o = orgs[0];
      const id = o.id || o._id;
      setOrg(o);
      setOrgId(id);
      setEditForm({
        name: o.name || '', legal_name: o.legal_name || '',
        industry: o.industry || '', pan_number: o.pan_number || '',
        gstin: o.gstin || '', tan: o.tan || '',
        address: o.address || '', city: o.city || '',
        state: o.state || '', website: o.website || '',
        phone: o.phone || '', email: o.email || '',
      });
      // Load members + tax rules
      Promise.allSettled([
        orgApi.getMembers(id),
        businessTax.listTaxRules(id),
      ]).then(([m, t]) => {
        if (m.status === 'fulfilled') setMembers((m.value as any) || []);
        if (t.status === 'fulfilled') setTaxRules((t.value as any) || []);
      }).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true); setSaveError('');
    try {
      const updated: any = await orgApi.updateOrganization(orgId, editForm);
      setOrg(updated);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setInviting(true); setInviteError('');
    try {
      const m: any = await orgApi.inviteMember(orgId, { user_email: inviteEmail, role: inviteRole });
      setMembers(prev => [...prev, m]);
      setShowInvite(false); setInviteEmail(''); setInviteRole('VIEWER');
    } catch (err: any) {
      setInviteError(err.message || 'Invite failed');
    } finally { setInviting(false); }
  };

  const handleSeedTaxRules = async () => {
    if (!orgId || !confirm('Seed default Indian GST rates and TDS sections?')) return;
    try {
      await businessTax.seedTaxRules(orgId);
      const rules: any = await businessTax.listTaxRules(orgId);
      setTaxRules(rules || []);
    } catch (err: any) { alert(err.message); }
  };

  if (!orgId && !loading) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  const TABS = [
    { key: 'org',     label: '🏢 Organisation' },
    { key: 'members', label: '👥 Team Members' },
    { key: 'tax',     label: '📋 Tax Rules' },
  ] as const;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Organisation profile · Team · Tax rules configuration
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      ) : (
        <>
          {/* ── Organisation ─────────────────────────────────────────────────── */}
          {tab === 'org' && org && (
            <div className="card space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Building2 size={16} className="text-indigo-400" />
                  Organisation Profile
                </h2>
                {!editing && ['OWNER','ADMIN'].includes(org.user_role) && (
                  <button onClick={() => setEditing(true)} className="btn-secondary text-sm py-1.5 px-3">
                    <Pencil size={13} /> Edit
                  </button>
                )}
              </div>

              {!editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    ['Business Name',    org.name],
                    ['Legal Name',       org.legal_name],
                    ['Industry',         org.industry],
                    ['Business Type',    org.business_type?.replace(/_/g, ' ')],
                    ['PAN',              org.pan_number],
                    ['GSTIN',            org.gstin],
                    ['TAN',              org.tan],
                    ['Address',          [org.address, org.city, org.state].filter(Boolean).join(', ')],
                    ['Phone',            org.phone],
                    ['Email',            org.email],
                    ['Website',          org.website],
                    ['Accounting Method',org.accounting_method],
                    ['Fiscal Year',      org.fiscal_year_label],
                    ['Currency',         org.currency],
                  ].map(([label, value]) => value ? (
                    <div key={label} className="flex gap-3 text-sm">
                      <span className="text-slate-500 w-36 shrink-0">{label}</span>
                      <span className="text-slate-200 break-all">{value}</span>
                    </div>
                  ) : null)}
                </div>
              ) : (
                <form onSubmit={handleSaveOrg} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      ['Business Name',   'name',        'text'],
                      ['Legal Name',      'legal_name',  'text'],
                      ['Industry',        'industry',    'text'],
                      ['PAN Number',      'pan_number',  'text'],
                      ['GSTIN',           'gstin',       'text'],
                      ['TAN',             'tan',         'text'],
                      ['Address',         'address',     'text'],
                      ['City',            'city',        'text'],
                      ['State',           'state',       'text'],
                      ['Website',         'website',     'url'],
                      ['Phone',           'phone',       'tel'],
                      ['Email',           'email',       'email'],
                    ].map(([label, field, type]) => (
                      <div key={field} className={field === 'address' ? 'sm:col-span-2' : ''}>
                        <label className="input-label">{label}</label>
                        <input type={type} className="input"
                          value={editForm[field] || ''}
                          onChange={e => setEditForm((p: any) => ({ ...p, [field]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                  {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
                  <div className="flex gap-3 justify-end pt-2">
                    <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" disabled={saving} className="btn-primary">
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ── Team Members ──────────────────────────────────────────────────── */}
          {tab === 'members' && (
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Users size={16} className="text-indigo-400" />
                  Team Members · {members.length}
                </h2>
                {['OWNER','ADMIN'].includes(org?.user_role) && (
                  <button onClick={() => setShowInvite(s => !s)}
                    className="btn-secondary text-sm py-1.5 px-3">
                    <UserPlus size={14} /> Invite
                  </button>
                )}
              </div>

              {showInvite && (
                <form onSubmit={handleInvite}
                  className="flex gap-3 flex-wrap items-end p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                  <div className="flex-1 min-w-48">
                    <label className="input-label">Email</label>
                    <input type="email" className="input" placeholder="colleague@company.com"
                      value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
                  </div>
                  <div>
                    <label className="input-label">Role</label>
                    <select className="select" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                      {ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  {inviteError && <p className="text-red-400 text-sm w-full">{inviteError}</p>}
                  <button type="submit" disabled={inviting} className="btn-primary text-sm py-2">
                    {inviting ? '...' : 'Send Invite'}
                  </button>
                  <button type="button" onClick={() => setShowInvite(false)} className="btn-ghost p-2">
                    <X size={14} />
                  </button>
                </form>
              )}

              <div className="space-y-2">
                {members.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-sm font-bold text-indigo-300">
                        {(m.user_name || m.user_email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{m.user_name || 'User'}</p>
                        <p className="text-slate-500 text-xs">{m.user_email}</p>
                      </div>
                    </div>
                    <span className={`badge text-[11px] border ${ROLE_COLORS[m.role] || ROLE_COLORS['VIEWER']}`}>
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tax Rules ─────────────────────────────────────────────────────── */}
          {tab === 'tax' && (
            <div className="card space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldCheck size={16} className="text-indigo-400" />
                  Tax Rules Engine · {taxRules.length} rules
                </h2>
                {taxRules.length === 0 && (
                  <button onClick={handleSeedTaxRules} className="btn-primary text-sm py-1.5 px-3">
                    <Plus size={14} /> Seed Default Rules
                  </button>
                )}
              </div>

              <p className="text-slate-500 text-xs">
                Versioned GST rates and TDS section thresholds. Rules are resolved by effective date.
                Default rules are based on Indian FY 2024-25 rates.
              </p>

              {taxRules.length === 0 ? (
                <div className="empty-state py-8">
                  <div className="empty-icon">📋</div>
                  <p className="text-slate-400 text-sm mb-4">No tax rules configured. Seed the defaults to get started.</p>
                  <button onClick={handleSeedTaxRules} className="btn-primary">Seed Default Rules</button>
                </div>
              ) : (
                <div>
                  {/* GST rules */}
                  {['GST','TDS'].map(type => {
                    const rules = taxRules.filter((r: any) => r.tax_type === type);
                    if (rules.length === 0) return null;
                    return (
                      <div key={type} className="mb-4">
                        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">{type} Rules</p>
                        <div className="space-y-1.5">
                          {rules.map((r: any) => (
                            <div key={r._id || r.id}
                              className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-sm">
                              <div className="flex items-center gap-3">
                                <span className={`badge text-[11px] border ${TAX_TYPE_COLORS[r.tax_type] || ''}`}>
                                  {r.section}
                                </span>
                                <span className="text-slate-300">{r.description}</span>
                              </div>
                              <div className="flex items-center gap-4 shrink-0">
                                <span className="text-white font-semibold font-mono">{r.rate_pct}%</span>
                                {r.threshold > 0 && (
                                  <span className="text-slate-500 text-xs">
                                    Threshold: ₹{r.threshold.toLocaleString()}
                                  </span>
                                )}
                                {r.is_default && (
                                  <span className="badge-neutral text-[10px]">default</span>
                                )}
                                {!r.is_active && (
                                  <span className="text-red-400 text-[10px]">inactive</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-slate-600 text-xs">
                ⚠️ Tax rules are for decision support. Verify all rates against official government notifications before filing.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
