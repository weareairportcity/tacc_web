"use client";

import React, { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  LayoutDashboard, Users, Building2, Handshake, Settings, Map,
  Flame, LogOut, Loader2, X, ChevronRight, Layers, ChevronsUpDown, Check, Plus
} from "lucide-react";
import { getCampsList, CampDetails } from "../camp/actions";

// ─── Context ──────────────────────────────────────────────────────────────────
type AdminCtx = {
  isSuperAdmin: boolean;
  campId: string;
  campName: string;
  userEmail: string;
  campsList: CampDetails[];
  switchCamp: (campId: string) => void;
};
const AdminContext = createContext<AdminCtx>({
  isSuperAdmin: true,
  campId: "camp-meeting-2026",
  campName: "TACC Camp Meeting 2026",
  userEmail: "",
  campsList: [],
  switchCamp: () => {},
});
export function useAdminCtx() { return useContext(AdminContext); }

// ─── Nav Items ────────────────────────────────────────────────────────────────
const NAV = [
  { label: "Overview",     href: "/portal-admin-26",             icon: LayoutDashboard },
  { label: "People",       href: "/portal-admin-26/people",      icon: Users },
  { label: "Groups",       href: "/portal-admin-26/groups",      icon: Layers },
  { label: "Rooms",        href: "/portal-admin-26/rooms",       icon: Building2 },
  { label: "Fellowships",  href: "/portal-admin-26/fellowships", icon: Handshake },
  { label: "My Camps",     href: "/portal-admin-26/camps",       icon: Map },
  { label: "Settings",     href: "/portal-admin-26/settings",    icon: Settings },
];

