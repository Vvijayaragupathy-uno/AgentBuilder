"use client"

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { TVAttract } from "./tv-attract"
import { TVLive } from "./tv-live"
import { applyServerTimeFromIso, cn, getApiBase, skewedNow } from "@/lib/utils"
import { Crown, Rocket, Clock, Users, RotateCcw } from "lucide-react"

// ── Shared Types ─────────────────────────────────────────────────────────────

export interface Challenge {
  id: string
  title: string
  description: string
  complexity_level: string
  is_active: boolean
  is_registration_open: boolean
  start_time: string | null
  duration_minutes: number
  max_participants?: number
  registration_count?: number
  banner_image_url?: string
}

export interface TVStudent {
  id: string
  nickname: string
  station: string
  status: "REGISTERED" | "CHECKED_IN" | "PARTICIPATING" | "SUBMITTED"
  score: number
  is_winner: boolean
}

type TVMode = "attract" | "live" | "results"

interface TVToast {
  id: string
  message: string
  icon: "submit" | "join" | "warning"
}

// ── Toast Layer ───────────────────────────────────────────────────────────────

function ToastLayer({ toasts }: { toasts: TVToast[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-10 right-10 z-50 flex flex-col-reverse gap-4 pointer-events-none">
      {toasts.slice(0, 3).map(t => (
        <div
          key={t.id}
          className="glass-strong flex items-center gap-4 rounded-2xl px-7 py-4 ring-1 ring-primary/40 shadow-2xl shadow-black/60"
          style={{ animation: "tv-toast-slide 4.2s ease forwards" }}
        >
          <div className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            t.icon === "submit" ? "bg-primary/20" :
              t.icon === "join" ? "bg-sky-400/20" : "bg-amber-400/20"
          )}>
            {t.icon === "submit" && <Rocket className="h-6 w-6 text-primary" />}
            {t.icon === "join"   && <Users  className="h-6 w-6 text-sky-400" />}
            {t.icon === "warning" && <Clock  className="h-6 w-6 text-amber-400" />}
          </div>
          <span className="text-[22px] font-bold text-foreground">{t.message}</span>
        </div>
      ))}
    </div>
  )
}

// ── Results Mode ─────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#ec4899",
  "#8b5cf6", "#ef4444", "#f97316", "#06b6d4",
]

