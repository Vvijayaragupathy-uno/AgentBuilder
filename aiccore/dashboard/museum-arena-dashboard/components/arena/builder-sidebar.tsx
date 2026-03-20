"use client"

import {
  LayoutDashboard,
  Trophy,
  ClipboardCheck,
  Settings,
  Users,
  Cpu,
  Shield,
  Search,
  KeyRound,
  LogOut,
} from "lucide-react"

/** Tabs that require Admin Access (cookie). */
export const ADMIN_ONLY_TAB_IDS = ["contestants", "review", "stations", "settings"] as const

import { cn } from "@/lib/utils"

interface BuilderSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isAuthenticated?: boolean
  onAdminLogin?: () => void
  onAdminLogout?: () => void
}

const publicItems = [
  { id: "live",        label: "Live Board",  icon: LayoutDashboard },
  { id: "challenges",  label: "Challenges",  icon: Search },
  { id: "mosaic",      label: "Display",     icon: Trophy },
]

const adminItems = [
  { id: "contestants", label: "Registry",    icon: Users },
  { id: "review",      label: "Review",      icon: ClipboardCheck },
  { id: "stations",    label: "Stations",    icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
]

export function BuilderSidebar({
  activeTab,
  onTabChange,
  isAuthenticated = false,
  onAdminLogin,
  onAdminLogout,
}: BuilderSidebarProps) {

  const renderItem = (item: { id: string; label: string; icon: React.ElementType }) => {
    const Icon = item.icon
    const isActive = activeTab === item.id
    return (
      <button
        key={item.id}
        onClick={() => onTabChange(item.id)}
        className={cn(
          "relative flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm transition-all duration-200",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
        )}
      >
        {/* Left-border active indicator — Material/Google style */}
        <span
          className={cn(
            "absolute left-0 inset-y-2 w-0.5 rounded-r-full transition-all duration-200",
            isActive ? "bg-primary opacity-100" : "opacity-0"
          )}
        />
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-all duration-200",
            isActive ? "scale-110" : "scale-100"
          )}
        />
        <span>{item.label}</span>
      </button>
    )
  }

  return (
    <aside
      className="hidden lg:flex flex-col w-52 border-r border-border bg-card h-full"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
          <Shield className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-wider text-foreground leading-none">AICCORE</span>
          <span className="text-[9px] font-medium text-muted-foreground/50 uppercase tracking-widest mt-0.5">Dashboard</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto">
        {/* Public section */}
        <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.15em] px-2 pb-1.5 pt-2">
          Live Arena
        </p>
        {publicItems.map(renderItem)}

        {/* Admin section — only when authenticated */}
        {isAuthenticated && (
          <>
            <div className="my-3 border-t border-border/60" />
            <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.15em] px-2 pb-1.5">
              Admin
            </p>
            {adminItems.map(renderItem)}
          </>
        )}
      </nav>

      {/* Bottom: Admin login / logout */}
      <div className="p-3 border-t border-border">
        {isAuthenticated ? (
          <button
            onClick={onAdminLogout}
            className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 group"
          >
            <LogOut className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            <span>Log out of Admin</span>
          </button>
        ) : (
          <button
            onClick={onAdminLogin}
            className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200 group"
          >
            <KeyRound className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-12" />
            <span>Admin Access</span>
          </button>
        )}
      </div>
    </aside>
  )
}
