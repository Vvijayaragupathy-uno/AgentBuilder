"use client"

import Link from "next/link"
import {
  LayoutDashboard,
  ClipboardCheck,
  Users,
  Search,
  Trophy,
  Cpu,
  Settings,
  Monitor,
  Sparkles,
  FileText, // Added FileText
} from "lucide-react"
import { cn } from "@/lib/utils"

interface MobileTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isAuthenticated?: boolean
}

const publicTabs = [
  { id: "live", label: "Live", icon: LayoutDashboard },
  { id: "challenges", label: "Challenges", icon: Search },
]

const adminTabs = [
  { id: "mosaic", label: "Display", icon: Trophy },
  { id: "submissions", label: "Submissions", icon: FileText },
  { id: "contestants", label: "Registry", icon: Users },
  { id: "review", label: "Review", icon: ClipboardCheck },
  { id: "stations", label: "Stations", icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
]

export function MobileTabs({ activeTab, onTabChange, isAuthenticated = false }: MobileTabsProps) {
  const tabs = isAuthenticated ? [...publicTabs, ...adminTabs] : publicTabs

  return (
    <div className="flex lg:hidden flex-col gap-1 px-2 py-2 glass-strong border-b border-border">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {tab.label}
            </button>
          )
        })}
      </div>
      {isAuthenticated && (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[8px] font-bold text-primary/80 uppercase tracking-widest">Admin tabs</p>
          <Link
            href="/tv"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[8px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10"
          >
            <Monitor className="h-3 w-3" />
            TV ↗
          </Link>
        </div>
      )}
    </div>
  )
}
