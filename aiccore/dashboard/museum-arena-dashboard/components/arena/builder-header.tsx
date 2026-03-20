"use client"

import { useState, useEffect } from "react"
import { LogOut, Radio, Signal } from "lucide-react"
import { cn } from "@/lib/utils"
import { AiccoreLogo, AICCORE_MAKERSPACE } from "@/components/arena/aiccore-logo"

export function BuilderHeader({
  onLogout,
  isAuthenticated = false,
  stationCount,
}: {
  stationCount?: number
  onLogout?: () => void
  isAuthenticated?: boolean
}) {
  const [time, setTime] = useState("")
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const tick = () => {
      setTime(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return (
    <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-border bg-card/95 backdrop-blur-md px-5 gap-4">
      {/* Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <AiccoreLogo size={24} className="ring-1 ring-border" />
        <span className="text-sm font-bold tracking-wide text-foreground">{AICCORE_MAKERSPACE}</span>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        {/* Connection status */}
        <div className={cn(
          "hidden sm:flex items-center gap-1.5 glass rounded-md px-2.5 py-1 transition-colors duration-300",
          isOnline ? "border-emerald-500/20" : "border-rose-500/20"
        )}>
          <div className="relative flex h-1.5 w-1.5 shrink-0">
            {isOnline && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            )}
            <span className={cn(
              "relative inline-flex h-1.5 w-1.5 rounded-full",
              isOnline ? "bg-emerald-400" : "bg-rose-400"
            )} />
          </div>
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-widest",
            isOnline ? "text-emerald-400" : "text-rose-400"
          )}>
            {isOnline ? "Live" : "Offline"}
          </span>
        </div>

        {/* Live clock */}
        {time && (
          <div className="hidden md:flex items-center gap-1.5 glass rounded-md px-2.5 py-1">
            <Radio className="h-3 w-3 text-primary/50 shrink-0" />
            <span className="font-mono text-[11px] font-bold text-foreground/70 tabular-nums">
              {time}
            </span>
          </div>
        )}

        {/* Station count pill — only when authenticated */}
        {isAuthenticated && stationCount !== undefined && (
          <div className="hidden lg:flex items-center gap-1.5 glass rounded-md px-2.5 py-1">
            <Signal className="h-3 w-3 text-primary/50 shrink-0" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {stationCount} units
            </span>
          </div>
        )}

        {/* Admin logout */}
        {isAuthenticated && onLogout && (
          <button
            onClick={onLogout}
            title="Log out of admin"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        )}
      </div>
    </header>
  )
}
