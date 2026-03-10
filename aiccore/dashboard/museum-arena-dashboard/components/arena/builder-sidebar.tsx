"use client"

import {
  LayoutDashboard,
  Trophy,
  ClipboardCheck,
  Settings,
  Users,
  Cpu,
  Shield,
  Lock,
  Search,
} from "lucide-react"

import { cn } from "@/lib/utils"

interface BuilderSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isAuthenticated?: boolean
}

const navItems = [
  { id: "live", label: "Builder Leaderboard", icon: LayoutDashboard },
  { id: "challenges", label: "Mission Catalog", icon: Search },
  { id: "mosaic", label: "Visual Display", icon: Trophy },
]

const operationalItems = [
  { id: "contestants", label: "Contestant Monitor", icon: Users, protected: true },
  { id: "review", label: "Deployment Review", icon: ClipboardCheck, protected: true },
]

const systemItems = [
  { id: "stations", label: "Station Status", icon: Cpu, protected: true },
  { id: "settings", label: "System Config", icon: Settings, protected: true },
]



export function BuilderSidebar({ activeTab, onTabChange, isAuthenticated = false }: BuilderSidebarProps) {
  const renderItem = (item: any) => {
    const Icon = item.icon
    const isActive = activeTab === item.id
    const isLocked = item.protected && !isAuthenticated

    return (
      <button
        key={item.id}
        onClick={() => onTabChange(item.id)}
        className={cn(
          "flex items-center justify-between w-full rounded-lg px-3 py-2 text-sm transition-all duration-200 group",
          isActive
            ? "bg-primary/10 text-primary ring-1 ring-primary/20 font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className={cn("h-4 w-4", !isActive && "group-hover:scale-110 transition-transform")} />
          <span className="truncate">{item.label}</span>
        </div>
        {isLocked && (
          <Lock className="h-3 w-3 text-muted-foreground/40 group-hover:text-amber-400 group-hover:animate-bounce transition-colors" />
        )}
      </button>
    )
  }

  return (
    <aside className="hidden lg:flex flex-col w-56 border-r border-border glass-strong h-full" role="navigation" aria-label="Main navigation">
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold tracking-wide text-foreground uppercase tracking-wider">AICCORE</span>
          <span className="text-[10px] font-mono text-muted-foreground/60 tracking-widest">BUILDER</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-3 flex-1">
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/50 uppercase px-2 pb-2 pt-1 font-mono">
          Dashboard Views
        </span>
        {navItems.map(renderItem)}

        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/50 uppercase px-2 pb-2 pt-5 font-mono">
          Tactical Operations
        </span>
        {operationalItems.map(renderItem)}

        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/50 uppercase px-2 pb-2 pt-5 font-mono">
          Builder Intelligence
        </span>
        {systemItems.map(renderItem)}
      </nav>

      <div className="p-3 border-t border-border">
        {!isAuthenticated ? (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-orange-500/5 ring-1 ring-orange-500/10 mb-2">
            <div className="flex items-center gap-2 text-orange-400">
              <Lock className="h-3 w-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Restricted Access</span>
            </div>
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              Login to modify registry, rules, and award honors.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-primary/5 ring-1 ring-primary/10 mb-2">
            <div className="flex items-center gap-2 text-primary">
              <Shield className="h-3 w-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Admin Authorized</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2.5 ring-1 ring-border">
          <Trophy className="h-4 w-4 text-amber-400" />
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground">Builder State</span>
            <span className="text-xs font-mono font-semibold text-foreground italic">LIVE ROUND</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
