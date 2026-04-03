"use client"

import { useState, useEffect, useRef, useMemo, CSSProperties } from "react"
import type { Challenge } from "./tv-display"
import { getApiBase, skewedNow, applyServerTimeFromIso } from "@/lib/utils"
import { MAKERSPACE_GUIDE_VIDEO_PATH } from "@/lib/langflow-teach"

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemStatus {
  is_active: boolean
  mission_build_ends_at: string | null
  duration_minutes: number | null
  server_time: string | null
}

interface TickerEvent {
  id: string
  text: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  gold:      "#f0c040",
  goldDim:   "#c49a20",
  bgDeep:    "#0c0d14",
  bgSurface: "#10111a",
  border:    "#1e2030",
  textPrim:  "#f0eee6",
  textMuted: "#6a6a72",
  textDim:   "#3a3a42",
  green:     "#3ecf5a",
  mono:      "'IBM Plex Mono', monospace",
} as const

// Default slide durations: hook holds longer, others rotate quickly
const SLIDE_DURATIONS = [16_000, 8_000, 8_000, 8_000] // ms

const MAX_TICKER = 20

// ── Screen wake lock (keep display on while attract is active) ────────────────

function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return
    const wakeLock = (navigator as any)?.wakeLock
    if (!wakeLock?.request) return
    let sentinel: any = null
    let cancelled = false
    const request = async () => {
      try {
        sentinel = await wakeLock.request("screen")
        sentinel?.addEventListener?.("release", () => {
          if (cancelled) return
          setTimeout(() => { if (!cancelled) void request().catch(() => {}) }, 1_000)
        })
      } catch { /* browser policy — ignore silently */ }
    }
    void request()
    return () => {
      cancelled = true
      if (sentinel) void sentinel.release().catch(() => {})
    }
  }, [enabled])
}

// ── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(endsAt: string | null, totalMinutes: number | null) {
  const [secsLeft, setSecsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!endsAt) { setSecsLeft(null); return }
    const end = new Date(endsAt).getTime()
    const update = () => setSecsLeft(Math.max(0, Math.floor((end - skewedNow()) / 1000)))
    update()
    const id = setInterval(update, 1_000)
    return () => clearInterval(id)
  }, [endsAt])

  const totalSecs = totalMinutes != null ? totalMinutes * 60 : null
  const pct = (totalSecs && secsLeft != null)
    ? Math.round((secsLeft / totalSecs) * 100)
    : null

  return { secsLeft, pct }
}

// ── Shared sub-styles ─────────────────────────────────────────────────────────

const monoLabel: CSSProperties = {
  fontSize: 9, fontWeight: 600, letterSpacing: "0.16em",
  color: C.textMuted, textTransform: "uppercase",
  fontFamily: C.mono, marginBottom: 2,
}

const metaKey: CSSProperties = {
  fontSize: 9, letterSpacing: "0.12em", color: C.textMuted,
  textTransform: "uppercase", marginBottom: 3, fontFamily: C.mono,
}

const metaVal: CSSProperties = {
  fontSize: 14, fontWeight: 500, color: C.textPrim, fontFamily: C.mono,
}

// ── Slide 1 — Hook ────────────────────────────────────────────────────────────

function HookSlide() {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "48px 52px" }}>
      <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.0, letterSpacing: "-0.03em", color: C.textPrim, marginBottom: 16 }}>
        STUDENTS<br />ARE<br />
        <span style={{ color: C.gold }}>BUILDING AI</span><br />
        HERE.
      </div>
      <div style={{ fontSize: 18, fontWeight: 300, color: C.textMuted, lineHeight: 1.5, maxWidth: 480 }}>
        Come see them build intelligent agents — live.
      </div>
    </div>
  )
}

// ── Slide 2 — Active Mission (only rendered when a mission is live) ────────────

