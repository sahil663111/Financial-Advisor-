'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessFinance as api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { RefreshCw, CheckCircle, AlertCircle, TrendingUp, TrendingDown, Download } from 'lucide-react';

// ── CSV download helper ───────────────────────────────────────────────────────
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const SUB_LABELS: Record<string, string> = {
  CURRENT_ASSET: 'Current Assets', FIXED_ASSET: 'Fixed Assets',
  BANK: 'Bank', CASH: 'Cash', ACCOUNTS_RECEIVABLE: 'Accounts Receivable',
  INVENTORY: 'Inventory', OTHER_ASSET: 'Other Assets',
  CURRENT_LIABILITY: 'Current Liabilities', LONG_TERM_LIABILITY: 'Long-Term Liabilities',
  ACCOUNTS_PAYABLE: 'Accounts Payable', TAX_PAYABLE: 'Tax Payable',
  LOANS: 'Loans', OTHER_LIABILITY: 'Other Liabilities',
  OWNERS_EQUITY: "Owner's Equity", RETAINED_EARNINGS: 'Retained Earnings',
  OPERATING_REVENUE: 'Operating Revenue', OTHER_INCOME: 'Other Income',
  COST_OF_GOODS: 'Cost of Goods Sold', OPERATING_EXPENSE: 'Operating Expenses',
  PAYROLL_EXPENSE: 'Payroll', TAX_EXPENSE: 'Tax', DEPRECIATION: 'Depreciation',
  INTEREST_EXPENSE: 'Finance Costs', OTHER_EXPENSE: 'Other Expenses',
};

