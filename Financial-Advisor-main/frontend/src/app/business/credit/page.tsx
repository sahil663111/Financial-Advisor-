'use client';

import { useEffect, useState, useMemo } from 'react';
import { businessOrg, businessML, businessFinance } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import {
  Briefcase, Activity, AlertTriangle, ShieldCheck,
  Calculator, ChevronRight, Info, CheckCircle
} from 'lucide-react';

export default function BusinessCreditPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Data state
  const [creditRisk, setCreditRisk] = useState<any>(null);
  const [cashMetrics, setCashMetrics] = useState<any>(null);
  
  // Calculator state
  const [loanAmount, setLoanAmount] = useState('1000000');
  const [interestRate, setInterestRate] = useState('12.5');
  const [tenureMonths, setTenureMonths] = useState('36');

  useEffect(() => {
    businessOrg.listOrganizations().then((orgs: any) => {
      if (orgs?.length) {
        const id = orgs[0].id || orgs[0]._id;
        setOrgId(id);
        fetchData(id);
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  const fetchData = async (id: string) => {
    setLoading(true);
    try {
      const [risk, metrics] = await Promise.all([
        businessML.getCreditRisk(id).catch(() => null),
        businessFinance.getCashMetrics(id).catch(() => null)
      ]);
      setCreditRisk(risk);
      setCashMetrics(metrics);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // EMI Calculation: E = P * r * (1 + r)^n / ((1 + r)^n - 1)
  const emiData = useMemo(() => {
    const P = parseFloat(loanAmount) || 0;
    const R = (parseFloat(interestRate) || 0) / 12 / 100;
    const N = parseFloat(tenureMonths) || 0;

    if (P <= 0 || R <= 0 || N <= 0) return { emi: 0, totalPayment: 0, totalInterest: 0 };

    const emi = (P * R * Math.pow(1 + R, N)) / (Math.pow(1 + R, N) - 1);
    const totalPayment = emi * N;
    const totalInterest = totalPayment - P;

    return { emi, totalPayment, totalInterest };
  }, [loanAmount, interestRate, tenureMonths]);

  // Affordability Logic
  const affordability = useMemo(() => {
    if (!cashMetrics) return null;
    
    // Average Monthly Net Cash Flow over the trend (or fallback)
    let avgNetCash = 0;
    if (cashMetrics.monthly_trend && cashMetrics.monthly_trend.length > 0) {
      const sum = cashMetrics.monthly_trend.reduce((acc: number, m: any) => acc + (m.cash_in - m.cash_out), 0);
      avgNetCash = sum / cashMetrics.monthly_trend.length;
    } else {
      // Fallback
      avgNetCash = 50000; 
    }

    const { emi } = emiData;
    if (emi === 0) return null;

    const dscr = avgNetCash / emi;
    let status = '';
    let color = '';
    let message = '';

    if (dscr >= 2.0) {
      status = 'Highly Affordable';
      color = 'text-emerald-400';
      message = 'Your cash flow comfortably covers this EMI with plenty of buffer.';
    } else if (dscr >= 1.2) {
      status = 'Affordable';
      color = 'text-amber-400';
      message = 'Your cash flow can cover this, but your buffer is moderate.';
    } else if (dscr > 0) {
      status = 'High Risk';
      color = 'text-red-400';
      message = 'Warning: This EMI will consume most of your monthly net cash.';
    } else {
      status = 'Not Affordable';
      color = 'text-red-500';
      message = 'Your current average net cash flow is negative.';
    }

    return { avgNetCash, dscr, status, color, message };
  }, [cashMetrics, emiData]);


  if (loading) return <div className="p-8 text-center text-slate-400">Loading Credit Analysis...</div>;
  if (!orgId) return <div className="p-8 text-center text-slate-400">No organization found.</div>;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase className="text-indigo-500" />
            Credit & Loan Analysis
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            AI-driven credit assessment and loan affordability planning.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ML Credit Risk Indicator */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Activity size={16} className="text-indigo-400" />
              AI Credit Risk Indicator
            </h2>
            
            {creditRisk ? (
              <div className="flex flex-col items-center">
                {/* Score Gauge representation */}
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="64" cy="64" r="56" fill="transparent" stroke="rgb(30,41,59)" strokeWidth="12" />
                    <circle cx="64" cy="64" r="56" fill="transparent" 
                      stroke={creditRisk.score >= 750 ? '#10b981' : creditRisk.score >= 500 ? '#f59e0b' : '#ef4444'} 
                      strokeWidth="12"
                      strokeDasharray="351.8" 
                      strokeDashoffset={351.8 - (351.8 * creditRisk.score) / 1000} 
                      className="transition-all duration-1000 ease-out" />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-3xl font-bold text-white">{creditRisk.score}</span>
                    <span className="text-[10px] text-slate-400">/ 1000</span>
                  </div>
                </div>

                <div className={`mt-4 px-3 py-1 rounded-full text-xs font-semibold ${
                  creditRisk.category === 'Low Risk' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  creditRisk.category === 'Medium Risk' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {creditRisk.category}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-400 text-center py-4">Risk score unavailable.</div>
            )}
          </div>

          {creditRisk && (
            <div className="card space-y-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Analysis Factors</h3>
              
              {creditRisk.positive_factors?.length > 0 && (
                <div className="space-y-2">
                  {creditRisk.positive_factors.map((f: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                      <ShieldCheck size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-emerald-200">{f}</p>
                    </div>
                  ))}
                </div>
              )}

              {creditRisk.risk_factors?.length > 0 && (
                <div className="space-y-2 mt-4">
                  {creditRisk.risk_factors.map((f: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                      <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-200">{f}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loan Calculator & Affordability */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
              <Calculator size={16} className="text-indigo-400" />
              Loan Affordability & EMI Calculator
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div>
                <label className="input-label">Loan Amount (₹)</label>
                <input type="number" className="input" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} />
              </div>
              <div>
                <label className="input-label">Interest Rate (% p.a.)</label>
                <input type="number" step="0.1" className="input" value={interestRate} onChange={e => setInterestRate(e.target.value)} />
              </div>
              <div>
                <label className="input-label">Tenure (Months)</label>
                <input type="number" className="input" value={tenureMonths} onChange={e => setTenureMonths(e.target.value)} />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Repayment Estimate</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-slate-400 text-xs">Monthly EMI</p>
                  <p className="text-2xl font-bold text-white mt-1">{formatINR(emiData.emi)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Total Interest</p>
                  <p className="text-lg font-semibold text-slate-200 mt-2">{formatINR(emiData.totalInterest)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Total Payment</p>
                  <p className="text-lg font-semibold text-slate-200 mt-2">{formatINR(emiData.totalPayment)}</p>
                </div>
              </div>
            </div>

            {/* Affordability Section */}
            {affordability && (
              <div className="mt-6 border-t border-slate-800 pt-6">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">Affordability Analysis</h3>
                <div className="flex flex-col md:flex-row items-start gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                      <span className="text-xs text-slate-400">Avg Monthly Net Cash (Last 6M)</span>
                      <span className="text-sm font-semibold text-white">{formatINR(affordability.avgNetCash)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        Debt Service Coverage Ratio (DSCR)
                        <div className="group relative">
                          <Info size={12} className="text-slate-500 cursor-help" />
                          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-[10px] text-slate-300 rounded shadow-xl z-10 text-center">
                            Net Cash Flow / EMI. Target {'>'} 1.2
                          </div>
                        </div>
                      </span>
                      <span className="text-sm font-semibold text-white">{affordability.dscr.toFixed(2)}x</span>
                    </div>
                  </div>

                  <div className={`flex-1 w-full border rounded-xl p-4 flex flex-col justify-center ${
                    affordability.status === 'Highly Affordable' ? 'bg-emerald-500/10 border-emerald-500/20' :
                    affordability.status === 'Affordable' ? 'bg-amber-500/10 border-amber-500/20' :
                    'bg-red-500/10 border-red-500/20'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {affordability.status.includes('Affordable') ? (
                        <CheckCircle size={18} className={affordability.color} />
                      ) : (
                        <AlertTriangle size={18} className={affordability.color} />
                      )}
                      <span className={`font-semibold ${affordability.color}`}>{affordability.status}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{affordability.message}</p>
                    
                    {creditRisk && (
                       <p className="text-[10px] text-slate-400 mt-3 pt-3 border-t border-slate-700/50">
                         Combined with your <strong>{creditRisk.category}</strong> profile, lenders may view this application {affordability.status === 'Highly Affordable' && creditRisk.score >= 700 ? 'very favorably' : 'with caution'}.
                       </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
