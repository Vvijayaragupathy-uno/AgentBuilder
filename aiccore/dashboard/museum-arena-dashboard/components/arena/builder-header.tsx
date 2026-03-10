import { Activity, Radio, Shield, Zap, LogOut, Share2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export function BuilderHeader({
  stationCount = 8,
  onLogout,
  isAuthenticated = false
}: {
  stationCount?: number,
  onLogout?: () => void,
  isAuthenticated?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleShare = () => {
    const url = window.location.origin
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="sticky top-0 z-50 glass-strong border-b border-border">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-wide text-foreground uppercase">
                  AICCORE
                </span>
                <span className="text-muted-foreground text-xs font-light">|</span>
                <span className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
                  AICCORE Agent Builder
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider uppercase font-bold">
                {isAuthenticated ? "Administrative Authority" : "Mission Overview Mode"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 ring-1 ring-border">
            <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse-glow" />
            <span className="text-xs font-medium text-emerald-400">LIVE</span>
            <span className="text-xs text-muted-foreground font-mono">{stationCount} active stations</span>
          </div>

          <div className="flex items-center gap-2 border-l border-border pl-5 ml-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8 rounded-full border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-all pr-4"
              onClick={handleShare}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {copied ? "Link Copied" : "Live Share"}
              </span>
            </Button>

            {isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground hover:bg-destructive/10 gap-2 h-8 px-3 rounded-full transition-all group"
                onClick={onLogout}
              >
                <LogOut className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-xs font-medium uppercase tracking-tight">Logout</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
