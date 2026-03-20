"use client"

import { useState, useEffect, useCallback } from "react"
import { Crown, Monitor, Rocket, Zap, UserCheck, Clock } from "lucide-react"
import { MosaicDisplay } from "./mosaic-display"
import { cn, getApiBase } from "@/lib/utils"
import type { Challenge, TVStudent } from "./tv-display"

// ── Countdown Timer Hook ──────────────────────────────────────────────────────

function useCountdown(challenge: Challenge): string {
  const [display, setDisplay] = useState("--:--")

  useEffect(() => {
    if (!challenge.start_time) {
      setDisplay(`${String(challenge.duration_minutes).padStart(2, "0")}:00`)
      return
    }

    const endTime = new Date(challenge.start_time).getTime() + challenge.duration_minutes * 60_000

    const tick = () => {
      const remaining = Math.max(0, endTime - Date.now())
      const mins = Math.floor(remaining / 60_000)
      const secs = Math.floor((remaining % 60_000) / 1000)
      setDisplay(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [challenge])

  return display
}

// ── TV-Scale Leaderboard ──────────────────────────────────────────────────────

function statusMeta(status: TVStudent["status"]) {
  if (status === "SUBMITTED")    return { icon: Rocket,    color: "text-emerald-400", label: "Submitted" }
  if (status === "PARTICIPATING") return { icon: Zap,       color: "text-amber-400",  label: "Building"  }
  return                                 { icon: UserCheck, color: "text-sky-400",    label: "Registered" }
}

function TVLeaderboard() {
  const [students, setStudents] = useState<TVStudent[]>([])

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/v1/aiccore/leaderboard`)
      if (res.ok) setStudents(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadData()
    const id = setInterval(loadData, 5000)
    return () => clearInterval(id)
  }, [loadData])

  const building  = students.filter(s => s.status === "PARTICIPATING").length
  const submitted = students.filter(s => s.status === "SUBMITTED").length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/5 shrink-0">
        <div className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <h3 className="text-[13px] font-black uppercase tracking-[0.3em] text-muted-foreground">
          Leaderboard
        </h3>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-2">
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground/40">
            <Clock className="h-10 w-10" />
            <p className="text-[14px] font-bold uppercase tracking-widest text-center">
              Waiting for builders
            </p>
          </div>
        ) : (
          students.map((s, i) => {
            const meta = statusMeta(s.status)
            const StatusIcon = meta.icon
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 glass ring-1 transition-all",
                  i === 0 ? "ring-amber-400/30 glow-gold" : "ring-white/5",
                )}
              >
                {/* Rank */}
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-black",
                  i === 0 ? "bg-amber-400/15 text-amber-400" :
                  i === 1 ? "bg-white/5 text-white/50" :
                            "bg-white/5 text-white/30",
                )}>
                  {i === 0 ? <Crown className="h-5 w-5 text-amber-400" /> : i + 1}
                </div>

                {/* Avatar + name */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-black ring-1",
                    i === 0
                      ? "bg-amber-400/20 text-amber-400 ring-amber-400/30"
                      : "bg-primary/10 text-primary ring-primary/20",
                  )}>
                    {s.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[17px] font-black text-foreground truncate">{s.nickname}</p>
                    <div className="flex items-center gap-1">
                      <Monitor className="h-3 w-3 text-muted-foreground/40" />
                      <span className="text-[11px] font-mono text-muted-foreground/40">
                        Station {s.station}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status icon */}
                <StatusIcon className={cn("h-5 w-5 shrink-0", meta.color)} />

                {/* Score */}
                <span className={cn(
                  "text-[24px] font-black font-mono tabular-nums shrink-0",
                  i === 0 ? "text-amber-400" : "text-foreground",
                )}>
                  {s.score.toLocaleString()}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Stats footer */}
      {students.length > 0 && (
        <div className="shrink-0 flex items-center justify-around border-t border-white/5 py-4 px-4">
          <div className="text-center">
            <p className="text-[26px] font-black text-amber-400">{building}</p>
            <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Building</p>
          </div>
          <div className="h-8 w-px bg-white/5" />
          <div className="text-center">
            <p className="text-[26px] font-black text-emerald-400">{submitted}</p>
            <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Submitted</p>
          </div>
          <div className="h-8 w-px bg-white/5" />
          <div className="text-center">
            <p className="text-[26px] font-black text-foreground">{students.length}</p>
            <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Total</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main TVLive Component ─────────────────────────────────────────────────────

export function TVLive({ challenge }: { challenge: Challenge }) {
  const timer = useCountdown(challenge)

  const complexityStyle =
    challenge.complexity_level === "Beginner"     ? "bg-emerald-500/20 text-emerald-400 ring-emerald-500/30" :
    challenge.complexity_level === "Intermediate" ? "bg-amber-500/20  text-amber-400  ring-amber-500/30"  :
                                                    "bg-rose-500/20   text-rose-400   ring-rose-500/30"

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-6 px-8 py-4 border-b border-white/5 bg-black/40 backdrop-blur-sm shrink-0">
        {/* LIVE pill */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute h-full w-full rounded-full bg-rose-400 opacity-60" />
            <span className="relative h-3 w-3 rounded-full bg-rose-400" />
          </div>
          <span className="text-[14px] font-black uppercase tracking-[0.35em] text-rose-400">Live</span>
        </div>

        <div className="h-6 w-px bg-white/10" />

        {/* Complexity + title */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className={cn(
            "shrink-0 text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full ring-1",
            complexityStyle,
          )}>
            {challenge.complexity_level}
          </span>
          <h1 className="text-[28px] font-black uppercase tracking-tight text-foreground truncate">
            {challenge.title}
          </h1>
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-3 glass rounded-xl px-5 py-2.5 ring-1 ring-primary/20 shrink-0">
          <Clock className="h-5 w-5 text-primary shrink-0" />
          <span className="text-[36px] font-black font-mono tabular-nums text-primary leading-none">
            {timer}
          </span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mosaic (left ~70%) */}
        <div className="flex-1 overflow-hidden border-r border-white/5">
          <MosaicDisplay />
        </div>

        {/* Leaderboard (right ~30%) */}
        <div className="w-[360px] shrink-0 overflow-hidden bg-black/20">
          <TVLeaderboard />
        </div>
      </div>

      {/* ── Bottom context strip ── */}
      <div className="shrink-0 flex items-center gap-4 border-t border-white/5 bg-black/40 px-8 py-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[12px] font-black uppercase tracking-[0.3em] text-primary">
            Now Building
          </span>
        </div>
        <span className="text-white/15">·</span>
        <p className="text-[15px] font-semibold text-muted-foreground flex-1 truncate">
          {challenge.description}
        </p>
      </div>
    </div>
  )
}
