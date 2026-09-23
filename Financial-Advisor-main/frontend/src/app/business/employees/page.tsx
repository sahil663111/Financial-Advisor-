'use client';

import { useEffect, useState, useCallback } from 'react';
import { businessOrg as orgApi, businessPayroll as api } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import { Plus, Search, Pencil, X, Users, Building2, ChevronDown, ChevronRight } from 'lucide-react';

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];
const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Finance', 'HR', 'Operations', 'Product', 'Design', 'Other'];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:     'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  INACTIVE:   'text-amber-400  bg-amber-400/10  border-amber-400/20',
  TERMINATED: 'text-red-400    bg-red-400/10    border-red-400/20',
};

const EMPTY_FORM = {
  first_name: '', last_name: '', email: '', phone: '',
  designation: '', department: 'Engineering',
  employment_type: 'FULL_TIME',
  date_of_joining: new Date().toISOString().slice(0, 10),
  pan_number: '', bank_name: '', bank_account_number: '', ifsc_code: '',
  basic_salary: '', hra: '', special_allowance: '', other_allowances: '',
  pf_applicable: true, tds_monthly: '0', professional_tax: '200',
  other_deductions: '0', other_deductions_label: '',
};

// ── Live salary preview ───────────────────────────────────────────────────────
function SalaryPreview({ form }: { form: typeof EMPTY_FORM }) {
  const basic   = parseFloat(form.basic_salary) || 0;
  const hra     = parseFloat(form.hra) || 0;
  const special = parseFloat(form.special_allowance) || 0;
  const other   = parseFloat(form.other_allowances) || 0;
  const gross   = basic + hra + special + other;

  const pfBase    = form.pf_applicable ? Math.min(basic, 15000) : 0;
  const pfEmp     = Math.round(pfBase * 0.12);
  const pfEr      = Math.round(pfBase * 0.12);
  const esicEmp   = gross > 0 && gross <= 21000 ? Math.round(gross * 0.0075) : 0;
  const esicEr    = gross > 0 && gross <= 21000 ? Math.round(gross * 0.0325) : 0;
  const tds       = parseFloat(form.tds_monthly) || 0;
  const pt        = parseFloat(form.professional_tax) || 0;
  const otherDed  = parseFloat(form.other_deductions) || 0;
  const totalDed  = pfEmp + esicEmp + tds + pt + otherDed;
  const net       = gross - totalDed;
  const ctc       = gross + pfEr + esicEr;

  if (gross === 0) return null;

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 space-y-2 text-sm">
      <p className="text-slate-300 font-medium text-xs uppercase tracking-wider mb-3">Salary Preview</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {[
          ['Basic', basic], ['HRA', hra], ['Special Allowance', special], ['Other Allowances', other],
        ].map(([label, val]) => val > 0 ? (
          <div key={label as string} className="flex justify-between">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-200 font-mono">{formatINR(val as number)}</span>
          </div>
        ) : null)}
        <div className="flex justify-between col-span-2 border-t border-slate-700 pt-1.5">
          <span className="text-white font-semibold">Gross Salary</span>
          <span className="text-white font-mono font-semibold">{formatINR(gross)}</span>
        </div>
        <div className="col-span-2 pt-1">
          <p className="text-slate-500 text-xs mb-1">Deductions</p>
          {pfEmp > 0 && <div className="flex justify-between"><span className="text-slate-500">PF (Employee 12%)</span><span className="text-red-400 font-mono">−{formatINR(pfEmp)}</span></div>}
          {esicEmp > 0 && <div className="flex justify-between"><span className="text-slate-500">ESIC (Employee 0.75%)</span><span className="text-red-400 font-mono">−{formatINR(esicEmp)}</span></div>}
          {tds > 0 && <div className="flex justify-between"><span className="text-slate-500">TDS</span><span className="text-red-400 font-mono">−{formatINR(tds)}</span></div>}
          {pt > 0 && <div className="flex justify-between"><span className="text-slate-500">Professional Tax</span><span className="text-red-400 font-mono">−{formatINR(pt)}</span></div>}
        </div>
        <div className="flex justify-between col-span-2 border-t border-slate-700 pt-1.5">
          <span className="text-emerald-400 font-semibold">Net Take-Home</span>
          <span className="text-emerald-400 font-mono font-bold text-base">{formatINR(net)}</span>
        </div>
        <div className="flex justify-between col-span-2 text-xs">
          <span className="text-slate-600">Employer CTC (incl. PF+ESIC)</span>
          <span className="text-slate-500 font-mono">{formatINR(ctc)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Employee form ─────────────────────────────────────────────────────────────
function EmployeeForm({ orgId, initial, onSaved, onCancel }: {
  orgId: string;
  initial?: any;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial ? {
    ...EMPTY_FORM,
    first_name: initial.first_name || '',
    last_name: initial.last_name || '',
    email: initial.email || '',
    phone: initial.phone || '',
    designation: initial.designation || '',
    department: initial.department || 'Engineering',
    employment_type: initial.employment_type || 'FULL_TIME',
    date_of_joining: initial.date_of_joining?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    pan_number: initial.pan_number || '',
    bank_name: initial.bank_name || '',
    bank_account_number: initial.bank_account_number || '',
    ifsc_code: initial.ifsc_code || '',
    basic_salary: String(initial.basic_salary || ''),
    hra: String(initial.hra || ''),
    special_allowance: String(initial.special_allowance || ''),
    other_allowances: String(initial.other_allowances || ''),
    pf_applicable: initial.pf_applicable ?? true,
    tds_monthly: String(initial.tds_monthly || '0'),
    professional_tax: String(initial.professional_tax || '200'),
    other_deductions: String(initial.other_deductions || '0'),
    other_deductions_label: initial.other_deductions_label || '',
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'basic' | 'salary' | 'bank'>('basic');
  const set = (f: string, v: any) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        date_of_joining: new Date(form.date_of_joining).toISOString(),
        basic_salary: parseFloat(form.basic_salary) || 0,
        hra: parseFloat(form.hra) || 0,
        special_allowance: parseFloat(form.special_allowance) || 0,
        other_allowances: parseFloat(form.other_allowances) || 0,
        tds_monthly: parseFloat(form.tds_monthly) || 0,
        professional_tax: parseFloat(form.professional_tax) || 200,
        other_deductions: parseFloat(form.other_deductions) || 0,
      };
      if (initial) await api.updateEmployee(orgId, initial._id, payload);
      else await api.createEmployee(orgId, payload);
      onSaved();
    } catch (err: any) { setError(err.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl mb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{initial ? 'Edit Employee' : 'Add Employee'}</h2>
          <button onClick={onCancel} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 bg-slate-800 rounded-xl p-1 mb-5">
          {(['basic', 'salary', 'bank'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {t === 'basic' ? '👤 Personal' : t === 'salary' ? '💰 Salary' : '🏦 Bank'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic info */}
          {tab === 'basic' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="input-label">First Name *</label><input className="input" value={form.first_name} onChange={e => set('first_name', e.target.value)} required /></div>
              <div><label className="input-label">Last Name *</label><input className="input" value={form.last_name} onChange={e => set('last_name', e.target.value)} required /></div>
              <div><label className="input-label">Email *</label><input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} required /></div>
              <div><label className="input-label">Phone</label><input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
              <div><label className="input-label">Designation</label><input className="input" placeholder="Software Engineer" value={form.designation} onChange={e => set('designation', e.target.value)} /></div>
              <div>
                <label className="input-label">Department</label>
                <select className="select" value={form.department} onChange={e => set('department', e.target.value)}>
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Employment Type</label>
                <select className="select" value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
                  {EMPLOYMENT_TYPES.map(t => <option key={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div><label className="input-label">Date of Joining *</label><input type="date" className="input" value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} required /></div>
              <div className="sm:col-span-2"><label className="input-label">PAN Number</label><input className="input font-mono uppercase" value={form.pan_number} onChange={e => set('pan_number', e.target.value.toUpperCase())} maxLength={10} /></div>
            </div>
          )}

          {/* Salary */}
          {tab === 'salary' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="input-label">Basic Salary (₹) *</label><input type="number" step="100" className="input" value={form.basic_salary} onChange={e => set('basic_salary', e.target.value)} /></div>
                <div><label className="input-label">HRA (₹)</label><input type="number" step="100" className="input" value={form.hra} onChange={e => set('hra', e.target.value)} /></div>
                <div><label className="input-label">Special Allowance (₹)</label><input type="number" step="100" className="input" value={form.special_allowance} onChange={e => set('special_allowance', e.target.value)} /></div>
                <div><label className="input-label">Other Allowances (₹)</label><input type="number" step="100" className="input" value={form.other_allowances} onChange={e => set('other_allowances', e.target.value)} /></div>
                <div><label className="input-label">TDS Monthly (₹)</label><input type="number" step="100" className="input" value={form.tds_monthly} onChange={e => set('tds_monthly', e.target.value)} /></div>
                <div><label className="input-label">Professional Tax (₹)</label><input type="number" step="50" className="input" value={form.professional_tax} onChange={e => set('professional_tax', e.target.value)} /></div>
                <div><label className="input-label">Other Deductions (₹)</label><input type="number" step="100" className="input" value={form.other_deductions} onChange={e => set('other_deductions', e.target.value)} /></div>
                <div><label className="input-label">Deduction Label</label><input className="input" placeholder="Loan EMI" value={form.other_deductions_label} onChange={e => set('other_deductions_label', e.target.value)} /></div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="pf" className="accent-indigo-500" checked={form.pf_applicable} onChange={e => set('pf_applicable', e.target.checked)} />
                <label htmlFor="pf" className="text-slate-300 text-sm select-none cursor-pointer">PF applicable (12% of Basic, max ₹15,000 base)</label>
              </div>
              <SalaryPreview form={form} />
            </div>
          )}

          {/* Bank */}
          {tab === 'bank' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="input-label">Bank Name</label><input className="input" value={form.bank_name} onChange={e => set('bank_name', e.target.value)} /></div>
              <div><label className="input-label">Account Number</label><input className="input font-mono" value={form.bank_account_number} onChange={e => set('bank_account_number', e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="input-label">IFSC Code</label><input className="input font-mono uppercase" value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value.toUpperCase())} /></div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 justify-end pt-2 border-t border-slate-800">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            {tab !== 'bank' ? (
              <button type="button" onClick={() => setTab(tab === 'basic' ? 'salary' : 'bank')} className="btn-secondary">Next →</button>
            ) : (
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : initial ? 'Update Employee' : 'Add Employee'}</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EmployeesPage() {
  const [orgId, setOrgId]   = useState<string | null>(null);
  const [data, setData]     = useState<any>({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dept, setDept]     = useState('');
  const [page, setPage]     = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editEmp, setEditEmp]   = useState<any>(null);
  const [deptSummary, setDeptSummary] = useState<any[]>([]);
  const [showDept, setShowDept] = useState(false);

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (search) params.search = search;
      if (dept)   params.department = dept;
      const res: any = await api.listEmployees(orgId, params);
      setData(res);
    } catch {} finally { setLoading(false); }
  }, [orgId, page, search, dept]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (orgId) api.getDepartmentSummary(orgId).then((d: any) => setDeptSummary(d || []));
  }, [orgId]);

  const handleTerminate = async (emp: any) => {
    const reason = prompt(`Terminate ${emp.full_name}? Enter reason:`);
    if (reason === null) return;
    try {
      await api.terminateEmployee(orgId!, emp._id, reason || undefined);
      load();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Users size={22} className="text-indigo-400" />Employees</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data.total} active employees</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowDept(s => !s)} className={`btn-secondary text-sm py-1.5 px-3 ${showDept ? 'border-indigo-500/50' : ''}`}>
            <Building2 size={14} /> Departments
          </button>
          <button onClick={() => { setEditEmp(null); setShowForm(true); }} className="btn-primary">
            <Plus size={16} /> Add Employee
          </button>
        </div>
      </div>

      {/* Department summary */}
      {showDept && deptSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {deptSummary.map(d => (
            <div key={d.department} className="card-sm cursor-pointer hover:border-indigo-500/30"
              onClick={() => { setDept(d.department); setShowDept(false); }}>
              <p className="text-slate-400 text-xs">{d.department}</p>
              <p className="text-white font-bold text-lg">{d.headcount}</p>
              <p className="text-slate-500 text-xs">employees</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
          <input className="input pl-9 text-sm" placeholder="Search by name, email, code..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="select w-44 text-sm" value={dept}
          onChange={e => { setDept(e.target.value); setPage(1); }}>
          <option value="">All Departments</option>
          {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
        </select>
        {dept && <button onClick={() => setDept('')} className="btn-ghost text-xs text-red-400 py-2 px-3">Clear ×</button>}
      </div>

      {loading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : data.data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <h3 className="text-white font-medium mb-1">No employees found</h3>
          <p className="text-slate-400 text-sm mb-4">Add employees to start running payroll</p>
          <button onClick={() => setShowForm(true)} className="btn-primary">Add Employee</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table w-full">
            <thead><tr className="border-b border-slate-800">
              <th className="py-3 px-4 text-left">Employee</th>
              <th className="py-3 px-4 text-left hidden md:table-cell">Department</th>
              <th className="py-3 px-4 text-right hidden sm:table-cell">Gross</th>
              <th className="py-3 px-4 text-right">Net Salary</th>
              <th className="py-3 px-4 text-left hidden lg:table-cell">Type</th>
              <th className="py-3 px-4 text-left hidden lg:table-cell">Status</th>
              <th className="py-3 px-4 w-20"></th>
            </tr></thead>
            <tbody>
              {data.data.map((emp: any) => {
                const s = emp.salary_summary;
                return (
                  <tr key={emp._id} className="border-b border-slate-800/50 hover:bg-slate-800/10">
                    <td className="py-3 px-4">
                      <p className="text-white font-medium text-sm">{emp.full_name}</p>
                      <p className="text-slate-500 text-xs">{emp.employee_code} · {emp.designation || '—'}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-sm hidden md:table-cell">{emp.department || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono text-sm text-slate-400 hidden sm:table-cell">
                      {s ? formatINR(s.gross_salary) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-sm text-white">
                      {s ? formatINR(s.net_salary) : '—'}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <span className="text-xs text-slate-500">{emp.employment_type?.replace('_', ' ')}</span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <span className={`badge text-[11px] border ${STATUS_COLORS[emp.status] || ''}`}>{emp.status}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditEmp(emp); setShowForm(true); }} className="btn-ghost p-1.5"><Pencil size={13} /></button>
                        {emp.status === 'ACTIVE' && (
                          <button onClick={() => handleTerminate(emp)} className="btn-ghost p-1.5 text-red-400 text-xs">
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      {showForm && orgId && (
        <EmployeeForm
          orgId={orgId}
          initial={editEmp}
          onSaved={() => { setShowForm(false); setEditEmp(null); load(); }}
          onCancel={() => { setShowForm(false); setEditEmp(null); }}
        />
      )}
    </div>
  );
}
