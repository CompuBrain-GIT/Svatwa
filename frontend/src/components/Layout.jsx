import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  LayoutDashboard, Users, Stethoscope, BedDouble, CalendarDays, ClipboardList,
  Pill, Boxes, FlaskConical, Receipt, Wallet, ShieldCheck, Share2, Bell,
  BarChart3, FileText, Settings, Database, UserCog, LogOut, Menu, X, Brain, ScrollText,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV = [
  { m: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { m: "patients", label: "Patients", icon: Users, to: "/patients" },
  { m: "opd", label: "OPD Queue", icon: ClipboardList, to: "/opd" },
  { m: "ipd", label: "IPD Console", icon: BedDouble, to: "/ipd" },
  { m: "appointments", label: "Appointments", icon: CalendarDays, to: "/appointments" },
  { m: "clinical", label: "Clinical", icon: Stethoscope, to: "/clinical" },
  { m: "pharmacy", label: "Pharmacy", icon: Pill, to: "/pharmacy" },
  { m: "inventory", label: "Inventory", icon: Boxes, to: "/inventory" },
  { m: "diagnostics", label: "Diagnostics", icon: FlaskConical, to: "/diagnostics" },
  { m: "billing", label: "Billing", icon: Receipt, to: "/billing" },
  { m: "expenses", label: "Expenses", icon: Wallet, to: "/expenses" },
  { m: "insurance", label: "Insurance", icon: ShieldCheck, to: "/insurance" },
  { m: "referrals", label: "Referrals", icon: Share2, to: "/referrals" },
  { m: "notifications", label: "Notifications", icon: Bell, to: "/notifications" },
  { m: "analytics", label: "Analytics", icon: BarChart3, to: "/analytics" },
  { m: "masters", label: "Masters", icon: Database, to: "/masters" },
  { m: "users", label: "Users & Roles", icon: UserCog, to: "/users" },
  { m: "settings", label: "Settings", icon: Settings, to: "/settings" },
  { m: "audit", label: "Audit Log", icon: ScrollText, to: "/audit" },
];

export function Logo({ small }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="app-logo">
      <div className="h-9 w-9 rounded-xl bg-brand-teal flex items-center justify-center shadow-sm">
        <Brain size={20} className="text-white" />
      </div>
      {!small && (
        <div className="leading-none">
          <div className="font-head font-extrabold text-lg tracking-tight text-slate-900 dark:text-slate-100">SvaTWA</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Hospital System</div>
        </div>
      )}
    </div>
  );
}

function NavItems({ modules, onNav }) {
  const items = NAV.filter((n) => modules?.includes(n.m));
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === "/"}
          onClick={onNav}
          data-testid={`nav-${n.m}`}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-slate-900 text-white dark:bg-teal-600"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`
          }
        >
          <n.icon size={18} />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api.get("/notifications").then((r) => setUnread(r.data.unread)).catch(() => {});
  }, []);

  const doLogout = () => { logout(); nav("/login"); };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen">
        <div className="h-16 flex items-center px-5 border-b border-slate-200 dark:border-slate-800">
          <Logo />
        </div>
        <NavItems modules={user?.modules} />
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <button onClick={doLogout} data-testid="logout-btn" className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" data-testid="mobile-menu-btn"><Menu size={20} /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72">
                <div className="h-16 flex items-center px-5 border-b"><Logo /></div>
                <NavItems modules={user?.modules} onNav={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="lg:hidden"><Logo small /></div>
          </div>
          <div className="flex items-center gap-3">
            <NavLink to="/notifications" className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="notif-bell">
              <Bell size={18} className="text-slate-600 dark:text-slate-300" />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{unread}</span>}
            </NavLink>
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{user?.name}</div>
              <div className="text-xs text-teal-600 font-medium">{user?.role_label}</div>
            </div>
            <div className="h-9 w-9 rounded-full bg-slate-900 dark:bg-teal-600 text-white flex items-center justify-center text-sm font-semibold">
              {(user?.name || "U").slice(0, 1)}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
