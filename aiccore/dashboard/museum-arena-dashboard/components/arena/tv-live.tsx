"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Crown, Monitor, Rocket, Zap, UserCheck, LogIn, Clock, Trophy } from "lucide-react"
import { MosaicDisplay, type MosaicEmptyState } from "./mosaic-display"
import { FlowPreviewCard } from "./flow-preview-card"
import { playTVSting } from "@/lib/tv-audio"
import { applyServerTimeFromIso, cn, formatBuilderSeatLabel, getApiBase, getLangflowUrl, skewedNow } from "@/lib/utils"
import type { Challenge, TVStudent } from "./tv-display"

interface DemoPresenting {
  session_id: string
  nickname: string
  station_id: string | null
  flow_preview: { nodes: any[]; edges: any[] }
  segment_ends_at: string | null
}

interface DemoStatusPayload {
  gate_open: boolean
  queue: { session_id: string; nickname: string; station_id: string | null }[]
  cursor: number
  queue_length: number
  presenting: DemoPresenting | null
  segment_seconds: number
}

// ── Countdown Timer Hook ──────────────────────────────────────────────────────

/** When set for the same mission as `challenge`, uses server `mission_build_ends_at` (matches builder). */
function useCountdown(
  challenge: Challenge,
  serverMissionEnd: { endsAtIso: string } | null,
): string {
  const [display, setDisplay] = useState("--:--")
  const challengeId = challenge.id
  const startTime = challenge.start_time
  const durationMinutes = challenge.duration_minutes
  const serverIso = serverMissionEnd?.endsAtIso ?? null

  useEffect(() => {
    let endTime: number | null = null
    if (serverIso) {
      const parsed = Date.parse(serverIso)
      if (Number.isFinite(parsed)) endTime = parsed
    }
    if (endTime == null) {
      if (!startTime) {
        setDisplay("—:—")
        return
      }
      const t = new Date(startTime).getTime() + durationMinutes * 60_000
      endTime = Number.isFinite(t) ? t : null
    }
    if (endTime == null) {
      setDisplay("—:—")
      return
    }

    const tick = () => {
      const remaining = Math.max(0, endTime! - skewedNow())
      const mins = Math.floor(remaining / 60_000)
      const secs = Math.floor((remaining % 60_000) / 1000)
      setDisplay(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [challengeId, startTime, durationMinutes, serverIso])

  return display
}

// ── TV-Scale Leaderboard ──────────────────────────────────────────────────────

function statusMeta(status: TVStudent["status"]) {
  if (status === "SUBMITTED")     return { icon: Rocket,    color: "text-emerald-400", label: "Submitted" }
  if (status === "PARTICIPATING") return { icon: Zap,       color: "text-amber-400",  label: "Building" }
  if (status === "CHECKED_IN")   return { icon: LogIn,     color: "text-cyan-400",  label: "Checked in" }
  if (status === "REGISTERED")  return { icon: UserCheck, color: "text-sky-400",   label: "Registered" }
  return { icon: UserCheck, color: "text-muted-foreground", label: "Unknown" }
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
                    <div
                      className="flex items-center gap-1"
                      title={s.station && s.station !== "0" ? s.station : undefined}
                    >
                      <Monitor className="h-3 w-3 text-muted-foreground/40" />
                      <span className="text-[11px] font-mono text-muted-foreground/40">
                        {formatBuilderSeatLabel(s.station)}
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
  const [missionEndFromServer, setMissionEndFromServer] = useState<{ endsAtIso: string } | null>(null)
  const timer = useCountdown(challenge, missionEndFromServer)
  const [congrats, setCongrats] = useState<{ nickname: string; until: number } | null>(null)
  const [demo, setDemo] = useState<DemoStatusPayload | null>(null)
  const wsRetryRef = useRef(1000)

  const loadDemo = useCallback(async () => {
    try {
      const st = await fetch(`${getApiBase()}/api/v1/aiccore/system/status`)
      if (st.ok) {
        const j = await st.json()
        applyServerTimeFromIso(j.server_time)
        const sid = typeof j.active_challenge_id === "string" ? j.active_challenge_id : ""
        const end = typeof j.mission_build_ends_at === "string" ? j.mission_build_ends_at : ""
        if (sid && end && sid === challenge.id) {
          setMissionEndFromServer({ endsAtIso: end })
        } else {
          setMissionEndFromServer(null)
        }
      }
      const res = await fetch(`${getApiBase()}/api/v1/aiccore/demo/status`)
      if (res.ok) setDemo(await res.json())
    } catch { /* ignore */ }
  }, [challenge.id])

  useEffect(() => {
    loadDemo()
    const id = setInterval(loadDemo, 2000)
    return () => clearInterval(id)
  }, [loadDemo])

  useEffect(() => {
    if (!congrats) return
    const ms = Math.max(0, congrats.until - skewedNow())
    const id = window.setTimeout(() => setCongrats(null), ms)
    return () => clearTimeout(id)
  }, [congrats])

  useEffect(() => {
    let ws: WebSocket | null = null
    let t: ReturnType<typeof setTimeout> | null = null
    let destroyed = false

    const connect = () => {
      if (destroyed) return
      ws = new WebSocket(getApiBase().replace(/^http/, "ws") + "/api/v1/aiccore/ws")
      ws.onopen = () => { wsRetryRef.current = 1000 }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.event_type === "submitted") {
            const nick = msg.payload?.nickname || "A builder"
            setCongrats({ nickname: nick, until: skewedNow() + 5500 })
          }
          if (
            msg.type === "DEMO_GATE_OPEN" ||
            msg.type === "DEMO_QUEUE_UPDATE" ||
            msg.type === "SUBMISSION_UPDATE"
          ) {
            void loadDemo()
          }
        } catch { /* ignore */ }
      }
      ws.onclose = () => {
        if (destroyed) return
        t = setTimeout(() => {
          wsRetryRef.current = Math.min(wsRetryRef.current * 2, 30_000)
          connect()
        }, wsRetryRef.current)
      }
    }
    connect()
    return () => {
      destroyed = true
      if (t) clearTimeout(t)
      ws?.close()
    }
  }, [loadDemo])

  const showCongrats = Boolean(congrats && skewedNow() < congrats.until)
  const presenting = demo?.gate_open && demo.presenting

  /** During full-screen demo, show this slot’s countdown — not the mission build clock (avoids “two timers”). */
  const [demoSlotClock, setDemoSlotClock] = useState<string | null>(null)
  const prevPresentingRef = useRef(false)

  useEffect(() => {
    if (showCongrats) {
      playTVSting("submit", 0.38)
    }
  }, [showCongrats])

  useEffect(() => {
    const now = Boolean(presenting)
    if (now && !prevPresentingRef.current) {
      playTVSting("demoStart", 0.4)
    }
    prevPresentingRef.current = now
  }, [presenting])

  useEffect(() => {
    if (!presenting || !demo?.presenting?.segment_ends_at) {
      setDemoSlotClock(null)
      return
    }
    const end = new Date(demo.presenting.segment_ends_at).getTime()
    const tick = () => {
      if (!Number.isFinite(end)) {
        setDemoSlotClock("—:—")
        return
      }
      const sec = Math.max(0, Math.floor((end - skewedNow()) / 1000))
      const m = Math.floor(sec / 60)
      const s = sec % 60
      setDemoSlotClock(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [presenting, demo?.presenting?.segment_ends_at])

  /** Empty mosaic copy: scheduled end at 00:00, or open-ended mission + demo gate / queue. */
  const mosaicEmptyState = useMemo((): MosaicEmptyState => {
    const qlen = demo?.queue_length ?? 0
    const scheduledEnd = timer === "00:00" && Boolean(challenge.start_time)
    const openEndedDemo = !challenge.start_time && (demo?.gate_open || qlen > 0)

    if (scheduledEnd || openEndedDemo) {
      if (demo?.gate_open) {
        if (qlen === 0) {
          return {
            title: scheduledEnd ? "Build time ended" : "Demo phase",
            subtitle:
              "Demo queue is open. On your station, tap Join demo queue — the TV switches to full canvas when someone is in the queue.",
          }
        }
        return {
          title: "Demo queue ready",
          subtitle: `${qlen} presenter${qlen !== 1 ? "s" : ""} in queue — playback starts shortly.`,
        }
      }
      if (scheduledEnd) {
        return {
          title: "Build time ended",
          subtitle:
            "All builders have finished or left the mosaic. Facilitator can open the demo queue from the dashboard, or builders can join the queue after submit.",
        }
      }
    }
    return {
      title: "No live canvases on the mosaic",
      subtitle:
        "This grid only shows builders who are still active and have not submitted. After submit, your preview disappears here — use Join demo queue on your station to appear on the big screen when demos start.",
    }
  }, [timer, challenge.id, challenge.start_time, demo?.gate_open, demo?.queue_length])

  const complexityStyle =
    challenge.complexity_level === "Beginner"     ? "bg-emerald-500/20 text-emerald-400 ring-emerald-500/30" :
    challenge.complexity_level === "Intermediate" ? "bg-amber-500/20  text-amber-400  ring-amber-500/30"  :
                                                    "bg-rose-500/20   text-rose-400   ring-rose-500/30"

  return (
    <div className="relative h-screen w-screen flex flex-col overflow-hidden bg-background">

      {/* Submit congrats — full-screen moment */}
      {showCongrats && congrats && (
        <div className="absolute inset-0 z-[90] flex flex-col items-center justify-center bg-black/92 backdrop-blur-md">
          <Trophy className="h-28 w-28 text-amber-400 mb-8 drop-shadow-[0_0_40px_rgba(251,191,36,0.35)]" />
          <p className="text-[clamp(2rem,6vw,4rem)] font-black text-white text-center px-8 tracking-tight">
            {congrats.nickname}
          </p>
          <p className="text-[clamp(1.1rem,3vw,1.75rem)] font-bold text-emerald-400 mt-6 uppercase tracking-[0.25em]">
            Submitted — great work!
          </p>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="flex items-center gap-6 px-8 py-4 border-b border-white/5 bg-black/40 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute h-full w-full rounded-full bg-rose-400 opacity-60" />
            <span className="relative h-3 w-3 rounded-full bg-rose-400" />
          </div>
          <span className="text-[14px] font-black uppercase tracking-[0.35em] text-rose-400">Live</span>
        </div>

        <div className="h-6 w-px bg-white/10" />

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

        <div
          className={cn(
            "flex flex-col items-end gap-0.5 glass rounded-xl px-5 py-2 ring-1 shrink-0 min-w-[140px]",
            presenting ? "ring-violet-500/30" : "ring-primary/20",
          )}
        >
          {presenting && demoSlotClock != null ? (
            <>
              <span className="text-[9px] font-black uppercase tracking-widest text-violet-300/90">
                Demo slot (auto-next or admin Advance)
              </span>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-violet-400 shrink-0" />
                <span className="text-[36px] font-black font-mono tabular-nums text-violet-200 leading-none">
                  {demoSlotClock}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/75 text-right leading-snug max-w-[220px]">
                Mission build window still{" "}
                <span className="font-mono font-bold text-primary/85">{timer}</span> until challenge ends or finalize
              </p>
            </>
          ) : (
            <div className="flex items-center gap-3 py-0.5">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <span className="text-[36px] font-black font-mono tabular-nums text-primary leading-none">
                {timer}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      {presenting ? (
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-3 bg-violet-950/70 border-b border-violet-500/25">
            <div className="flex items-center gap-4 min-w-0">
              <span className="text-[11px] font-black uppercase tracking-[0.35em] text-violet-300 shrink-0">
                Live demo
              </span>
              <span className="text-[22px] font-black text-white truncate">{demo!.presenting!.nickname}</span>
              <span className="text-[12px] font-mono text-violet-400/80 shrink-0">
                {formatBuilderSeatLabel(demo!.presenting!.station_id ?? "")}
              </span>
            </div>
            {demo && demo.queue_length > 0 && (
              <span className="text-[11px] font-bold text-violet-200/80 uppercase tracking-widest shrink-0">
                Queue {Math.max(0, demo.cursor) + 1} / {demo.queue_length}
              </span>
            )}
          </div>
          <div className="flex flex-1 min-h-0">
            <iframe
              title="Langflow demo canvas"
              src={`${getLangflowUrl()}/?session_id=${demo!.presenting!.session_id}`}
              className="flex-1 min-w-0 border-0 bg-[#0f111c]"
            />
            <div className="hidden xl:flex w-[300px] shrink-0 flex-col border-l border-white/10 bg-black/30 p-2 min-h-0">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-1 pb-2">
                Flow map
              </p>
              <div className="flex-1 min-h-[120px] rounded-lg overflow-hidden ring-1 ring-white/10">
                <FlowPreviewCard
                  nodes={demo!.presenting!.flow_preview?.nodes ?? []}
                  edges={demo!.presenting!.flow_preview?.edges ?? []}
                  className="h-full min-h-[200px] rounded-none"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden border-r border-white/5">
            <MosaicDisplay emptyState={mosaicEmptyState} />
          </div>
          <div className="w-[360px] shrink-0 overflow-hidden bg-black/20">
            <TVLeaderboard />
          </div>
        </div>
      )}

      {/* ── Bottom context strip ── */}
      <div className="shrink-0 flex items-center gap-4 border-t border-white/5 bg-black/40 px-8 py-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full animate-pulse",
            presenting ? "bg-violet-400" : "bg-primary",
          )} />
          <span className="text-[12px] font-black uppercase tracking-[0.3em] text-primary">
            {presenting ? "Demo playback — full Langflow canvas" : "Now building — mosaic hides after submit"}
          </span>
        </div>
        <span className="text-white/15">·</span>
        <p className="text-[15px] font-semibold text-muted-foreground flex-1 truncate">
          {challenge.description}
        </p>
        {demo && demo.queue_length > 0 && !presenting && demo.gate_open && (
          <span className="text-[10px] font-bold text-amber-400/90 uppercase tracking-widest shrink-0">
            {demo.queue_length} in demo queue
          </span>
        )}
      </div>
    </div>
  )
}