function TVResults({
  challenge,
  leaderboard,
  countdown,
  nextChallenge,
}: {
  challenge: Challenge
  leaderboard: TVStudent[]
  countdown: number
  nextChallenge: Challenge | null
}) {
  const confetti = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: (i * 1.67 + Math.sin(i) * 20 + 100) % 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: 8 + (i % 5) * 3,
      h: 6 + (i % 4) * 2,
      dur: 3 + (i % 10) * 0.3,
      delay: (i % 20) * 0.1,
    })), [])

  const winner = leaderboard[0]
  const podium = leaderboard.slice(0, 3)

  const podiumStyles = [
    { ring: "ring-amber-400/40", text: "text-amber-400", bg: "bg-amber-400/15", py: "py-10" },
    { ring: "ring-slate-300/30", text: "text-slate-300",  bg: "bg-slate-300/10",  py: "py-6"  },
    { ring: "ring-amber-700/30", text: "text-amber-700",  bg: "bg-amber-700/10",  py: "py-4"  },
  ]

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background flex flex-col items-center justify-center">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full bg-primary/8 blur-[120px]" />

      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map(c => (
          <div
            key={c.id}
            className="absolute top-0 rounded-sm"
            style={{
              left: `${c.x}%`,
              width: c.w,
              height: c.h,
              backgroundColor: c.color,
              opacity: 0,
              animation: `tv-confetti-fall ${c.dur}s ease-in ${c.delay}s forwards`,
            }}
          />
        ))}
      </div>

      {/* Dot grid */}
      <div className="pointer-events-none absolute inset-0 bg-dot-grid opacity-20" />

      <div className="relative z-10 flex flex-col items-center gap-10 text-center max-w-5xl px-12">
        {/* Title */}
        <div className="space-y-2 animate-in fade-in duration-700">
          <span className="text-[13px] font-black uppercase tracking-[0.45em] text-primary">
            Challenge Complete
          </span>
          <h1 className="text-[52px] font-black uppercase tracking-tighter leading-[0.9] text-foreground">
            {challenge.title}
          </h1>
        </div>

        {/* Winner spotlight */}
        {winner && (
          <div className="flex flex-col items-center gap-5 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-400/25 blur-2xl" />
              <div className="relative h-32 w-32 rounded-full bg-amber-400/15 ring-4 ring-amber-400/50 flex items-center justify-center glow-gold">
                <span className="text-5xl font-black text-amber-400">
                  {winner.nickname.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <Crown className="absolute -top-5 left-1/2 -translate-x-1/2 h-9 w-9 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
            </div>
            <div>
              <p className="text-[52px] font-black uppercase tracking-tighter text-amber-400 leading-none">
                {winner.nickname}
              </p>
              <p className="text-[18px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                1st Place · {winner.score.toLocaleString()} pts
              </p>
            </div>
          </div>
        )}

        {/* Podium */}
        {podium.length > 1 && (
          <div className="flex items-end gap-5 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {podium.map((s, i) => {
              const rc = podiumStyles[i]
              return (
                <div key={s.id} className={cn("glass flex flex-col items-center gap-2.5 rounded-2xl px-9 ring-1", rc.ring, rc.py)}>
                  <span className={cn("text-[11px] font-black uppercase tracking-widest", rc.text)}>
                    {["1st", "2nd", "3rd"][i]}
                  </span>
                  <div className={cn("h-14 w-14 rounded-full flex items-center justify-center text-xl font-black", rc.bg, rc.text)}>
                    {s.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-[22px] font-black text-foreground">{s.nickname}</p>
                  <p className={cn("text-[32px] font-black font-mono", rc.text)}>{s.score.toLocaleString()}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col items-center gap-3">
          {nextChallenge && countdown <= 30 && (
            <div className="glass rounded-2xl px-8 py-4 ring-1 ring-primary/20 mb-2 text-center">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-primary mb-1">Up Next</p>
              <p className="text-[22px] font-bold text-foreground">{nextChallenge.title}</p>
            </div>
          )}
          <div className="flex items-center gap-2 text-[14px] font-bold text-muted-foreground/50 uppercase tracking-widest">
            <div className="h-px w-12 bg-border" />
            <span>Returning to display in {countdown}s</span>
            <div className="h-px w-12 bg-border" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Orchestrator ─────────────────────────────────────────────────────────

function TVDisplayInner() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const rawMode = searchParams.get("mode")
  // ?mode=auto or omit mode → automatic attract/live/results. Forced only for live|attract|results.
  const forcedMode =
    rawMode && rawMode !== "auto" ? (rawMode as TVMode) : null

  const [mode, setMode]                         = useState<TVMode>("attract")
  const [challenges, setChallenges]             = useState<Challenge[]>([])
  const [activeChallenge, setActiveChallenge]   = useState<Challenge | null>(null)
  const [resultsChallenge, setResultsChallenge] = useState<Challenge | null>(null)
  const [resultsLeaderboard, setResultsLB]      = useState<TVStudent[]>([])
  const [resultsCountdown, setResultsCountdown] = useState(90)
  const [nextChallenge, setNextChallenge]       = useState<Challenge | null>(null)
  const [toasts, setToasts]                     = useState<TVToast[]>([])

  const prevActiveRef      = useRef<Challenge | null>(null)
  const toastIdRef         = useRef(0)
  const knownSessionsRef   = useRef<Set<string>>(new Set())
  const warnedChallengesRef = useRef<Set<string>>(new Set())

  const addToast = useCallback((message: string, icon: TVToast["icon"]) => {
    const id = `t${toastIdRef.current++}`
    setToasts(prev => [...prev.slice(-2), { id, message, icon }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4600)
  }, [])

  const fetchLeaderboard = useCallback(async (): Promise<TVStudent[]> => {
    try {
      const res = await fetch(`${getApiBase()}/api/v1/aiccore/leaderboard`)
      if (res.ok) return await res.json()
    } catch { /* network error — return empty */ }
    return []
  }, [])

  const pollChallenges = useCallback(async () => {
    try {
      const base = getApiBase()
      const [statusRes, res] = await Promise.all([
        fetch(`${base}/api/v1/aiccore/system/status`),
        fetch(`${base}/api/v1/aiccore/challenges`),
      ])
      if (statusRes.ok) {
        const st = await statusRes.json()
        applyServerTimeFromIso(st.server_time)
      }
      if (!res.ok) return
      const data: Challenge[] = await res.json()
      setChallenges(data)

      // In forced mode, always update challenge data for slides but never switch mode
      if (forcedMode) {
        const nowActive = data.find(c => c.is_active) ?? null
        if (nowActive) setActiveChallenge(nowActive)
        return
      }

      const nowActive  = data.find(c => c.is_active) ?? null
      const wasActive  = prevActiveRef.current

      if (nowActive) {
        prevActiveRef.current = nowActive
        setActiveChallenge(nowActive)
        setMode("live")
      } else if (wasActive) {
        prevActiveRef.current = null
        const lb = await fetchLeaderboard()
        const upcoming = data.find(c => c.is_registration_open && !c.is_active) ?? null
        setResultsChallenge(wasActive)
        setResultsLB(lb)
        setNextChallenge(upcoming)
        setResultsCountdown(90)
        setMode("results")
      } else {
        setMode("attract")
        // 2-minute start warning (fires once per challenge)
        data.forEach(c => {
          if (!c.start_time || c.is_active || warnedChallengesRef.current.has(c.id)) return
          const diff = new Date(c.start_time).getTime() - skewedNow()
          if (diff > 0 && diff <= 2 * 60 * 1000) {
            warnedChallengesRef.current.add(c.id)
            addToast(`"${c.title}" starts in 2 minutes!`, "warning")
          }
        })
      }
    } catch { /* ignore polling errors */ }
  }, [forcedMode, fetchLeaderboard, addToast])

  // Poll every 5 seconds
  useEffect(() => {
    pollChallenges()
    const id = setInterval(pollChallenges, 5000)
    return () => clearInterval(id)
  }, [pollChallenges])

  // Results countdown → back to attract
  useEffect(() => {
    if (mode !== "results" || forcedMode) return
    if (resultsCountdown <= 0) { setMode("attract"); return }
    const id = setTimeout(() => setResultsCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [mode, resultsCountdown, forcedMode])

  // Keep results podium in sync if admin marks winner / scores after challenge ends
  useEffect(() => {
    if (mode !== "results" || forcedMode) return
    const id = setInterval(async () => {
      const lb = await fetchLeaderboard()
      setResultsLB(lb)
    }, 5000)
    return () => clearInterval(id)
  }, [mode, forcedMode, fetchLeaderboard])

  // WebSocket — real-time toasts with auto-reconnect
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelay = 1000
    let destroyed = false

    const connect = () => {
      if (destroyed) return
      ws = new WebSocket(getApiBase().replace(/^http/, "ws") + "/api/v1/aiccore/ws")

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.event_type === "submitted") {
            const nick = msg.payload?.nickname || "A builder"
            addToast(`${nick} just submitted!`, "submit")
          }

          if (msg.event_type === "flow_saved") {
            const sid = msg.session_id
            if (sid && !knownSessionsRef.current.has(sid)) {
              knownSessionsRef.current.add(sid)
              const station = msg.payload?.station_id ?? "?"
              const nick    = msg.payload?.nickname
              addToast(
                nick ? `${nick} joined Station ${station}` : `New builder joined Station ${station}`,
                "join",
              )
            }
          }

          if (msg.type === "SYSTEM_FINALIZE") {
            addToast("Challenge has ended!", "warning")
          }
        } catch { /* ignore malformed messages */ }
      }

      ws.onopen = () => { retryDelay = 1000 }

      ws.onclose = () => {
        if (destroyed) return
        reconnectTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30_000)
          connect()
        }, retryDelay)
      }
    }

    connect()

    return () => {
      destroyed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [addToast])

  const current = forcedMode ?? mode

  // In forced-live mode with no real active challenge, fall back to first available
  const liveChallenge = activeChallenge ?? (forcedMode === "live" ? (challenges[0] ?? null) : null)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {current === "attract" && (
        <TVAttract challenges={challenges} />
      )}

      {current === "live" && liveChallenge && (
        <TVLive challenge={liveChallenge} />
      )}

      {current === "live" && !liveChallenge && (
        <div className="flex h-screen w-screen items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {current === "results" && resultsChallenge && (
        <TVResults
          challenge={resultsChallenge}
          leaderboard={resultsLeaderboard}
          countdown={resultsCountdown}
          nextChallenge={nextChallenge}
        />
      )}

      {/* Fallback: forced results but no data yet */}
      {current === "results" && !resultsChallenge && (
        <TVAttract challenges={challenges} />
      )}

      <ToastLayer toasts={toasts} />

      {forcedMode && (
        <button
          type="button"
          onClick={() => {
            const p = new URLSearchParams(searchParams.toString())
            p.delete("mode")
            const q = p.toString()
            router.replace(q ? `${pathname}?${q}` : pathname)
          }}
          className="fixed bottom-6 left-6 z-[100] pointer-events-auto flex items-center gap-2 rounded-xl border border-primary/40 bg-background/90 px-4 py-2 text-sm font-bold uppercase tracking-widest text-foreground shadow-lg backdrop-blur-md hover:bg-primary/10"
        >
          <RotateCcw className="h-4 w-4 text-primary" />
          Auto TV mode
        </button>
      )}
    </div>
  )
}

export function TVDisplay() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    }>
      <TVDisplayInner />
    </Suspense>
  )
}