function GroupSection({ title, groups, total, positive = true }: {
  title: string; groups: Record<string, any[]>; total: number; positive?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/40 hover:bg-slate-800/60">
        <span className="text-white font-semibold text-sm">{title}</span>
        <div className="flex items-center gap-3">
          <span className={`font-mono font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatINR(total)}
          </span>
          <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-slate-800/50">
          {Object.entries(groups).map(([sub, items]) => (
            <div key={sub} className="px-4 py-2">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1.5">
                {SUB_LABELS[sub] || sub}
              </p>
              {items.map((item: any) => (
                <div key={item.code} className="flex justify-between items-center py-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-600">{item.code}</span>
                    <span className="text-slate-300">{item.name}</span>
                  </div>
                  <span className="font-mono text-white">{formatINR(item.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1 border-t border-slate-800/40 mt-1">
                <span className="text-slate-500 text-xs">Subtotal</span>
                <span className="font-mono text-sm text-slate-200 font-medium">
                  {formatINR(items.reduce((s: number, i: any) => s + i.balance, 0))}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Ratio card ────────────────────────────────────────────────────────────────
function RatioCard({ ratio }: { ratio: any }) {
  const val = ratio.value;
  const hasValue = val !== null && val !== undefined;

  const catColors: Record<string, string> = {
    Liquidity:     'border-blue-500/20   bg-blue-950/10',
    Profitability: 'border-emerald-500/20 bg-emerald-950/10',
    Leverage:      'border-amber-500/20  bg-amber-950/10',
    Efficiency:    'border-purple-500/20 bg-purple-950/10',
  };

  return (
    <div className={`card py-4 space-y-2 border ${catColors[ratio.category] || ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider">{ratio.category}</p>
          <p className="text-slate-200 text-sm font-medium mt-0.5">{ratio.label}</p>
        </div>
        <p className={`font-mono font-bold text-xl shrink-0 ${
          !hasValue ? 'text-slate-600'
          : ratio.category === 'Profitability' ? (val > 0 ? 'text-emerald-400' : 'text-red-400')
          : ratio.category === 'Leverage' ? (val < 1 ? 'text-emerald-400' : 'text-amber-400')
          : 'text-white'
        }`}>
          {hasValue ? `${val}${ratio.unit || ''}` : '—'}
        </p>
      </div>
      <div className="text-xs space-y-1">
        <p className="text-indigo-400 font-medium">{ratio.benchmark}</p>
        <p className="text-slate-500 leading-relaxed">{ratio.explanation}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [pnl, setPnl]     = useState<any>(null);
  const [bs, setBs]       = useState<any>(null);
  const [ratios, setRatios] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]     = useState<'pnl' | 'bs' | 'ratios'>('pnl');
  const [exporting, setExporting] = useState(false);

  const handleExport = async (type: 'pnl' | 'bs' | 'trial-balance' | 'cashflow', format: 'csv' | 'pdf' | 'excel' = 'csv') => {
    if (!orgId) return;
    setExporting(true);
    try {
      let blob: Blob;
      let filename: string;
      const date = new Date().toISOString().slice(0, 10);
      const ext = format === 'excel' ? 'xlsx' : format;
      if (type === 'pnl') {
        blob = await api.exportPnL(orgId, format);
        filename = `PnL_${date}.${ext}`;
      } else if (type === 'bs') {
        blob = await api.exportBalanceSheet(orgId, format);
        filename = `BalanceSheet_${date}.${ext}`;
      } else if (type === 'trial-balance') {
        blob = await api.exportTrialBalance(orgId, format);
        filename = `TrialBalance_${date}.${ext}`;
      } else {
        blob = await api.exportCashFlow(orgId, format);
        filename = `CashFlow_${date}.${ext}`;
      }
      downloadBlob(blob, filename);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally { setExporting(false); }
  };

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const [pnlData, bsData, ratiosData]: any[] = await Promise.all([
        api.getProfitLoss(id),
        api.getBalanceSheet(id),
        api.getFinancialRatios(id),
      ]);
      setPnl(pnlData);
      setBs(bsData);
      setRatios(ratiosData);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { if (orgId) load(orgId); }, [orgId]);

  if (!orgId) return (
    <div className="p-8 text-center"><div className="card max-w-md mx-auto py-12">
      <p className="text-slate-400 mb-4">No organisation found.</p>
      <a href="/business/profile" className="btn-primary">Set Up Business</a>
    </div></div>
  );

  const TABS = [
    { key: 'pnl',    label: '📊 P&L Statement' },
    { key: 'bs',     label: '⚖️ Balance Sheet' },
    { key: 'ratios', label: '📐 Ratios' },
  ] as const;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Financial Reports</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {pnl ? pnl.period_label : 'Loading...'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => orgId && load(orgId)} disabled={loading}
            className="btn-secondary py-1.5 px-3">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {orgId && (
            <div className="flex gap-2">
              {(['csv', 'excel', 'pdf'] as const).map(fmt => (
                <div key={fmt} className="relative group">
                  <button disabled={exporting || loading}
                    className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5 capitalize">
                    <Download size={14} />{fmt}
                  </button>
                  <div className="absolute right-0 top-10 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-20 hidden group-focus-within:block">
                    {([
                      ['pnl',           'P&L Statement'],
                      ['bs',            'Balance Sheet'],
                      ['trial-balance', 'Trial Balance'],
                      ['cashflow',      'Cash Flow'],
                    ] as const).map(([type, label]) => (
                      <button key={type}
                        onClick={() => handleExport(type as any, fmt)}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white first:rounded-t-xl last:rounded-b-xl transition-colors">
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
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
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      ) : (
        <>
          {/* P&L */}
          {tab === 'pnl' && pnl && (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="metric-card py-4">
                  <p className="metric-label">Total Revenue</p>
                  <p className="metric-value text-emerald-400">{formatINR(pnl.revenue.total, true)}</p>
                </div>
                <div className="metric-card py-4">
                  <p className="metric-label">Total Expenses</p>
                  <p className="metric-value text-red-400">{formatINR(pnl.expenses.total, true)}</p>
                </div>
                <div className="metric-card py-4">
                  <p className="metric-label">Gross Profit</p>
                  <p className={`metric-value ${pnl.gross_profit >= 0 ? 'text-white' : 'text-red-400'}`}>
                    {formatINR(pnl.gross_profit, true)}
                  </p>
                </div>
                <div className={`metric-card py-4 ${pnl.net_profit >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
                  <p className="metric-label">Net Profit</p>
                  <p className={`metric-value ${pnl.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatINR(pnl.net_profit, true)}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">{pnl.profit_margin_pct}% margin</p>
                </div>
              </div>

              {/* Revenue breakdown */}
              {Object.keys(pnl.revenue.groups).length > 0 && (
                <GroupSection
                  title="Revenue"
                  groups={pnl.revenue.groups}
                  total={pnl.revenue.total}
                  positive={true}
                />
              )}

              {/* Expense breakdown */}
              {Object.keys(pnl.expenses.groups).length > 0 && (
                <GroupSection
                  title="Expenses"
                  groups={pnl.expenses.groups}
                  total={pnl.expenses.total}
                  positive={false}
                />
              )}

              {/* Net profit row */}
              <div className={`card flex items-center justify-between py-4 ${
                pnl.net_profit >= 0 ? 'border-emerald-500/20 bg-emerald-950/10' : 'border-red-500/20 bg-red-950/10'
              }`}>
                <span className="text-white font-bold">Net Profit / (Loss)</span>
                <div className="flex items-center gap-2">
                  {pnl.net_profit >= 0
                    ? <TrendingUp size={18} className="text-emerald-400" />
                    : <TrendingDown size={18} className="text-red-400" />}
                  <span className={`font-mono font-bold text-xl ${pnl.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatINR(pnl.net_profit)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Balance Sheet */}
          {tab === 'bs' && bs && (
            <div className="space-y-4">
              {/* Balance check banner */}
              <div className={`rounded-2xl border p-4 flex items-center gap-3 ${
                bs.is_balanced
                  ? 'border-emerald-500/20 bg-emerald-950/10'
                  : 'border-red-500/20 bg-red-950/10'
              }`}>
                {bs.is_balanced
                  ? <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                  : <AlertCircle size={20} className="text-red-400 shrink-0" />}
                <div>
                  <p className={`font-semibold text-sm ${bs.is_balanced ? 'text-emerald-300' : 'text-red-300'}`}>
                    {bs.is_balanced ? 'Balance Sheet is balanced' : 'Balance Sheet is unbalanced'}
                  </p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Assets {formatINR(bs.assets.total)} = Liabilities {formatINR(bs.liabilities.total)} + Equity {formatINR(bs.equity.total)}
                    {!bs.is_balanced && ` · Difference: ${formatINR(bs.balance_difference)}`}
                  </p>
                </div>
              </div>

              {/* Totals row */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Assets',      val: bs.assets.total,      color: 'text-emerald-400' },
                  { label: 'Total Liabilities', val: bs.liabilities.total, color: 'text-red-400' },
                  { label: 'Total Equity',       val: bs.equity.total,      color: 'text-indigo-400' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="metric-card py-4 text-center">
                    <p className="metric-label">{label}</p>
                    <p className={`text-lg font-bold mt-1 ${color}`}>{formatINR(val, true)}</p>
                  </div>
                ))}
              </div>

              {/* Asset groups */}
              {Object.keys(bs.assets.groups).length > 0 && (
                <GroupSection title="Assets" groups={bs.assets.groups} total={bs.assets.total} positive={true} />
              )}

              {/* Liability groups */}
              {Object.keys(bs.liabilities.groups).length > 0 && (
                <GroupSection title="Liabilities" groups={bs.liabilities.groups} total={bs.liabilities.total} positive={false} />
              )}

              {/* Equity groups */}
              {Object.keys(bs.equity.groups).length > 0 && (
                <GroupSection title="Equity" groups={bs.equity.groups} total={bs.equity.total} positive={true} />
              )}

              <p className="text-slate-600 text-xs text-center">
                Generated: {bs.generated_at?.slice(0, 10)}
              </p>
            </div>
          )}

          {/* Ratios */}
          {tab === 'ratios' && ratios && (
            <div className="space-y-4">
              <p className="text-slate-500 text-sm">{ratios.data_note}</p>
              {/* Group by category */}
              {['Liquidity', 'Profitability', 'Leverage', 'Efficiency'].map(cat => {
                const catRatios = Object.values(ratios.ratios as Record<string, any>)
                  .filter((r: any) => r.category === cat);
                if (catRatios.length === 0) return null;
                return (
                  <div key={cat}>
                    <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
                      {cat}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {catRatios.map((r: any) => (
                        <RatioCard key={r.label} ratio={r} />
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-slate-600 text-xs text-center">
                Generated: {ratios.generated_at?.slice(0, 10)}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