function MissionSlide({ challenge }: { challenge: Challenge }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "48px 52px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", color: C.gold, textTransform: "uppercase", marginBottom: 14, fontFamily: C.mono }}>
        Active Mission
      </div>
      <div style={{ fontSize: 40, fontWeight: 700, color: C.textPrim, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 8 }}>
        {challenge.title}
      </div>
      <div style={{ fontSize: 15, fontWeight: 300, color: C.textMuted, lineHeight: 1.5, marginBottom: 28, maxWidth: 440 }}>
        {challenge.description}
      </div>
      <div style={{ display: "flex", gap: 28, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        <div><div style={metaKey}>Level</div><div style={metaVal}>{challenge.complexity_level}</div></div>
        <div><div style={metaKey}>Duration</div><div style={metaVal}>{challenge.duration_minutes} min</div></div>
        {challenge.max_participants != null && (
          <div>
            <div style={metaKey}>Capacity</div>
            <div style={metaVal}>{challenge.registration_count ?? 0} / {challenge.max_participants}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Slide 3 — Features ────────────────────────────────────────────────────────

const FEATURES = [
  {
    name: "Drag & Drop",
    desc: "Connect components visually",
    svg: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, stroke: C.gold, fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as CSSProperties}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
  },
  {
    name: "Visual Logic",
    desc: "Wire prompts, tools, and steps on canvas",
    svg: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, stroke: C.gold, fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as CSSProperties}><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0-4h18"/></svg>,
  },
  {
    name: "No Code",
    desc: "Build without writing a line",
    svg: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, stroke: C.gold, fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as CSSProperties}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  },
  {
    name: "Live Agents",
    desc: "See them think in real time",
    svg: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, stroke: C.gold, fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as CSSProperties}><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  },
]

