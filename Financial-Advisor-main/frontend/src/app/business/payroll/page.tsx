'use client';

import { useEffect, useState, useCallback } from 'react';
import { businessOrg as orgApi, businessPayroll as api } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import { Plus, CheckCircle, CreditCard, X, FileText, ChevronDown, ChevronRight } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  DRAFT:     'text-amber-400  bg-amber-400/10  border-amber-400/20',
  PROCESSED: 'text-blue-400   bg-blue-400/10   border-blue-400/20',
  APPROVED:  'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  PAID:      'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
};

const MONTHS = [
  '', 'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Run Payroll form ──────────────────────────────────────────────────────────
function RunPayrollForm({ orgId, onCreated, onCancel }: {
  orgId: string; onCreated: () => void; onCancel: () => void;
}) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [payDate, setPayDate] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.runPayroll(orgId, {
        period_year: year,
        period_month: month,
        payment_date: new Date(payDate).toISOString(),
        notes: notes || null,
      });
      onCreated();
    } catch (err: any) { setError(err.message || 'Failed to run payroll'); }
    finally { setSaving(false); }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Run Payroll</h2>
          <button onClick={onCancel} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Month *</label>
              <select className="select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
                {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Year *</label>
              <select className="select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="input-label">Payment Date *</label>
            <input type="date" className="input" value={payDate} onChange={e => setPayDate(e.target.value)} required />
          </div>
          <div>
            <label className="input-label">Notes</label>
            <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="rounded-xl bg-indigo-950/40 border border-indigo-500/20 p-3 text-xs text-indigo-300">
            This will calculate gross, PF, ESIC, TDS, and net salary for all active employees.
            The run will be in <strong>DRAFT</strong> status until approved.
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Processing...' : 'Run Payroll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Payslip viewer ────────────────────────────────────────────────────────────
function PayslipViewer({ orgId, runId, employeeId, onClose }: {
  orgId: string; runId: string; employeeId: string; onClose: () => void;
}) {
  const [slip, setSlip] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPayslip(orgId, runId, employeeId)
      .then((d: any) => setSlip(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId, runId, employeeId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Payslip</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        {loading ? (
          <div className="space-y-2">{Array(8).fill(0).map((_, i) => <div key={i} className="skeleton h-8 rounded-lg" />)}</div>
        ) : !slip ? (
          <p className="text-slate-400 text-center py-8">Payslip not found</p>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="text-center border-b border-slate-800 pb-4">
              <p className="text-white font-bold text-lg">{slip.org_name}</p>
              <p className="text-indigo-400 font-semibold">Payslip — {slip.period_label}</p>
              <span className={`badge text-xs border mt-1 inline-block ${STATUS_STYLES[slip.status] || ''}`}>{slip.status}</span>
            </div>
            {/* Employee */}
            <div className="rounded-xl bg-slate-800/50 p-4 space-y-1 text-sm">
              <p className="text-white font-semibold">{slip.full_name}</p>
              <p className="text-slate-400">{slip.designation} · {slip.department}</p>
              <p className="text-slate-500 font-mono text-xs">{slip.employee_code}</p>
            </div>
            {/* Earnings */}
            <div className="space-y-1.5 text-sm">
              <p className="text-slate-400 uppercase text-xs tracking-wider font-medium mb-2">Earnings</p>
              {[
                ['Basic Salary',       slip.basic_salary],
                ['HRA',               slip.hra],
                ['Special Allowance', slip.special_allowance],
                ['Other Allowances',  slip.other_allowances],
              ].map(([label, val]) => (val as number) > 0 ? (
                <div key={label as string} className="flex justify-between">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-white font-mono">{formatINR(val as number)}</span>
                </div>
              ) : null)}
              <div className="flex justify-between border-t border-slate-800 pt-1.5 font-semibold">
                <span className="text-white">Gross Salary</span>
                <span className="text-white font-mono">{formatINR(slip.gross_salary)}</span>
              </div>
            </div>
            {/* Deductions */}
            <div className="space-y-1.5 text-sm">
              <p className="text-slate-400 uppercase text-xs tracking-wider font-medium mb-2">Deductions</p>
              {[
                ['PF (Employee)',       slip.pf_employee],
                ['ESIC (Employee)',     slip.esic_employee],
                ['TDS',                slip.tds],
                ['Professional Tax',   slip.professional_tax],
                ['Other Deductions',   slip.other_deductions],
              ].map(([label, val]) => (val as number) > 0 ? (
                <div key={label as string} className="flex justify-between">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-red-400 font-mono">−{formatINR(val as number)}</span>
                </div>
              ) : null)}
              <div className="flex justify-between border-t border-slate-800 pt-1.5">
                <span className="text-slate-400">Total Deductions</span>
                <span className="text-red-400 font-mono">−{formatINR(slip.total_deductions)}</span>
              </div>
            </div>
            {/* Net */}
            <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/20 p-4 flex justify-between items-center">
              <span className="text-emerald-300 font-semibold">Net Take-Home</span>
              <span className="text-emerald-400 font-mono font-bold text-xl">{formatINR(slip.net_salary)}</span>
            </div>
            {/* Employer contribution note */}
            {(slip.pf_employer > 0 || slip.esic_employer > 0) && (
              <p className="text-slate-600 text-xs text-center">
                Employer contributions: PF {formatINR(slip.pf_employer)} + ESIC {formatINR(slip.esic_employer)} = Total CTC {formatINR(slip.employer_cost)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Payroll run detail row ────────────────────────────────────────────────────
function PayrollRunRow({ run, orgId, onAction }: {
  run: any; orgId: string; onAction: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail]     = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [viewSlip, setViewSlip] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [paying, setPaying]     = useState(false);

  const loadDetail = async () => {
    if (detail) { setExpanded(e => !e); return; }
    setLoadingDetail(true);
    try {
      const d: any = await api.getPayrollRun(orgId, run._id);
      setDetail(d); setExpanded(true);
    } catch {}
    setLoadingDetail(false);
  };

  const handleApprove = async () => {
    if (!confirm(`Approve payroll for ${run.period_label}? This will post the journal entry to accounting.`)) return;
    setApproving(true);
    try { await api.approvePayroll(orgId, run._id, {}); onAction(); }
    catch (err: any) { alert(err.message); }
    finally { setApproving(false); }
  };

  const handleMarkPaid = async () => {
    const ref = prompt('Enter payment reference (UTR / transaction ID):');
    if (ref === null) return;
    setPaying(true);
    try { await api.markPayrollPaid(orgId, run._id, { payment_reference: ref }); onAction(); }
    catch (err: any) { alert(err.message); }
    finally { setPaying(false); }
  };

  return (
    <>
      <tr className="border-b border-slate-800/50 hover:bg-slate-800/10 cursor-pointer"
        onClick={loadDetail}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
            <span className="text-white font-medium text-sm">{run.period_label}</span>
          </div>
        </td>
        <td className="py-3 px-4 text-slate-400 text-sm hidden sm:table-cell">{run.employee_count} employees</td>
        <td className="py-3 px-4 text-right font-mono text-sm hidden md:table-cell text-slate-400">
          {formatINR(run.totals?.gross || 0)}
        </td>
        <td className="py-3 px-4 text-right font-mono font-semibold text-sm text-white">
          {formatINR(run.totals?.net_salary || 0)}
        </td>
        <td className="py-3 px-4">
          <span className={`badge text-[11px] border ${STATUS_STYLES[run.status] || ''}`}>{run.status}</span>
        </td>
        <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            {run.status === 'DRAFT' && (
              <button onClick={handleApprove} disabled={approving}
                className="btn-ghost p-1.5 text-indigo-400" title="Approve">
                <CheckCircle size={14} />
              </button>
            )}
            {run.status === 'APPROVED' && (
              <button onClick={handleMarkPaid} disabled={paying}
                className="btn-ghost p-1.5 text-emerald-400" title="Mark Paid">
                <CreditCard size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded employee details */}
      {expanded && (
        <tr className="border-b border-slate-800/50">
          <td colSpan={6} className="px-4 py-3 bg-slate-950/40">
            {loadingDetail ? (
              <div className="space-y-1">{Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-8 rounded" />)}</div>
            ) : detail?.items?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500 uppercase tracking-wider">
                    <th className="pb-2 text-left">Employee</th>
                    <th className="pb-2 text-right">Gross</th>
                    <th className="pb-2 text-right">PF</th>
                    <th className="pb-2 text-right">ESIC</th>
                    <th className="pb-2 text-right">TDS</th>
                    <th className="pb-2 text-right">Net</th>
                    <th className="pb-2 w-10"></th>
                  </tr></thead>
                  <tbody>
                    {detail.items.map((item: any) => (
                      <tr key={item.employee_id} className="border-t border-slate-800/30">
                        <td className="py-1.5">
                          <p className="text-white">{item.full_name}</p>
                          <p className="text-slate-600">{item.designation}</p>
                        </td>
                        <td className="py-1.5 text-right font-mono text-slate-300">{formatINR(item.gross_salary)}</td>
                        <td className="py-1.5 text-right font-mono text-slate-500">{item.pf_employee > 0 ? formatINR(item.pf_employee) : '—'}</td>
                        <td className="py-1.5 text-right font-mono text-slate-500">{item.esic_employee > 0 ? formatINR(item.esic_employee) : '—'}</td>
                        <td className="py-1.5 text-right font-mono text-slate-500">{item.tds > 0 ? formatINR(item.tds) : '—'}</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-white">{formatINR(item.net_salary)}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => setViewSlip(item.employee_id)}
                            className="btn-ghost p-1 text-indigo-400" title="View payslip">
                            <FileText size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-slate-500 text-sm py-2">No employee data</p>}
          </td>
        </tr>
      )}

      {viewSlip && orgId && (
        <PayslipViewer
          orgId={orgId}
          runId={run._id}
          employeeId={viewSlip}
          onClose={() => setViewSlip(null)}
        />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const [orgId, setOrgId]   = useState<string | null>(null);
  const [data, setData]     = useState<any>({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage]     = useState(1);

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res: any = await api.listPayrollRuns(orgId, { page, limit: 24 });
      setData(res);
    } catch {} finally { setLoading(false); }
  }, [orgId, page]);

  useEffect(() => { load(); }, [load]);

  // Summary from latest run
  const latestRun = data.data[0];

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Payroll</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data.total} payroll run(s)</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> Run Payroll
        </button>
      </div>

      {/* Latest run summary */}
      {latestRun && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="metric-card py-4">
            <p className="metric-label">Latest Period</p>
            <p className="text-white font-semibold text-sm mt-1">{latestRun.period_label}</p>
          </div>
          <div className="metric-card py-4">
            <p className="metric-label">Employees</p>
            <p className="metric-value">{latestRun.employee_count}</p>
          </div>
          <div className="metric-card py-4">
            <p className="metric-label">Gross Payroll</p>
            <p className="metric-value">{formatINR(latestRun.totals?.gross || 0, true)}</p>
          </div>
          <div className="metric-card py-4">
            <p className="metric-label">Net Payroll</p>
            <p className="metric-value text-emerald-400">{formatINR(latestRun.totals?.net_salary || 0, true)}</p>
          </div>
        </div>
      )}

      {/* Runs table */}
      {loading ? (
        <div className="space-y-2">{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : data.data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💼</div>
          <h3 className="text-white font-medium mb-1">No payroll runs yet</h3>
          <p className="text-slate-400 text-sm mb-4">Run your first payroll to get started</p>
          <button onClick={() => setShowForm(true)} className="btn-primary">Run Payroll</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table w-full">
            <thead><tr className="border-b border-slate-800">
              <th className="py-3 px-4 text-left">Period</th>
              <th className="py-3 px-4 text-left hidden sm:table-cell">Employees</th>
              <th className="py-3 px-4 text-right hidden md:table-cell">Gross</th>
              <th className="py-3 px-4 text-right">Net</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 w-20"></th>
            </tr></thead>
            <tbody>
              {data.data.map((run: any) => (
                <PayrollRunRow key={run._id} run={run} orgId={orgId!} onAction={load} />
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

      {showForm && orgId && (
        <RunPayrollForm
          orgId={orgId}
          onCreated={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
