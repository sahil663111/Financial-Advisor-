'use client';

import { useEffect, useState } from 'react';
import { businessOrg as orgApi, businessTax as api } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import {
  AlertTriangle, Calendar, CheckCircle2, Clock, ShieldCheck,
  TrendingDown, TrendingUp, Plus, FileText, CheckCircle,
  Sparkles, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownRight,
  Sliders, Landmark, IndianRupee
} from 'lucide-react';

export default function TaxPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const [tab, setTab] = useState<'overview' | 'gst' | 'tds' | 'calendar' | 'rules'>('overview');

  // TDS sub-tab state
  const [tdsRecords, setTdsRecords] = useState<any[]>([]);
  const [tdsLoading, setTdsLoading] = useState(false);
  const [showAddTdsModal, setShowAddTdsModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [selectedTdsId, setSelectedTdsId] = useState<string | null>(null);

  // Form states
  const [newTds, setNewTds] = useState({
    section: '194C',
    deductee_name: '',
    deductee_pan: '',
    gross_amount: '',
    tds_rate_pct: '1.0',
    tds_amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    description: '',
  });

  const [depositForm, setDepositForm] = useState({
    challan_number: '',
    bsr_code: '',
    deposit_date: new Date().toISOString().split('T')[0],
    deposit_amount: '',
  });

  // Rules state
  const [rules, setRules] = useState<any[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
    });
  }, []);

  const loadData = async (targetOrgId: string) => {
    setLoading(true);
    try {
      const [dash, monthly] = await Promise.all([
        api.getTaxDashboard(targetOrgId),
        api.getGSTMonthly(targetOrgId, 6),
      ]);
      setDashboard(dash);
      setMonthlyTrend(monthly || []);
    } catch (err) {
      console.error('Failed to load tax data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) {
      loadData(orgId);
    }
  }, [orgId]);

  // Load TDS records when switching to TDS tab
  useEffect(() => {
    if (orgId && tab === 'tds') {
      setTdsLoading(true);
      api.listTDSRecords(orgId)
        .then((res: any) => setTdsRecords(res?.items || []))
        .catch(console.error)
        .finally(() => setTdsLoading(false));
    }
  }, [orgId, tab]);

  // Load rules when switching to rules tab
  useEffect(() => {
    if (orgId && tab === 'rules') {
      loadRules(orgId);
    }
  }, [orgId, tab]);

  const loadRules = (targetOrgId: string) => {
    setRulesLoading(true);
    api.listTaxRules(targetOrgId)
      .then((res: any) => setRules(res || []))
      .catch(console.error)
      .finally(() => setRulesLoading(false));
  };

  const handleSeedRules = async () => {
    if (!orgId) return;
    try {
      const res = await api.seedTaxRules(orgId);
      setActionMsg({ text: res.message || 'Seeded default rules', type: 'success' });
      loadRules(orgId);
    } catch (err: any) {
      setActionMsg({ text: err?.message || 'Failed to seed rules', type: 'error' });
    }
  };

  const handleRecordTds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    try {
      await api.recordTDSDeduction(orgId, {
        section: newTds.section,
        deductee_name: newTds.deductee_name,
        deductee_pan: newTds.deductee_pan || undefined,
        gross_amount: parseFloat(newTds.gross_amount) || 0,
        tds_rate_pct: parseFloat(newTds.tds_rate_pct) || 0,
        tds_amount: parseFloat(newTds.tds_amount) || 0,
        payment_date: new Date(newTds.payment_date).toISOString(),
        description: newTds.description || undefined,
      });
      setShowAddTdsModal(false);
      setActionMsg({ text: 'TDS deduction recorded successfully', type: 'success' });
      // Reload TDS & dashboard
      loadData(orgId);
      const res = await api.listTDSRecords(orgId);
      setTdsRecords(res?.items || []);
    } catch (err: any) {
      setActionMsg({ text: err?.message || 'Error recording TDS', type: 'error' });
    }
  };

  const handleDepositTds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !selectedTdsId) return;
    try {
      await api.markTDSDeposited(orgId, {
        record_ids: [selectedTdsId],
        challan_number: depositForm.challan_number,
        bsr_code: depositForm.bsr_code || undefined,
        deposit_date: new Date(depositForm.deposit_date).toISOString(),
        deposit_amount: parseFloat(depositForm.deposit_amount) || 0,
      });
      setShowDepositModal(false);
      setSelectedTdsId(null);
      setActionMsg({ text: 'TDS marked as deposited with challan', type: 'success' });
      loadData(orgId);
      const res = await api.listTDSRecords(orgId);
      setTdsRecords(res?.items || []);
    } catch (err: any) {
      setActionMsg({ text: err?.message || 'Error depositing TDS', type: 'error' });
    }
  };

  // Recalculate TDS amount in form when gross or rate changes
  const updateGrossOrRate = (grossStr: string, rateStr: string) => {
    const gross = parseFloat(grossStr) || 0;
    const rate = parseFloat(rateStr) || 0;
    const calc = Math.round((gross * rate) / 100);
    setNewTds((prev) => ({
      ...prev,
      gross_amount: grossStr,
      tds_rate_pct: rateStr,
      tds_amount: calc > 0 ? String(calc) : '',
    }));
  };

  if (!orgId) {
    return (
      <div className="p-8 text-center">
        <div className="card max-w-md mx-auto py-12">
          <p className="text-slate-400 mb-4">No organisation found.</p>
          <a href="/business/profile" className="btn-primary">Set Up Business</a>
        </div>
      </div>
    );
  }

  const gstData = dashboard?.gst;
  const tdsData = dashboard?.tds;
  const alerts = dashboard?.alerts || [];
  const calendarItems = dashboard?.calendar || [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">GST & Tax Compliance</h1>
            <span className="badge-blue text-xs font-semibold px-2 py-0.5 rounded-full">
              FY {dashboard?.period?.financial_year || '2024-25'}
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-0.5">
            Automated tax intelligence, GST return aggregates, TDS deposit workflow & statutory calendar
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          {(['overview', 'gst', 'tds', 'calendar', 'rules'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-1.5 px-3.5 text-xs font-medium rounded-lg transition-all capitalize ${
                tab === t
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {t === 'overview' && '📊 '}
              {t === 'gst' && '🧾 '}
              {t === 'tds' && '📑 '}
              {t === 'calendar' && '📅 '}
              {t === 'rules' && '⚙️ '}
              {t === 'overview' ? 'Overview' : t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Notification Toast */}
      {actionMsg && (
        <div
          className={`p-3.5 rounded-xl text-sm flex items-center justify-between gap-3 ${
            actionMsg.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/40 border border-red-500/30 text-red-300'
          }`}
        >
          <span>{actionMsg.text}</span>
          <button
            onClick={() => setActionMsg(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Statutory Disclaimer Alert */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200/90 leading-relaxed">
          <span className="font-semibold text-amber-300">Decision-Support Tool: </span>
          {dashboard?.disclaimer ||
            'Tax figures and statutory deadlines are indicative planning estimates. Always reconcile against GSTN and Income Tax portal credentials before filing returns.'}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="skeleton h-28 rounded-2xl" />
            ))}
          </div>
          <div className="skeleton h-72 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Top KPI Cards (Always visible on Overview) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Tax Payable */}
            <div className="card py-5 border-l-4 border-l-indigo-500">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">
                Estimated Immediate Tax Due
              </p>
              <p className="text-2xl font-bold text-white mt-1.5">
                {formatINR(dashboard?.estimated_tax_payable || 0, true)}
              </p>
              <p className="text-slate-400 text-xs mt-2 flex items-center gap-1">
                <span>Net GST + Pending TDS</span>
              </p>
            </div>

            {/* Output GST vs ITC */}
            <div className="card py-5 border-l-4 border-l-emerald-500">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">
                Net GST Liability ({dashboard?.period?.month})
              </p>
              <p
                className={`text-2xl font-bold mt-1.5 ${
                  (gstData?.net_liability || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {gstData?.is_refund_eligible
                  ? `${formatINR(gstData?.itc_excess || 0, true)} (Excess ITC)`
                  : formatINR(gstData?.net_liability || 0, true)}
              </p>
              <div className="text-xs text-slate-400 mt-2 flex justify-between">
                <span>Out: {formatINR(gstData?.output_tax || 0, true)}</span>
                <span>ITC: {formatINR(gstData?.input_credit || 0, true)}</span>
              </div>
            </div>

            {/* TDS Pending */}
            <div className="card py-5 border-l-4 border-l-purple-500">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">
                TDS Payable ({dashboard?.period?.quarter})
              </p>
              <p className="text-2xl font-bold text-purple-400 mt-1.5">
                {formatINR(tdsData?.total_pending || 0, true)}
              </p>
              <div className="text-xs text-slate-400 mt-2 flex justify-between">
                <span>Deducted: {formatINR(tdsData?.total_deducted || 0, true)}</span>
                <span>Deposited: {formatINR(tdsData?.total_deposited || 0, true)}</span>
              </div>
            </div>

            {/* Next Deadline */}
            <div className="card py-5 border-l-4 border-l-amber-500">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">
                Next Filing Deadline
              </p>
              {calendarItems.length > 0 ? (
                <>
                  <p className="text-lg font-bold text-white mt-1.5 truncate">
                    {calendarItems[0].label}
                  </p>
                  <p className="text-xs text-amber-400 font-semibold mt-2">
                    {calendarItems[0].due_date} ({calendarItems[0].days_left}d left)
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400 mt-2">No urgent deadlines</p>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 1: OVERVIEW
             ══════════════════════════════════════════════════════════════════════ */}
          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Alerts if any */}
              {alerts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Action Items & Compliance Alerts
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {alerts.map((al: any, idx: number) => (
                      <div
                        key={idx}
                        className={`card py-3 px-4 flex items-start gap-3 border ${
                          al.type === 'ERROR'
                            ? 'border-red-500/30 bg-red-950/20 text-red-200'
                            : al.type === 'WARNING'
                            ? 'border-amber-500/30 bg-amber-950/20 text-amber-200'
                            : 'border-indigo-500/30 bg-indigo-950/20 text-indigo-200'
                        }`}
                      >
                        <AlertCircle size={18} className="shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-sm text-white">{al.title}</p>
                          <p className="text-xs text-slate-300 mt-0.5">{al.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly Trend Chart */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      6-Month GST Trend (Output vs Input Tax Credit)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Derived deterministically from sales invoices, vendor bills & operational expenses
                    </p>
                  </div>
                  <button
                    onClick={() => setTab('gst')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                  >
                    View Details <ArrowUpRight size={14} />
                  </button>
                </div>

                {monthlyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={monthlyTrend} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} />
                      <YAxis
                        tickFormatter={(v) => formatINR(v, true)}
                        tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }}
                        width={68}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgb(15,23,42)',
                          border: '1px solid rgb(51,65,85)',
                          borderRadius: 12,
                        }}
                        formatter={(v: number, name: string) => [
                          formatINR(v),
                          name === 'output_gst'
                            ? 'Output GST'
                            : name === 'input_itc'
                            ? 'Input Tax Credit'
                            : 'Net Liability',
                        ]}
                      />
                      <Legend
                        formatter={(v) =>
                          v === 'output_gst'
                            ? 'Output GST'
                            : v === 'input_itc'
                            ? 'Input Tax Credit (ITC)'
                            : 'Net GST Liability'
                        }
                      />
                      <Bar dataKey="output_gst" name="output_gst" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="input_itc" name="input_itc" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="net_liability" name="net_liability" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No historical GST trend data available yet
                  </div>
                )}
              </div>

              {/* Two Column: Upcoming Deadlines & TDS Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Upcoming Deadlines */}
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Calendar size={16} className="text-indigo-400" /> Upcoming Deadlines
                    </h3>
                    <button
                      onClick={() => setTab('calendar')}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      View All
                    </button>
                  </div>
                  <div className="space-y-2">
                    {calendarItems.slice(0, 4).map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800"
                      >
                        <div>
                          <p className="text-xs font-semibold text-white">{item.label}</p>
                          <p className="text-[11px] text-slate-400">{item.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium text-slate-200">{item.due_date}</p>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              item.status === 'OVERDUE'
                                ? 'bg-red-950 text-red-400 border border-red-500/30'
                                : item.status === 'DUE_SOON'
                                ? 'bg-amber-950 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.status === 'OVERDUE'
                              ? 'Overdue'
                              : `${item.days_left}d left`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* TDS Summary by Section */}
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Landmark size={16} className="text-purple-400" /> TDS by Section
                    </h3>
                    <button
                      onClick={() => setTab('tds')}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Manage TDS
                    </button>
                  </div>

                  {tdsData?.by_section?.length > 0 ? (
                    <div className="space-y-2">
                      {tdsData.by_section.map((sec: any) => (
                        <div
                          key={sec.section}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs"
                        >
                          <div>
                            <span className="font-mono font-bold text-white bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/30 mr-2">
                              Sec {sec.section}
                            </span>
                            <span className="text-slate-400">{sec.count} record(s)</span>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <p className="text-slate-400 text-[10px]">TDS Amount</p>
                              <p className="font-semibold text-white">{formatINR(sec.tds_amount)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-[10px]">Pending</p>
                              <p
                                className={`font-semibold ${
                                  sec.pending > 0 ? 'text-amber-400' : 'text-emerald-400'
                                }`}
                              >
                                {formatINR(sec.pending)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      No TDS deductions recorded for current quarter
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 2: GST DETAILS
             ══════════════════════════════════════════════════════════════════════ */}
          {tab === 'gst' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Output GST Card */}
                <div className="card py-5">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-400 text-xs uppercase font-medium">Output Tax (Sales)</p>
                    <span className="text-xs text-indigo-400 font-medium">GSTR-1</span>
                  </div>
                  <p className="text-2xl font-bold text-white mt-2">
                    {formatINR(gstData?.output_tax || 0, true)}
                  </p>
                  <div className="mt-4 space-y-2 text-xs border-t border-slate-800 pt-3">
                    <div className="flex justify-between text-slate-400">
                      <span>CGST (Central Tax)</span>
                      <span className="font-mono text-white">
                        {formatINR(gstData?.details?.output_gst?.cgst || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>SGST (State Tax)</span>
                      <span className="font-mono text-white">
                        {formatINR(gstData?.details?.output_gst?.sgst || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>IGST (Integrated Tax)</span>
                      <span className="font-mono text-white">
                        {formatINR(gstData?.details?.output_gst?.igst || 0)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3">
                    Source: {gstData?.details?.output_gst?.invoice_count || 0} approved sales invoices
                  </p>
                </div>

                {/* Input Tax Credit (ITC) Card */}
                <div className="card py-5">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-400 text-xs uppercase font-medium">Input Tax Credit (ITC)</p>
                    <span className="text-xs text-emerald-400 font-medium">GSTR-2B</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-400 mt-2">
                    {formatINR(gstData?.input_credit || 0, true)}
                  </p>
                  <div className="mt-4 space-y-2 text-xs border-t border-slate-800 pt-3">
                    <div className="flex justify-between text-slate-400">
                      <span>From Vendor Bills</span>
                      <span className="font-mono text-white">
                        {formatINR(gstData?.details?.input_tax_credit?.from_bills || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>From Direct Expenses</span>
                      <span className="font-mono text-white">
                        {formatINR(gstData?.details?.input_tax_credit?.from_expenses || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>CGST / SGST / IGST Total</span>
                      <span className="font-mono text-emerald-400 font-semibold">
                        {formatINR(gstData?.input_credit || 0)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3">
                    Available for setoff against output GST liability
                  </p>
                </div>

                {/* Net GST Payable */}
                <div
                  className={`card py-5 ${
                    (gstData?.net_liability || 0) > 0
                      ? 'border-amber-500/20 bg-amber-950/10'
                      : 'border-emerald-500/20 bg-emerald-950/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-slate-400 text-xs uppercase font-medium">GSTR-3B Tax Due</p>
                    <span className="text-xs text-slate-400">Payment Return</span>
                  </div>
                  <p
                    className={`text-2xl font-bold mt-2 ${
                      (gstData?.net_liability || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {gstData?.is_refund_eligible
                      ? `₹0 (Credit ₹${(gstData?.itc_excess || 0).toLocaleString('en-IN')})`
                      : formatINR(gstData?.net_liability || 0, true)}
                  </p>
                  <div className="mt-4 space-y-2 text-xs border-t border-slate-800 pt-3">
                    <div className="flex justify-between text-slate-400">
                      <span>Net CGST Payable</span>
                      <span className="font-mono text-white">
                        {formatINR(gstData?.details?.net_liability?.cgst || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Net SGST Payable</span>
                      <span className="font-mono text-white">
                        {formatINR(gstData?.details?.net_liability?.sgst || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Net IGST Payable</span>
                      <span className="font-mono text-white">
                        {formatINR(gstData?.details?.net_liability?.igst || 0)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3">
                    Due on the 20th of the following month
                  </p>
                </div>
              </div>

              {/* Monthly Trend Chart in GST Tab */}
              <div className="card">
                <h3 className="text-sm font-semibold text-white mb-4">Historical GST Trend</h3>
                {monthlyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(51,65,85)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }} />
                      <YAxis
                        tickFormatter={(v) => formatINR(v, true)}
                        tick={{ fontSize: 11, fill: 'rgb(100,116,139)' }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgb(15,23,42)',
                          border: '1px solid rgb(51,65,85)',
                          borderRadius: 12,
                        }}
                      />
                      <Legend />
                      <Bar dataKey="output_gst" name="Output GST" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="input_itc" name="Input ITC" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="net_liability" name="Net Liability" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No historical GST trend data available
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 3: TDS MANAGEMENT
             ══════════════════════════════════════════════════════════════════════ */}
          {tab === 'tds' && (
            <div className="space-y-6">
              {/* TDS Header & Action Buttons */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">TDS Deductions & Deposits</h3>
                  <p className="text-xs text-slate-400">
                    Track contractor, professional, rent & salary deductions under Income Tax Act
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddTdsModal(true)}
                    className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Record TDS
                  </button>
                </div>
              </div>

              {/* TDS Records Table */}
              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Deductee</th>
                        <th className="py-3 px-4">Section</th>
                        <th className="py-3 px-4">PAN</th>
                        <th className="py-3 px-4 text-right">Gross Amount</th>
                        <th className="py-3 px-4 text-right">TDS (Rate)</th>
                        <th className="py-3 px-4">Status / Due Date</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {tdsLoading ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            Loading TDS records...
                          </td>
                        </tr>
                      ) : tdsRecords.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-500">
                            No TDS records recorded yet. Click "Record TDS" above.
                          </td>
                        </tr>
                      ) : (
                        tdsRecords.map((rec: any) => (
                          <tr key={rec.id} className="hover:bg-slate-900/40">
                            <td className="py-3 px-4 font-mono">
                              {rec.payment_date?.split('T')[0] || rec.payment_date}
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-white">{rec.deductee_name}</p>
                              <span className="text-[10px] text-slate-500">{rec.deductee_type}</span>
                            </td>
                            <td className="py-3 px-4 font-mono font-medium text-purple-400">
                              {rec.section}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-400">
                              {rec.deductee_pan || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-medium">
                              {formatINR(rec.gross_amount)}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-white">
                              {formatINR(rec.tds_amount)}{' '}
                              <span className="text-[10px] text-slate-400 font-normal">
                                ({rec.tds_rate_pct}%)
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                  rec.status === 'DEPOSITED'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                                    : rec.status === 'OVERDUE'
                                    ? 'bg-red-950 text-red-400 border border-red-500/30'
                                    : 'bg-amber-950 text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                {rec.status}
                              </span>
                              {rec.challan_number && (
                                <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                  Challan: {rec.challan_number}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {rec.status !== 'DEPOSITED' ? (
                                <button
                                  onClick={() => {
                                    setSelectedTdsId(rec.id);
                                    setDepositForm({
                                      challan_number: '',
                                      bsr_code: '',
                                      deposit_date: new Date().toISOString().split('T')[0],
                                      deposit_amount: String(rec.tds_amount),
                                    });
                                    setShowDepositModal(true);
                                  }}
                                  className="btn-secondary py-1 px-2.5 text-[11px] text-indigo-400 hover:text-white"
                                >
                                  Mark Deposited
                                </button>
                              ) : (
                                <span className="text-[11px] text-emerald-400 flex items-center justify-end gap-1">
                                  <CheckCircle size={12} /> Deposited
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 4: COMPLIANCE CALENDAR
             ══════════════════════════════════════════════════════════════════════ */}
          {tab === 'calendar' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Statutory Compliance Calendar</h3>
                  <p className="text-xs text-slate-400">
                    Indian statutory obligations: GSTR-1, GSTR-3B, TDS Deposit, Advance Tax, ITR
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {calendarItems.map((item: any) => (
                  <div
                    key={item.id}
                    className={`card py-4 px-5 flex items-center justify-between gap-4 transition-all ${
                      item.status === 'OVERDUE'
                        ? 'border-red-500/40 bg-red-950/10'
                        : item.status === 'DUE_SOON'
                        ? 'border-amber-500/40 bg-amber-950/10'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          item.status === 'OVERDUE'
                            ? 'bg-red-600/20 text-red-400'
                            : item.status === 'DUE_SOON'
                            ? 'bg-amber-600/20 text-amber-400'
                            : 'bg-indigo-600/20 text-indigo-400'
                        }`}
                      >
                        {item.status === 'OVERDUE' ? (
                          <AlertTriangle size={20} />
                        ) : (
                          <Calendar size={20} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white">{item.label}</p>
                          <span className="badge-blue text-[10px] font-mono">{item.type}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white font-mono">{item.due_date}</p>
                      <p
                        className={`text-xs font-semibold mt-0.5 ${
                          item.status === 'OVERDUE'
                            ? 'text-red-400'
                            : item.status === 'DUE_SOON'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {item.status === 'OVERDUE'
                          ? 'Action Overdue'
                          : item.days_left === 0
                          ? 'Due Today'
                          : `${item.days_left} days remaining`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 5: TAX RULES ENGINE
             ══════════════════════════════════════════════════════════════════════ */}
          {tab === 'rules' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">Configurable Tax Rules Engine</h3>
                  <p className="text-xs text-slate-400">
                    Versioned tax rates, TDS sections & statutory thresholds for this business
                  </p>
                </div>
                <button
                  onClick={handleSeedRules}
                  className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                >
                  <Sparkles size={14} className="text-amber-400" /> Seed Default Indian Rules
                </button>
              </div>

              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Tax Type</th>
                        <th className="py-3 px-4">Section / Category</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4 text-right">Rate %</th>
                        <th className="py-3 px-4 text-right">Threshold</th>
                        <th className="py-3 px-4">Effective Date</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {rulesLoading ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            Loading tax rules...
                          </td>
                        </tr>
                      ) : rules.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-500">
                            No custom rules configured yet. Click "Seed Default Indian Rules" to populate standard GST & TDS slabs.
                          </td>
                        </tr>
                      ) : (
                        rules.map((rule: any) => (
                          <tr key={rule.id} className="hover:bg-slate-900/40">
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  rule.tax_type === 'GST'
                                    ? 'bg-indigo-950 text-indigo-400 border border-indigo-500/30'
                                    : 'bg-purple-950 text-purple-400 border border-purple-500/30'
                                }`}
                              >
                                {rule.tax_type}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-white">
                              {rule.section}
                            </td>
                            <td className="py-3 px-4 text-slate-300">{rule.description}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-white">
                              {rule.rate_pct}%
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-400">
                              {rule.threshold ? formatINR(rule.threshold) : 'None'}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-400">
                              {rule.effective_from?.split('T')[0] || '2024-04-01'}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                                Active (v{rule.version || 1})
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: RECORD TDS
         ══════════════════════════════════════════════════════════════════════ */}
      {showAddTdsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-6 space-y-4 border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Record TDS Deduction</h3>
              <button
                onClick={() => setShowAddTdsModal(false)}
                className="text-slate-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordTds} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">TDS Section *</label>
                  <select
                    value={newTds.section}
                    onChange={(e) => {
                      const sec = e.target.value;
                      let rate = '1.0';
                      if (sec === '194C') rate = '1.0';
                      if (sec === '194J') rate = '10.0';
                      if (sec === '194I_B') rate = '10.0';
                      if (sec === '194H') rate = '5.0';
                      setNewTds((p) => ({ ...p, section: sec }));
                      updateGrossOrRate(newTds.gross_amount, rate);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="194C">194C - Contractor (1%/2%)</option>
                    <option value="194J">194J - Professional / Tech (10%)</option>
                    <option value="194I_B">194I - Rent Land / Building (10%)</option>
                    <option value="194I_A">194I - Rent Machinery (2%)</option>
                    <option value="194H">194H - Commission / Brokerage (5%)</option>
                    <option value="194A">194A - Interest (10%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Deductee PAN</label>
                  <input
                    type="text"
                    value={newTds.deductee_pan}
                    onChange={(e) =>
                      setNewTds({ ...newTds, deductee_pan: e.target.value.toUpperCase() })
                    }
                    placeholder="ABCDE1234F"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Deductee / Vendor Name *</label>
                <input
                  type="text"
                  required
                  value={newTds.deductee_name}
                  onChange={(e) => setNewTds({ ...newTds, deductee_name: e.target.value })}
                  placeholder="Acme Consultancy Services"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Gross Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={newTds.gross_amount}
                    onChange={(e) => updateGrossOrRate(e.target.value, newTds.tds_rate_pct)}
                    placeholder="50000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Rate % *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    max="100"
                    step="0.1"
                    value={newTds.tds_rate_pct}
                    onChange={(e) => updateGrossOrRate(newTds.gross_amount, e.target.value)}
                    placeholder="10.0"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">TDS Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={newTds.tds_amount}
                    onChange={(e) => setNewTds({ ...newTds, tds_amount: e.target.value })}
                    placeholder="5000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={newTds.payment_date}
                    onChange={(e) => setNewTds({ ...newTds, payment_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Description / Bill Ref</label>
                  <input
                    type="text"
                    value={newTds.description}
                    onChange={(e) => setNewTds({ ...newTds, description: e.target.value })}
                    placeholder="Bill #1042 audit fee"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddTdsModal(false)}
                  className="btn-secondary py-1.5 px-4"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary py-1.5 px-4">
                  Save Deduction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: MARK TDS DEPOSITED
         ══════════════════════════════════════════════════════════════════════ */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4 border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Record Challan Deposit</h3>
              <button
                onClick={() => setShowDepositModal(false)}
                className="text-slate-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDepositTds} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Challan / CIN Number *</label>
                <input
                  type="text"
                  required
                  value={depositForm.challan_number}
                  onChange={(e) =>
                    setDepositForm({ ...depositForm, challan_number: e.target.value })
                  }
                  placeholder="e.g. CHL-202409-9042"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Bank BSR Code</label>
                <input
                  type="text"
                  value={depositForm.bsr_code}
                  onChange={(e) => setDepositForm({ ...depositForm, bsr_code: e.target.value })}
                  placeholder="7-digit BSR code (e.g. 0210045)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Deposit Date *</label>
                  <input
                    type="date"
                    required
                    value={depositForm.deposit_date}
                    onChange={(e) =>
                      setDepositForm({ ...depositForm, deposit_date: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Deposit Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={depositForm.deposit_amount}
                    onChange={(e) =>
                      setDepositForm({ ...depositForm, deposit_amount: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDepositModal(false)}
                  className="btn-secondary py-1.5 px-4"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary py-1.5 px-4">
                  Mark Deposited
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