function FeaturesSlide() {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "48px 52px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", color: C.gold, textTransform: "uppercase", marginBottom: 14, fontFamily: C.mono }}>
        What You&apos;ll Use
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: C.textPrim, letterSpacing: "-0.02em", marginBottom: 6 }}>
        Drag. Drop. Deploy.
      </div>
      <div style={{ fontSize: 14, fontWeight: 300, color: C.textMuted, marginBottom: 28 }}>
        Full AI agents without writing a single line of code.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        {FEATURES.map(f => (
          <div key={f.name} style={{ background: "rgba(21,22,32,0.65)", backdropFilter: "blur(8px)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "20px 16px", textAlign: "center" }}>
            <div style={{ width: 36, height: 36, border: `1.5px solid ${C.gold}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              {f.svg}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrim, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{f.name}</div>
            <div style={{ fontSize: 11, fontWeight: 300, color: C.textMuted, lineHeight: 1.4 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Slide 4 — How to Join ─────────────────────────────────────────────────────

const JOIN_STEPS = [
  { num: "01", title: "Find a Laptop", desc: "Use any device in the room to get started" },
  { num: "02", title: "Register",      desc: "Enter your name to get a builder code" },
  { num: "03", title: "Open the Mission", desc: "Build your flow for the mission running in the room" },
  { num: "04", title: "Submit",        desc: "Hit submit before time runs out — your agent runs live" },
]

function JoinSlide() {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "48px 52px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", color: C.gold, textTransform: "uppercase", marginBottom: 14, fontFamily: C.mono }}>
        How to Participate
      </div>
      <div style={{ fontSize: 38, fontWeight: 800, color: C.textPrim, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
        JOIN THE<br /><span style={{ color: C.gold }}>MISSION</span>
      </div>
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 2 }}>
        {JOIN_STEPS.map(s => (
          <div key={s.num} style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 20px", background: "rgba(21,22,32,0.6)", backdropFilter: "blur(8px)", border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: C.gold, opacity: 0.4, minWidth: 48, fontFamily: C.mono }}>{s.num}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrim, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 2 }}>{s.title}</div>
              <div style={{ fontSize: 12, fontWeight: 300, color: C.textMuted }}>{s.desc}</div>
            </div>
            <span style={{ marginLeft: "auto", color: C.textDim, fontSize: 18 }}>→</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function TVAttract({ challenges }: { challenges: Challenge[] }) {
  useScreenWakeLock(true)

  // ── System status (countdown source + live pill) ───────────────────────────
  const [status, setStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/v1/aiccore/system/status`)
        if (res.ok && !cancelled) {
          const data: SystemStatus & { server_time: string } = await res.json()
          applyServerTimeFromIso(data.server_time)
          setStatus(data)
        }
      } catch { /* network error — ignore */ }
    }
    void poll()
    const id = setInterval(poll, 5_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // ── Countdown ──────────────────────────────────────────────────────────────
  const { secsLeft, pct } = useCountdown(
    status?.mission_build_ends_at ?? null,
    status?.duration_minutes ?? null,
  )
  const isUrgent = secsLeft != null && secsLeft < 300
  const countdownDisplay = secsLeft != null
    ? `${String(Math.floor(secsLeft / 60)).padStart(2, "0")}:${String(secsLeft % 60).padStart(2, "0")}`
    : "--:--"

  // ── Local clock ────────────────────────────────────────────────────────────
  const [clock, setClock] = useState("")
  useEffect(() => {
    const update = () => {
      const now = new Date()
      let h = now.getHours()
      const m = now.getMinutes()
      const ap = h >= 12 ? "PM" : "AM"
      h = h % 12 || 12
      setClock(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`)
    }
    update()
    const id = setInterval(update, 10_000)
    return () => clearInterval(id)
  }, [])

  // ── Derived challenge data ─────────────────────────────────────────────────
  const activeChallenge = useMemo(
    () => challenges.find(c => c.is_active) ?? null,
    [challenges],
  )

  const pastMissions = useMemo(
    () => challenges.filter(c => c.is_finalized === true).slice(-3).reverse(),
    [challenges],
  )

  // TODO: replace with a dedicated /api/v1/aiccore/stats endpoint for exact
  // cumulative counts. These are proxy values derived from the challenges list
  // and may over-count repeat participants across multiple missions.
  const stats = useMemo(() => {
    const missionsRun = challenges.filter(c => c.is_finalized === true).length
    const agentsBuilt = challenges
      .filter(c => c.is_finalized === true)
      .reduce((sum, c) => sum + (c.registration_count ?? 0), 0)
    const builders = challenges
      .reduce((sum, c) => sum + (c.registration_count ?? 0), 0)
    return { missionsRun, agentsBuilt, builders }
  }, [challenges])

  // ── Ticker events (long-poll) ──────────────────────────────────────────────
  const [tickerEvents, setTickerEvents] = useState<TickerEvent[]>([])
  const lastEventIdRef = useRef(0)

  useEffect(() => {
    let destroyed = false
    let backoffId: ReturnType<typeof setTimeout>

    const poll = async (): Promise<void> => {
      if (destroyed) return
      try {
        const url = `${getApiBase()}/api/v1/aiccore/events/poll?last_id=${lastEventIdRef.current}&timeout=15`
        const res = await fetch(url)
        if (!res.ok) throw new Error("poll failed")
        const data = await res.json()
        if (destroyed) return

        const events: any[] = data.events ?? []
        let newLastId = lastEventIdRef.current
        const newItems: TickerEvent[] = []

        for (const wrapper of events) {
          const msg = wrapper.data
          newLastId = Math.max(newLastId, wrapper.id)

          if (msg.event_type === "submitted") {
            const nick = msg.payload?.nickname ?? "A builder"
            newItems.push({ id: `e${wrapper.id}`, text: `${nick} submitted their agent` })
          } else if (msg.event_type === "flow_saved") {
            const nick = msg.payload?.nickname
            const station = msg.payload?.station_id ?? "?"
            newItems.push({
              id: `e${wrapper.id}`,
              text: nick ? `${nick} joined Station ${station}` : `New builder joined Station ${station}`,
            })
          } else if (msg.type === "MISSION_LIVE") {
            const title = msg.data?.title
            newItems.push({ id: `e${wrapper.id}`, text: title ? `New mission started: ${title}` : "New mission started" })
          } else if (msg.type === "MISSION_ENDED") {
            newItems.push({ id: `e${wrapper.id}`, text: "Mission ended — demos or results follow" })
          }
        }

        lastEventIdRef.current = newLastId
        if (newItems.length > 0) {
          setTickerEvents(prev => [...prev, ...newItems].slice(-MAX_TICKER))
        }

        void poll()
      } catch {
        if (!destroyed) backoffId = setTimeout(poll, 3_000)
      }
    }

    void poll()
    return () => { destroyed = true; clearTimeout(backoffId) }
  }, [])

  // ── Slides & rotation ──────────────────────────────────────────────────────
  const slides = useMemo(
    () => [
      <HookSlide key="hook" />,
      ...(activeChallenge ? [<MissionSlide key="mission" challenge={activeChallenge} />] : []),
      <FeaturesSlide key="features" />,
      <JoinSlide key="join" />,
    ],
    [activeChallenge],
  )

  const durations = useMemo(
    () => activeChallenge ? SLIDE_DURATIONS : [SLIDE_DURATIONS[0], SLIDE_DURATIONS[2], SLIDE_DURATIONS[3]],
    [activeChallenge],
  )

  const [currentSlide, setCurrentSlide] = useState(0)
  const [fillStyle, setFillStyle] = useState<CSSProperties>({ width: "0%", transition: "none" })

  // Reset to first slide when the number of slides changes (mission added/removed)
  const prevSlidesLenRef = useRef(slides.length)
  useEffect(() => {
    if (prevSlidesLenRef.current !== slides.length) {
      prevSlidesLenRef.current = slides.length
      setCurrentSlide(0)
    }
  }, [slides.length])

  // Advance slide + animate progress bar
  const slidesRef  = useRef(slides)
  const durationsRef = useRef(durations)
  useEffect(() => { slidesRef.current = slides },    [slides])
  useEffect(() => { durationsRef.current = durations }, [durations])

  useEffect(() => {
    const dur = durationsRef.current[currentSlide] ?? 8_000
    // Reset progress, then animate in next frame so the CSS transition fires
    setFillStyle({ width: "0%", transition: "none" })
    const rafId = requestAnimationFrame(() => {
      setFillStyle({ width: "100%", transition: `width ${dur / 1_000}s linear` })
    })
    const timerId = setTimeout(() => {
      setCurrentSlide(prev => (prev + 1) % slidesRef.current.length)
    }, dur)
    return () => { cancelAnimationFrame(rafId); clearTimeout(timerId) }
  }, [currentSlide])

  // ── Ticker content (defaults when no events yet) ───────────────────────────
  const DEFAULT_TICKER: TickerEvent[] = [
    { id: "d1", text: "New missions every week" },
    { id: "d2", text: "Register at any laptop in the room" },
    { id: "d3", text: "Build AI agents — no code required" },
    { id: "d4", text: "Submit before time runs out" },
  ]
  const tickerContent = tickerEvents.length > 0 ? tickerEvents : DEFAULT_TICKER

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes attractLivePulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes attractTickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      <div style={{
        display: "flex", flexDirection: "column",
        height: "100vh", width: "100vw", overflow: "hidden",
        background: C.bgDeep, color: C.textPrim,
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      }}>

        {/* ── TOP BAR ────────────────────────────────────────────────────── */}
        <div style={{
          background: C.bgSurface, borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center",
          padding: "0 20px", height: 44, gap: 14, flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: C.gold, fontFamily: C.mono }}>AICCORE</span>
          <span style={{ fontSize: 12, color: C.textDim, fontFamily: C.mono }}>/</span>
          <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", color: C.textMuted, fontFamily: C.mono }}>MAKERSPACE</span>
          <div style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }} />

          {/* Live pill — shown only when a mission is active */}
          {status?.is_active && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 4,
              background: "rgba(62,207,90,0.12)", border: "1px solid rgba(62,207,90,0.25)",
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: C.green, boxShadow: `0 0 6px ${C.green}`,
                animation: "attractLivePulse 1.6s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: C.green, textTransform: "uppercase", fontFamily: C.mono }}>
                Mission Live
              </span>
            </div>
          )}

          {/* Countdown + progress + clock */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 180 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: isUrgent ? "#e05050" : C.goldDim, minWidth: 50, letterSpacing: "0.04em", fontFamily: C.mono }}>
                {countdownDisplay}
              </span>
              <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: isUrgent ? "#e05050" : C.goldDim, borderRadius: 2, width: `${pct ?? 0}%`, transition: "width 1s linear" }} />
              </div>
            </div>
            <div style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>{clock}</span>
          </div>
        </div>

        {/* ── MAIN ───────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── LEFT: rotating slides ──────────────────────────────────── */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", background: C.bgDeep }}>
            {/* Ambient gradient overlay */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
              background: [
                "radial-gradient(ellipse 65% 55% at 10% 85%, rgba(25,80,110,0.3) 0%, transparent 55%)",
                "radial-gradient(ellipse 55% 45% at 90% 15%, rgba(80,45,110,0.22) 0%, transparent 55%)",
              ].join(", "),
            }} />

            {/* Slides viewport */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden", zIndex: 1 }}>
              {slides.map((slide, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute", inset: 0,
                    opacity: i === currentSlide ? 1 : 0,
                    transform: i === currentSlide ? "translateY(0)" : "translateY(18px)",
                    transition: "opacity 0.6s ease, transform 0.6s ease",
                    pointerEvents: i === currentSlide ? "auto" : "none",
                  }}
                >
                  {slide}
                </div>
              ))}
            </div>

            {/* Cadence line */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 52px", flexShrink: 0, position: "relative", zIndex: 1 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.gold, opacity: 0.5, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 11, letterSpacing: "0.06em", color: "#7a7a84", fontWeight: 500, fontFamily: C.mono }}>
                New mission every Friday
              </span>
            </div>

            {/* Slide progress bar */}
            <div style={{ height: 3, background: "rgba(255,255,255,0.04)", flexShrink: 0, position: "relative", zIndex: 1 }}>
              <div style={{ height: "100%", background: C.gold, borderRadius: 2, ...fillStyle }} />
            </div>
          </div>

          {/* ── RIGHT: persistent sidebar ──────────────────────────────── */}
          <div style={{ width: 520, background: C.bgSurface, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>

            {/* Stats strip */}
            <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
              {([
                { num: stats.missionsRun, label: "Missions Run", gold: true  },
                { num: stats.agentsBuilt, label: "Agents Built", gold: false },
                { num: stats.builders,    label: "Builders",     gold: false },
              ] as const).map((s, i, arr) => (
                <div key={s.label} style={{ flex: 1, padding: "14px 16px", borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : "none", textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.gold ? C.gold : C.textPrim, lineHeight: 1, marginBottom: 3, fontFamily: C.mono }}>
                    {s.num}
                  </div>
                  <div style={{ fontSize: 8, letterSpacing: "0.14em", color: C.textMuted, textTransform: "uppercase", fontWeight: 600, fontFamily: C.mono }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Video header */}
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={monoLabel}>Builder Walkthrough</div>
            </div>

            {/* Walkthrough video */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative", background: "#000" }}>
              <video
                src={MAKERSPACE_GUIDE_VIDEO_PATH}
                autoPlay
                loop
                muted
                playsInline
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>

            {/* Past Missions */}
            {pastMissions.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px" }}>
                <div style={{ ...monoLabel, marginBottom: 10 }}>Past Missions</div>
                {pastMissions.map((m, i) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < pastMissions.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                    <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.1em", padding: "3px 7px", borderRadius: 3, textTransform: "uppercase", background: "rgba(62,207,90,0.12)", color: C.green, border: "1px solid rgba(62,207,90,0.18)", whiteSpace: "nowrap", fontFamily: C.mono }}>
                      Done
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: "#9a9aa2" }}>{m.title}</span>
                    {m.start_time && (
                      <span style={{ fontSize: 11, color: C.textMuted, fontFamily: C.mono }}>
                        {new Date(m.start_time).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Register CTA */}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px", textAlign: "center", background: "rgba(240,192,64,0.03)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.gold, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4, fontFamily: C.mono }}>
                Register at a Laptop
              </div>
              <div style={{ fontSize: 11, color: "#8a8a94", fontWeight: 300 }}>
                Get your code and join the mission
              </div>
            </div>

          </div>
        </div>

        {/* ── TICKER ──────────────────────────────────────────────────────── */}
        <div style={{ background: "#111219", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", height: 38, overflow: "hidden", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: C.gold, textTransform: "uppercase", padding: "0 16px", borderRight: `1px solid ${C.border}`, height: "100%", display: "flex", alignItems: "center", whiteSpace: "nowrap", flexShrink: 0, fontFamily: C.mono }}>
            Feed
          </div>
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {/* Duplicate ticker content for seamless infinite scroll */}
            <div style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", animation: "attractTickerScroll 40s linear infinite" }}>
              {[...tickerContent, ...tickerContent].map((evt, i) => (
                <span key={`${evt.id}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 22, fontSize: 12, color: "#8a8a94", letterSpacing: "0.02em", padding: "0 22px", fontFamily: C.mono }}>
                  {evt.text}
                  <span style={{ display: "inline-block", width: 4, height: 4, background: C.gold, borderRadius: "50%", flexShrink: 0 }} />
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
