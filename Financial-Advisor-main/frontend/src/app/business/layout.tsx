'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, TrendingUp, Receipt, Users, Building2,
  Briefcase, FileText, ShoppingCart, BarChart3, Bot, LogOut,
  Menu, Wallet, Brain, Settings, Bell, X, AlertTriangle,
  CheckCircle, Info, CreditCard
} from 'lucide-react';
import { businessOrg as orgApi, businessNotifications as notifApi } from '@/lib/api';

// ── Notification bell + dropdown ─────────────────────────────────────────────
const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'text-red-400 bg-red-400/10 border-red-400/20',
  WARNING:  'text-amber-400 bg-amber-400/10 border-amber-400/20',
  INFO:     'text-blue-400 bg-blue-400/10 border-blue-400/20',
};
const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  CRITICAL: <AlertTriangle size={14} className="text-red-400 shrink-0" />,
  WARNING:  <AlertTriangle size={14} className="text-amber-400 shrink-0" />,
  INFO:     <Info size={14} className="text-blue-400 shrink-0" />,
};

function NotificationBell({ orgId }: { orgId: string }) {
  const [open, setOpen]           = useState(false);
  const [unread, setUnread]       = useState(0);
  const [notifications, setNotifs] = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const ref                       = useRef<HTMLDivElement>(null);

  // Poll unread count every 60s
  useEffect(() => {
    const fetch = async () => {
      try {
        const res: any = await notifApi.getUnreadCount(orgId);
        setUnread(res?.count || 0);
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, [orgId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openPanel = async () => {
    setOpen(o => !o);
    if (!open) {
      setLoading(true);
      try {
        const data: any = await notifApi.getNotifications(orgId);
        setNotifs(data || []);
        setUnread(data?.filter((n: any) => !n.is_read).length || 0);
      } catch {}
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    try {
      await notifApi.markAsRead(orgId, id);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await notifApi.markAllAsRead(orgId);
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnread(0);
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={openPanel}
        className="relative btn-ghost p-2 text-slate-400 hover:text-white">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <p className="text-white font-semibold text-sm">Notifications</p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead}
                  className="text-indigo-400 text-xs hover:text-indigo-300">
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="btn-ghost p-1">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">
                {Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle size={24} className="text-emerald-400 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">All caught up!</p>
              </div>
            ) : (
              notifications.map((n: any) => (
                <div key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`px-4 py-3 border-b border-slate-800/50 cursor-pointer transition-colors ${
                    n.is_read ? 'opacity-50' : 'hover:bg-slate-800/40'
                  }`}>
                  <div className="flex items-start gap-2">
                    {SEVERITY_ICONS[n.severity] || SEVERITY_ICONS['INFO']}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${n.is_read ? 'text-slate-400' : 'text-white'}`}>
                        {n.title}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{n.message}</p>
                      {n.link && (
                        <a href={n.link} onClick={e => e.stopPropagation()}
                          className="text-indigo-400 text-[10px] mt-1 inline-block hover:text-indigo-300">
                          View →
                        </a>
                      )}
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const BUSINESS_NAV = [
  {
    label: 'Overview',
    items: [
      { href: '/business/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/business/profile', icon: Building2, label: 'Company Profile' },
      { href: '/business/settings', icon: Settings, label: 'Settings' },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { href: '/business/accounting',              icon: Wallet,         label: 'Chart of Accounts' },
      { href: '/business/accounting/journal',      icon: Receipt,        label: 'Journal Entries' },
      { href: '/business/accounting/ledger',       icon: BarChart3,      label: 'Ledger' },
      { href: '/business/accounting/trial-balance',icon: FileText,       label: 'Trial Balance' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/business/customers', icon: Users, label: 'Customers' },
      { href: '/business/invoices', icon: FileText, label: 'Invoices' },
      { href: '/business/receivables', icon: TrendingUp, label: 'Receivables' },
    ],
  },
  {
    label: 'Purchases',
    items: [
      { href: '/business/vendors',   icon: Briefcase,  label: 'Vendors' },
      { href: '/business/expenses',  icon: ShoppingCart, label: 'Expenses' },
      { href: '/business/payables',  icon: CreditCard, label: 'Payables' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/business/employees',  icon: Users,        label: 'Employees' },
      { href: '/business/payroll',    icon: Receipt,      label: 'Payroll' },
      { href: '/business/gst',        icon: Receipt,      label: 'GST & Tax' },
      { href: '/business/cashflow',   icon: TrendingUp,   label: 'Cash Flow' },
      { href: '/business/budgets',    icon: Wallet,       label: 'Budgets' },
      { href: '/business/reports',    icon: BarChart3,    label: 'Financial Reports' },
      { href: '/business/intelligence',icon: Brain,       label: 'ML Intelligence' },
      { href: '/business/credit',     icon: Briefcase,    label: 'Credit & Loans' },
      { href: '/business/ai-cfo',     icon: Bot,          label: 'AI CFO' },
    ],
  },
];

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Resolve org for notifications
  useEffect(() => {
    if (user) {
      orgApi.listOrganizations().then((orgs: any) => {
        if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
      }).catch(() => {});
    }
  }, [user]);

  if (loading || !user) return <div className="min-h-screen bg-slate-950" />;

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-slate-900 border-r border-slate-800 w-64 shrink-0">
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-lg">💰</div>
            <div>
              <p className="text-white font-bold text-sm">AI Financial OS</p>
              <p className="text-slate-500 text-xs">Business Portal</p>
            </div>
          </div>
          {orgId && <NotificationBell orgId={orgId} />}
        </div>
      </div>

      <div className="p-3 border-b border-slate-800">
        <div className="flex rounded-xl bg-slate-800 p-1">
          <button onClick={() => router.push('/individual/dashboard')} className="flex-1 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-200 transition-all">
            Individual
          </button>
          <button className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white transition-all">
            Business
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {BUSINESS_NAV.map((group) => (
          <div key={group.label}>
            <p className="nav-section-label">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isComingSoon = (item as any).comingSoon;
              if (isComingSoon) {
                return (
                  <div key={item.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 text-sm font-medium cursor-not-allowed">
                    <Icon size={16} /><span>{item.label}</span><span className="ml-auto text-[10px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">Soon</span>
                  </div>
                );
              }
              return (
                <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} className={pathname === item.href ? 'nav-item-active flex' : 'nav-item'}>
                  <Icon size={16} /><span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <button onClick={async () => { await logout(); router.push('/login'); }} className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <LogOut size={16} /><span>Sign Out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <div className="hidden lg:flex"><Sidebar /></div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 h-full"><Sidebar /></div>
        </div>
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="lg:hidden sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="btn-ghost p-2"><Menu size={20} /></button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-sm">💰</div>
            <span className="text-white font-semibold text-sm">Business Portal</span>
          </div>
          {orgId && <NotificationBell orgId={orgId} />}
        </div>
        <div className="animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