// ─── Camp Switcher Dropdown ───────────────────────────────────────────────────
function CampSwitcher({
  activeCamp,
  campsList,
  onSwitchCamp,
}: {
  activeCamp?: CampDetails;
  campsList: CampDetails[];
  onSwitchCamp: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-[8px] bg-white hover:bg-[#fafaf9] border border-[#e8e6e5] transition-colors cursor-pointer group text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-full bg-[#fafaf9] border border-[#e8e6e5] flex items-center justify-center shrink-0 overflow-hidden">
            {activeCamp?.logo_url ? (
              <img src={activeCamp.logo_url} alt="" className="w-full h-full object-contain" />
            ) : (
              <Flame size={13} className="text-[#3ba6f1]" strokeWidth={2.5} />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#0c0a09] truncate leading-tight">
              {activeCamp?.name || "Select Camp"}
            </div>
            <div className="text-[10px] text-[#a8a29e] font-medium leading-tight flex items-center gap-1">
              Active Camp <span className="text-[8px] text-[#3398e1]">●</span>
            </div>
          </div>
        </div>
        <ChevronsUpDown size={14} className="text-[#a8a29e] group-hover:text-[#0c0a09] shrink-0 transition-colors" />
      </button>

      {/* Popover Menu */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] p-1.5">
            <div className="text-[10px] font-semibold text-[#a8a29e] uppercase tracking-wider px-3 py-1.5">
              Switch Camp Meeting
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {campsList.map((c) => {
                const isSelected = c.id === activeCamp?.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSwitchCamp(c.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[6px] text-xs transition-colors cursor-pointer text-left ${
                      isSelected
                        ? "bg-[#fafaf9] font-medium text-[#0c0a09]"
                        : "text-[#78716c] hover:bg-[#fafaf9] hover:text-[#0c0a09]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-white border border-[#e8e6e5] flex items-center justify-center shrink-0 overflow-hidden">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <Flame size={11} className="text-[#3ba6f1]" />
                        )}
                      </div>
                      <span className="truncate">{c.name}</span>
                    </div>
                    {isSelected && <Check size={14} className="text-[#3ba6f1] shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="pt-1.5 mt-1 border-t border-[#e8e6e5]">
              <Link
                href="/portal-admin-26/camps"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#3398e1] hover:bg-[#fafaf9] rounded-[6px] transition-colors"
              >
                <Plus size={13} /> Create New Camp
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({
  activeCamp,
  campsList,
  onSwitchCamp,
  userEmail,
  onSignOut,
}: {
  activeCamp?: CampDetails;
  campsList: CampDetails[];
  onSwitchCamp: (id: string) => void;
  userEmail: string;
  onSignOut: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-[230px] min-h-screen bg-white border-r border-[#e8e6e5] shrink-0">
      {/* Camp Switcher Header */}
      <div className="p-3 border-b border-[#e8e6e5]">
        <CampSwitcher activeCamp={activeCamp} campsList={campsList} onSwitchCamp={onSwitchCamp} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ label, href, icon: Icon }) => {
          const isActive = href === "/portal-admin-26"
            ? pathname === "/portal-admin-26"
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-[#fafaf9] text-[#0c0a09] border border-[#e8e6e5]"
                  : "text-[#78716c] hover:text-[#0c0a09] hover:bg-[#fafaf9]"
              }`}
            >
              <Icon size={15} className={isActive ? "text-[#3ba6f1]" : "text-[#a8a29e]"} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="px-3 py-4 border-t border-[#e8e6e5]">
        <div className="px-3 py-2 rounded-[8px] bg-[#fafaf9] border border-[#e8e6e5]">
          <div className="text-[11px] text-[#a8a29e] truncate mb-0.5">{userEmail || "Camp Staff"}</div>
          <button
            onClick={onSignOut}
            className="flex items-center gap-1.5 text-[12px] text-[#78716c] hover:text-red-600 transition-colors cursor-pointer"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Mobile Header (Camp Switcher at top) ────────────────────────────────────
function MobileHeader({
  activeCamp,
  campsList,
  onSwitchCamp,
}: {
  activeCamp?: CampDetails;
  campsList: CampDetails[];
  onSwitchCamp: (id: string) => void;
}) {
  return (
    <div className="md:hidden sticky top-0 z-30 border-b border-[#e8e6e5] bg-white px-4 py-2.5 flex items-center justify-between shadow-2xs">
      <div className="flex-1 max-w-[280px]">
        <CampSwitcher activeCamp={activeCamp} campsList={campsList} onSwitchCamp={onSwitchCamp} />
      </div>
    </div>
  );
}

// ─── Mobile Bottom Tab Bar ────────────────────────────────────────────────────
function MobileBottomNav() {
  const pathname = usePathname();
  const mobileNav = NAV.slice(0, 6);
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#e8e6e5] flex shadow-lg">
      {mobileNav.map(({ label, href, icon: Icon }) => {
        const isActive = href === "/portal-admin-26"
          ? pathname === "/portal-admin-26"
          : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${isActive ? "text-[#3ba6f1]" : "text-[#a8a29e]"}`}>
            <Icon size={17} />
            <span className="truncate max-w-[54px]">{label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────
function LoginForm({ onAuth }: { onAuth: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) { setError(authErr.message); setLoading(false); }
    else onAuth(email);
  };

  return (
    <div className="min-h-screen w-full bg-[#fafaf9] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-[#e8e6e5] rounded-[10px] p-8 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
        <div className="flex flex-col items-center mb-7 text-center">
          <div className="w-10 h-10 rounded-full bg-[#fafaf9] border border-[#e8e6e5] flex items-center justify-center mb-3">
            <Flame size={18} className="text-[#3ba6f1]" strokeWidth={2.5} />
          </div>
          <h1 className="font-display font-normal text-2xl text-[#0c0a09] tracking-tight">
            Camp <span className="text-[#3398e1] bg-[#c1e1f7] px-2 rounded">Admin</span>
          </h1>
          <p className="text-xs text-[#78716c] mt-1.5">Sign in to manage your camp meeting</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="pastor@theairportcitychurch.com"
              className="w-full px-3.5 py-2.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:outline-none focus:ring-2 focus:ring-[#3ba6f1]" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:outline-none focus:ring-2 focus:ring-[#3ba6f1]" />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-[#3ba6f1] hover:bg-[#3398e1] text-white font-medium text-xs rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Sign In"}
          </button>
        </form>
        <div className="mt-5 pt-4 border-t border-[#e8e6e5] text-center">
          <button onClick={() => onAuth("demo@tacc.org")}
            className="text-xs text-[#3398e1] hover:underline cursor-pointer">
            Enter as Demo Staff →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AdminShell ───────────────────────────────────────────────────────────────
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  
  const [campsList, setCampsList] = useState<CampDetails[]>([]);
  const [activeCampId, setActiveCampId] = useState<string>("camp-meeting-2026");
  const supabase = createClient();

  const loadCamps = async () => {
    const camps = await getCampsList();
    setCampsList(camps);
    const savedId = typeof window !== "undefined" ? localStorage.getItem("activeCampId") : null;
    if (savedId && camps.some(c => c.id === savedId)) {
      setActiveCampId(savedId);
    } else if (camps.length > 0) {
      setActiveCampId(camps[0].id);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setIsAuthed(true); setUserEmail(user.email || ""); }
      setIsChecking(false);
    });
    loadCamps();
  }, []);

  const switchCamp = (newCampId: string) => {
    setActiveCampId(newCampId);
    if (typeof window !== "undefined") {
      localStorage.setItem("activeCampId", newCampId);
    }
  };

  const handleAuth = (email: string) => {
    setIsAuthed(true);
    setUserEmail(email);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsAuthed(false);
    setUserEmail("");
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <Loader2 size={24} className="text-[#3ba6f1] animate-spin" />
      </div>
    );
  }

  if (!isAuthed) return <LoginForm onAuth={handleAuth} />;

  const activeCamp = campsList.find(c => c.id === activeCampId) || campsList[0];
  const campName = activeCamp?.name || "TACC Camp Meeting 2026";
  const isSuperAdmin = true;

  return (
    <AdminContext.Provider
      value={{
        isSuperAdmin,
        campId: activeCampId,
        campName,
        userEmail,
        campsList,
        switchCamp,
      }}
    >
      <div className="flex flex-col md:flex-row min-h-screen w-full bg-[#fafaf9]">
        <Sidebar
          activeCamp={activeCamp}
          campsList={campsList}
          onSwitchCamp={switchCamp}
          userEmail={userEmail}
          onSignOut={handleSignOut}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <MobileHeader
            activeCamp={activeCamp}
            campsList={campsList}
            onSwitchCamp={switchCamp}
          />
          <main className="flex-1 min-w-0 pb-24 md:pb-0 overflow-x-hidden">
            {children}
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </AdminContext.Provider>
  );
}
