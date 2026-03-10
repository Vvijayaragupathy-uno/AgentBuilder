"use client"

import { LayoutDashboard, ClipboardCheck, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface MobileTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const tabs = [
  { id: "live", label: "Live Board", icon: LayoutDashboard },
  { id: "review", label: "Review", icon: ClipboardCheck },
  { id: "contestants", label: "Registry", icon: Users },
]

export function MobileTabs({ activeTab, onTabChange }: MobileTabsProps) {
  return (
    <div className="flex lg:hidden items-center gap-1 px-4 py-2 glass-strong border-b border-border">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
