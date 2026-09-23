'use client';

import { useEffect, useState, useCallback } from 'react';
import { businessOrg as orgApi, businessBudgets } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { Plus, Trash2, AlertCircle, Wallet, PieChart, X } from 'lucide-react';

const CATEGORIES = [
  'TRAVEL', 'MARKETING', 'PAYROLL', 'SOFTWARE', 'RENT',
  'OFFICE_SUPPLIES', 'UTILITIES', 'PROFESSIONAL_FEES',
  'MARKETING', 'MEALS', 'INSURANCE', 'OTHER',
];

export default function BusinessBudgetsPage() {
  const [orgId, setOrgId]     = useState<string | null>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data: any = await businessBudgets.getBudgets(orgId);
      setBudgets(data || []);
    } catch {}
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true); setError('');
    try {
      await businessBudgets.createBudget(orgId, {
        category,
        amount: parseFloat(amount),
        period: 'MONTHLY',
      });
      setShowForm(false);
      setAmount('');
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create budget');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!orgId || !confirm('Delete this budget?')) return;
    try { await businessBudgets.deleteBudget(orgId, id); load(); }
    catch (err: any) { alert(err.message); }
  };

  if (!orgId && !loading) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  // Summary
  const totalBudgeted = budgets.reduce((s: number, b: any) => s + (b.amount || 0), 0);
  const totalSpent    = budgets.reduce((s: number, b: any) => s + (b.current_spend || 0), 0);
  const overBudget    = budgets.filter((b: any) => (b.utilization_pct || 0) >= 100).length;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <PieChart size={22} className="text-indigo-400" />
            Budget Planner
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Track monthly category spending against limits
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> New Budget
        </button>
      </div>

      {/* Summary cards */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="metric-card py-4">
            <p className="metric-label">Total Budgeted</p>
            <p className="metric-value">{formatINR(totalBudgeted, true)}</p>
          </div>
          <div className="metric-card py-4">
            <p className="metric-label">Total Spent</p>
            <p className={`text-2xl font-bold mt-1 ${totalSpent > totalBudgeted ? 'text-red-400' : 'text-white'}`}>
              {formatINR(totalSpent, true)}
            </p>
          </div>
          <div className="metric-card py-4">
            <p className="metric-label">Over Budget</p>
            <p className={`text-2xl font-bold mt-1 ${overBudget > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {overBudget} categor{overBudget === 1 ? 'y' : 'ies'}
            </p>
          </div>
        </div>
      )}

      {/* New budget form */}
      {showForm && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">New Monthly Budget</h2>
            <button onClick={() => setShowForm(false)} className="btn-ghost p-1.5"><X size={15} /></button>
          </div>
          <form onSubmit={handleCreate} className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="input-label">Category</label>
              <select className="select w-44" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Monthly Limit (₹)</label>
              <input type="number" className="input w-44" min="1" step="1000"
                placeholder="50,000" value={amount}
                onChange={e => setAmount(e.target.value)} required />
            </div>
            {error && <p className="text-red-400 text-sm w-full">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : 'Create Budget'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Budget cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      ) : budgets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3 className="text-white font-medium mb-1">No budgets set</h3>
          <p className="text-slate-400 text-sm mb-4">
            Create category budgets to track spending against limits each month.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary">New Budget</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgets.map((budget: any) => {
            const util      = budget.utilization_pct || 0;
            const remaining = Math.max(0, budget.amount - budget.current_spend);
            const barColor  = util >= 100 ? 'bg-red-500' : util >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
            const textColor = util >= 100 ? 'text-red-400' : util >= 80 ? 'text-amber-400' : 'text-emerald-400';

            return (
              <div key={budget.id || budget._id}
                className={`card group relative ${util >= 100 ? 'border-red-500/20' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-white font-semibold">{budget.category.replace(/_/g, ' ')}</h3>
                    <span className="badge-neutral text-xs mt-1">{budget.period}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {util >= 100 && <AlertCircle size={16} className="text-red-400" />}
                    <button onClick={() => handleDelete(budget.id || budget._id)}
                      className="btn-ghost p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-end mb-3">
                  <div>
                    <p className="text-slate-500 text-xs">Spent</p>
                    <p className="text-white font-bold text-xl">{formatINR(budget.current_spend || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500 text-xs">Limit</p>
                    <p className="text-slate-300 font-medium">{formatINR(budget.amount)}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full transition-all duration-700`}
                    style={{ width: `${Math.min(util, 100)}%` }} />
                </div>

                <div className="flex justify-between mt-2">
                  <span className={`text-xs font-semibold ${textColor}`}>
                    {util.toFixed(1)}% used
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatINR(remaining)} remaining
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
