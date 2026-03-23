"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  Puzzle,
  Zap,
  Layers,
  Cpu,
  ArrowRight,
  Clock,
  Users,
  Rocket,
  PlayCircle,
} from "lucide-react"
import { cn, skewedNow } from "@/lib/utils"
import { MAKERSPACE_GUIDE_VIDEO_PATH } from "@/lib/langflow-teach"
import { AiccoreLogo, AICCORE_MAKERSPACE } from "@/components/arena/aiccore-logo"
import type { Challenge } from "./tv-display"

const SLIDE_DURATION = 10_000  // ms each slide stays (default)
const TRANSITION_MS  = 600     // fade duration

/** Matches catalog “open” missions — avoids showing closed/finalized rows as “Coming Up” on the TV. */
function isPromotableOnAttract(c: Challenge): boolean {
  if (c.is_active) return false
  if (c.is_finalized === true) return false
  return c.is_registration_open === true
}

// ── Slide 1 — Hook ────────────────────────────────────────────────────────────

function HookSlide() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-10 md:px-14 text-center max-w-[min(96vw,1400px)] mx-auto w-full">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl scale-[2]" />
        <div
          className="relative h-24 w-24 rounded-3xl bg-primary/15 ring-2 ring-primary/40 flex items-center justify-center overflow-hidden"
          style={{ animation: "tv-float 3s ease-in-out infinite" }}
        >
          <AiccoreLogo size={72} className="rounded-2xl shadow-lg shadow-black/20 ring-1 ring-white/15" />
        </div>
      </div>

      <div className="space-y-5">
        <h1 className="text-[88px] font-black uppercase tracking-tighter leading-[0.85] text-foreground">
          Students are<br />
          <span className="text-primary">building AI</span><br />
          here.
        </h1>
        <p className="text-[28px] font-bold text-muted-foreground">
          Watch them create intelligent agents — live.
        </p>
      </div>
    </div>
  )
}

// ── Slide 2 — What Is This ────────────────────────────────────────────────────

function WhatSlide() {
  const features = [
    { icon: Layers, label: "Drag & Drop",  desc: "Connect components visually"      },
    { icon: Puzzle, label: "Visual logic", desc: "Wire prompts, tools, and steps on the canvas — full agents without a single script" },
    { icon: Zap,    label: "No Code",       desc: "Build without writing a line"      },
    { icon: Cpu,    label: "Live Agents",   desc: "See them think in real time"       },
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full gap-12 px-10 md:px-14 text-center max-w-[min(96vw,1500px)] mx-auto w-full">
      <div className="space-y-3">
        <span className="text-[14px] font-black uppercase tracking-[0.45em] text-primary">What Is This?</span>
        <h2 className="text-[68px] font-black uppercase tracking-tighter leading-none text-foreground">
          {AICCORE_MAKERSPACE}
        </h2>
        <p className="text-[24px] text-muted-foreground font-medium max-w-3xl">
          A live challenge where students visually assemble AI systems — then watch them run.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-5 w-full max-w-6xl">
        {features.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="glass rounded-2xl p-6 flex flex-col items-center gap-3 ring-1 ring-white/5">
            <div className="h-14 w-14 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
              <Icon className="h-7 w-7 text-primary" />
            </div>
            <p className="text-[18px] font-black uppercase tracking-wide text-foreground">{label}</p>
            <p className="text-[13px] text-muted-foreground text-center">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Slide 3 — How To Join ─────────────────────────────────────────────────────

function HowSlide() {
  const steps = [
    { num: "01", label: "Join the makerspace", desc: "Use a laptop or tablet in the room to get started" },
    { num: "02", label: "Register",           desc: "Enter your name to get a builder code"      },
    { num: "03", label: "Current challenge",  desc: "Build your flow for the mission running in the room" },
    { num: "04", label: "Submit",             desc: "Hit submit before time runs out"             },
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-10 md:px-16 max-w-[min(96vw,1200px)] mx-auto w-full">
      <div className="text-center space-y-2">
        <span className="text-[14px] font-black uppercase tracking-[0.45em] text-primary">How To Participate</span>
        <h2 className="text-[64px] font-black uppercase tracking-tighter leading-none text-foreground">
          Join the Challenge
        </h2>
      </div>

      <div className="w-full max-w-5xl space-y-4">
        {steps.map((step, i) => (
          <div key={step.num} className="flex items-center gap-6 glass rounded-2xl px-8 py-5 ring-1 ring-white/5">
            <span className="text-[42px] font-black font-mono text-primary/30 w-16 shrink-0">{step.num}</span>
            <div className="flex-1">
              <p className="text-[26px] font-black uppercase tracking-tight text-foreground">{step.label}</p>
              <p className="text-[16px] text-muted-foreground">{step.desc}</p>
            </div>
            {i < steps.length - 1 && <ArrowRight className="h-6 w-6 text-muted-foreground/25 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Slide 4 — Available Challenges ────────────────────────────────────────────

function ChallengesSlide({ challenges }: { challenges: Challenge[] }) {
  const visible = challenges.filter(isPromotableOnAttract).slice(0, 4)

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
        <Rocket className="h-16 w-16 text-primary/20 animate-bounce-slow" />
        <p className="text-[28px] font-bold text-muted-foreground uppercase tracking-widest">
          Stay tuned for upcoming challenges
        </p>
      </div>
    )
  }

  const complexityBadge = (level: string) =>
    level === "Beginner"     ? "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20" :
    level === "Intermediate" ? "text-amber-400  bg-amber-400/10  ring-amber-400/20"  :
                               "text-rose-400   bg-rose-400/10   ring-rose-400/20"

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-10 md:px-14 max-w-[min(96vw,1500px)] mx-auto w-full">
      <div className="text-center space-y-2">
        <span className="text-[14px] font-black uppercase tracking-[0.45em] text-primary">Available Challenges</span>
        <h2 className="text-[60px] font-black uppercase tracking-tighter leading-none text-foreground">
          What Will You Build?
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-5 w-full max-w-7xl">
        {visible.map(c => (
          <div key={c.id} className="glass rounded-2xl p-7 ring-1 ring-white/5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-[24px] font-black uppercase tracking-tight text-foreground leading-tight">
                {c.title}
              </h3>
              <span className={cn(
                "shrink-0 text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full ring-1",
                complexityBadge(c.complexity_level),
              )}>
                {c.complexity_level}
              </span>
            </div>
            <p className="text-[15px] text-muted-foreground line-clamp-2 leading-relaxed">
              {c.description}
            </p>
            <div className="flex items-center gap-5 pt-1">
              {c.start_time && (
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  {new Date(c.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
              {c.max_participants != null && (
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  {c.registration_count ?? 0}/{c.max_participants} registered
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Next promotable challenge with a future start time (for countdown slide). */
function useUpcomingAttractChallenge(challenges: Challenge[]): Challenge | undefined {
  const [now, setNow] = useState(skewedNow)
  useEffect(() => {
    const id = setInterval(() => setNow(skewedNow()), 1000)
    return () => clearInterval(id)
  }, [])
  return useMemo(
    () =>
      challenges.find(
        c =>
          isPromotableOnAttract(c) &&
          Boolean(c.start_time) &&
          new Date(c.start_time!).getTime() > now,
      ),
    [challenges, now],
  )
}

// ── Coming Up Next (only when a future challenge exists; no tips fallback) ───

function NextSlide({ challenge }: { challenge: Challenge }) {
  const [now, setNow] = useState(skewedNow)
  useEffect(() => {
    const id = setInterval(() => setNow(skewedNow()), 1000)
    return () => clearInterval(id)
  }, [])

  const start = challenge.start_time!
  const diffMs = Math.max(0, new Date(start).getTime() - now)
  const totalSec = Math.floor(diffMs / 1000)
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-16 text-center">
      <div className="space-y-3">
        <span className="text-[14px] font-black uppercase tracking-[0.45em] text-primary">Coming Up Next</span>
        <h2 className="text-[68px] font-black uppercase tracking-tighter leading-none text-foreground">
          {challenge.title}
        </h2>
        <p className="text-[22px] text-muted-foreground max-w-3xl mx-auto">{challenge.description}</p>
      </div>

      <div className="glass rounded-3xl px-16 py-8 ring-1 ring-primary/30 glow-amber">
        <p className="text-[14px] font-black uppercase tracking-[0.4em] text-primary mb-3">Starts In</p>
        <p className="text-[96px] font-black font-mono text-foreground leading-none tabular-nums">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </p>
      </div>

      <p className="text-[18px] font-bold text-muted-foreground uppercase tracking-wider">
        Register at a laptop before the challenge starts
      </p>
    </div>
  )
}

// ── Makerspace guide — right-column video only (not in carousel) ─

const GUIDE_VIDEO_VOLUME = 0.88

/** Local clip: loops continuously, fixed level; click anywhere once if the browser blocks autoplay-with-sound. */
function MakerspaceGuideSidebarEmbed() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    el.volume = GUIDE_VIDEO_VOLUME
    el.defaultMuted = false
    el.muted = false
    el.loop = true

    const onEnded = () => {
      el.currentTime = 0
      void el.play().catch(() => {})
    }
    el.addEventListener("ended", onEnded)

    const tryPlay = () => {
      void el.play().catch(() => {
        /* autoplay policy — first user gesture retries below */
      })
    }

    tryPlay()
    if (el.readyState < 2) {
      el.addEventListener("canplay", tryPlay, { once: true })
    }

    const onFirstPointer = () => {
      el.muted = false
      el.volume = GUIDE_VIDEO_VOLUME
      void el.play().catch(() => {})
    }
    window.addEventListener("pointerdown", onFirstPointer, { once: true })

    return () => {
      el.removeEventListener("ended", onEnded)
      el.removeEventListener("canplay", tryPlay)
      window.removeEventListener("pointerdown", onFirstPointer)
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 space-y-1 text-center px-1">
        <span className="text-[11px] font-black uppercase tracking-[0.32em] text-primary flex items-center justify-center gap-2">
          <PlayCircle className="h-3.5 w-3.5 shrink-0" />
          AI makerspace guide
        </span>
        <h2 className="text-[22px] font-black uppercase tracking-tight leading-tight text-foreground">
          The floor, in one reel
        </h2>
        <p className="text-[12px] text-muted-foreground font-medium leading-snug">
          A full walkthrough of the builder — loops continuously while this screen is up.
        </p>
      </div>

      <div className="relative min-h-[min(52vh,560px)] flex-1 w-full rounded-2xl overflow-hidden ring-2 ring-primary/30 shadow-[0_0_48px_-10px_rgba(250,204,21,0.4)] bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full min-h-[280px] object-contain bg-black"
          src={MAKERSPACE_GUIDE_VIDEO_PATH}
          playsInline
          loop
          preload="auto"
          autoPlay
          controls={false}
        />
      </div>

      <p className="shrink-0 text-[10px] text-white/35 font-semibold uppercase tracking-wider text-center">
        Sound at {Math.round(GUIDE_VIDEO_VOLUME * 100)}% — tap the screen once if playback is silent (browser autoplay rules).
      </p>
    </div>
  )
}

// ── Slide N+10 — Per-challenge Spotlight ──────────────────────────────────────

function ChallengeSpotlightSlide({ challenge, index, total }: {
  challenge: Challenge
  index: number
  total: number
}) {
  const isOpen = challenge.is_registration_open && !challenge.is_active

  const complexity = challenge.complexity_level
  const accent =
    complexity === "Beginner"     ? { text: "text-emerald-400", bg: "bg-emerald-400/10", ring: "ring-emerald-400/30", glow: "rgba(52,211,153,0.12)" } :
    complexity === "Intermediate" ? { text: "text-amber-400",   bg: "bg-amber-400/10",   ring: "ring-amber-400/30",   glow: "rgba(251,191,36,0.12)"  } :
                                    { text: "text-rose-400",    bg: "bg-rose-400/10",    ring: "ring-rose-400/30",    glow: "rgba(248,113,113,0.12)" }

  const steps = [
    "Open registration on a laptop in the room",
    "Enter your name to get a builder code",
    `Current challenge — ${challenge.duration_minutes} min to build`,
    "Hit Submit before the timer ends",
  ]

  return (
    <div className="flex flex-col justify-center h-full px-10 md:px-14 gap-8 max-w-[min(96vw,1500px)] mx-auto w-full">

      {/* Top meta row */}
      <div className="flex items-center gap-4">
        <span className="text-[12px] font-black uppercase tracking-[0.4em] text-white/30">
          Challenge {index + 1} of {total}
        </span>
        <span className="text-white/15">·</span>
        <span className={cn(
          "text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full ring-1",
          accent.text, accent.bg, accent.ring,
        )}>
          {complexity}
        </span>
        {challenge.duration_minutes && (
          <>
            <span className="text-white/15">·</span>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-white/30" />
              <span className="text-[12px] font-bold text-white/40">
                {challenge.duration_minutes} min
              </span>
            </div>
          </>
        )}
        {challenge.max_participants != null && (
          <>
            <span className="text-white/15">·</span>
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-white/30" />
              <span className="text-[12px] font-bold text-white/40">
                {challenge.registration_count ?? 0}/{challenge.max_participants} registered
              </span>
            </div>
          </>
        )}
      </div>

      {/* Hero title + glow */}
      <div className="relative">
        <div
          className="absolute -inset-6 rounded-3xl blur-3xl pointer-events-none"
          style={{ background: accent.glow }}
        />
        <h2
          className={cn(
            "relative text-[72px] font-black uppercase tracking-tighter leading-[0.88]",
            accent.text,
          )}
        >
          {challenge.title}
        </h2>
      </div>

      {/* Description */}
      <p className="text-[22px] text-white/65 leading-relaxed max-w-3xl">
        {challenge.description}
      </p>

      {(challenge.instructions_text?.trim() ||
        challenge.instructions_document_url ||
        challenge.starter_assets_url) && (
        <div className="flex flex-col gap-3 max-w-4xl">
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/25">
            Challenge instructions
          </p>
          {challenge.instructions_text?.trim() && (
            <p className="text-[17px] text-white/55 leading-relaxed line-clamp-6 whitespace-pre-wrap">
              {challenge.instructions_text.trim()}
            </p>
          )}
          {(challenge.instructions_document_url || challenge.starter_assets_url) && (
            <p className="text-[14px] font-bold text-primary/90">
              Full brief: open the PDF/DOC from the challenge link —{" "}
              <span className="text-white/45 font-mono text-[12px] break-all">
                {(challenge.instructions_document_url || challenge.starter_assets_url)!.replace(/^https?:\/\//, "")}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-white/8 w-full" />

      {/* How to participate */}
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/25">
          How to Participate
        </p>
        <div className="grid grid-cols-4 gap-4">
          {steps.map((step, i) => (
            <div
              key={i}
              className={cn("glass rounded-xl px-4 py-4 ring-1 ring-white/6 flex flex-col gap-2")}
            >
              <span className={cn("text-[28px] font-black font-mono", accent.text, "opacity-40")}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[14px] font-bold text-white/70 leading-snug">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Registration status badge */}
      <div className={cn(
        "self-start flex items-center gap-2.5 px-5 py-2.5 rounded-full ring-1",
        isOpen
          ? "bg-emerald-400/10 ring-emerald-400/30"
          : "bg-white/5 ring-white/10",
      )}>
        <div className={cn(
          "h-2 w-2 rounded-full",
          isOpen ? "bg-emerald-400 animate-pulse" : "bg-white/25",
        )} />
        <span className={cn(
          "text-[12px] font-black uppercase tracking-wider",
          isOpen ? "text-emerald-400" : "text-white/35",
        )}>
          {isOpen ? "Registration Open — join at a laptop now" : "Coming Soon"}
        </span>
      </div>
    </div>
  )
}

// ── Animated Mesh Background ─────────────────────────────────────────────────

function MeshBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base radial gradient — lifts the centre off pure black */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 35% 50%, rgba(245,158,11,0.07) 0%, transparent 70%), " +
            "radial-gradient(ellipse 60% 80% at 80% 20%, rgba(59,130,246,0.06) 0%, transparent 70%)",
        }}
      />
      {/* Orb 1 — amber, top-right — bright */}
      <div
        className="absolute -top-32 -right-32 w-[800px] h-[800px] rounded-full bg-primary/30 blur-[160px]"
        style={{ animation: "tv-float 9s ease-in-out infinite" }}
      />
      {/* Orb 2 — vivid blue, centre-left */}
      <div
        className="absolute top-1/4 -left-48 w-[650px] h-[650px] rounded-full bg-blue-500/22 blur-[130px]"
        style={{ animation: "tv-float 13s ease-in-out infinite reverse" }}
      />
      {/* Orb 3 — amber, bottom-centre */}
      <div
        className="absolute -bottom-32 left-1/3 w-[550px] h-[550px] rounded-full bg-primary/18 blur-[110px]"
        style={{ animation: "tv-float 11s ease-in-out infinite 3s" }}
      />
      {/* Orb 4 — teal accent, bottom-right */}
      <div
        className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-cyan-500/10 blur-[100px]"
        style={{ animation: "tv-float 15s ease-in-out infinite 1s" }}
      />
      {/* Dot grid */}
      <div className="absolute inset-0 bg-dot-grid opacity-25" />
    </div>
  )
}

// ── Right rail: always-on makerspace guide video + stats ──────────────────────

function LivePanel({ challenges }: { challenges: Challenge[] }) {
  const upcoming = challenges.filter(isPromotableOnAttract).slice(0, 2)
  const totalRegistered = challenges.reduce((sum, c) => sum + (c.registration_count ?? 0), 0)

  return (
    <div className="w-[min(46vw,760px)] min-w-[300px] shrink-0 flex flex-col border-l border-white/8 bg-black/20 backdrop-blur-sm relative z-10 min-h-0">

      {/* ── YouTube tutorial (primary — former “How a flow connects” area) ── */}
      <div className="flex-1 min-h-0 flex flex-col px-4 pt-5 pb-2">
        <MakerspaceGuideSidebarEmbed />
      </div>

      {/* ── Stats ── */}
      <div className="shrink-0 flex items-center gap-3 px-5 pb-3">
        <div className="flex-1 glass rounded-xl px-3 py-3 text-center ring-1 ring-white/8">
          <p className="text-[28px] font-black text-primary">{challenges.length}</p>
          <p className="text-[10px] font-bold text-muted-foreground/55 uppercase tracking-wider">Challenges</p>
        </div>
        <div className="flex-1 glass rounded-xl px-3 py-3 text-center ring-1 ring-white/8">
          <p className="text-[28px] font-black text-emerald-400">{totalRegistered}</p>
          <p className="text-[10px] font-bold text-muted-foreground/55 uppercase tracking-wider">Registered</p>
        </div>
      </div>

      {/* ── Upcoming challenges ── */}
      {upcoming.length > 0 && (
        <div className="shrink-0 flex flex-col gap-2.5 px-5 pb-3 overflow-hidden">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">Coming Up</p>
          {upcoming.map(c => (
            <div key={c.id} className="glass rounded-xl px-4 py-3.5 ring-1 ring-white/8 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ring-1",
                  c.complexity_level === "Beginner"     ? "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20" :
                  c.complexity_level === "Intermediate" ? "text-amber-400  bg-amber-400/10  ring-amber-400/20"  :
                                                          "text-rose-400   bg-rose-400/10   ring-rose-400/20",
                )}>
                  {c.complexity_level}
                </span>
                {c.registration_count != null && (
                  <span className="text-[11px] font-mono text-muted-foreground/45">
                    {c.registration_count}/{c.max_participants}
                  </span>
                )}
              </div>
              <p className="text-[14px] font-black uppercase tracking-tight text-foreground leading-tight line-clamp-2">
                {c.title}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── CTA ── */}
      <div className="shrink-0 mt-auto mx-5 mb-12 glass rounded-xl px-4 py-4 ring-1 ring-primary/25 text-center">
        <p className="text-[15px] font-black uppercase tracking-wider text-primary">Register at a laptop</p>
        <p className="text-[12px] text-muted-foreground/55 mt-1">Get your code and join the challenge</p>
      </div>
    </div>
  )
}

// ── Scrolling Ticker ──────────────────────────────────────────────────────────

function MarqueeTicker({ challenges }: { challenges: Challenge[] }) {
  const items = [
    `Welcome to ${AICCORE_MAKERSPACE}`,
    `${challenges.length || "—"} challenge${challenges.length !== 1 ? "s" : ""} available today`,
    "Visit a laptop in the room to register and participate",
    "Build intelligent AI flows with Langflow — no coding needed",
    "Each student designs and runs a real AI agent live",
    ...challenges.map(c => `Challenge: ${c.title}`),
  ]
  const text = items.join("     •     ")
  // Duplicate text so the scroll loops seamlessly
  const doubled = `${text}     •     ${text}`

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 h-9 flex items-center overflow-hidden border-t border-white/6 bg-black/60 backdrop-blur-sm">
      {/* Amber left accent */}
      <div className="shrink-0 flex items-center gap-2 px-4 border-r border-white/10 h-full bg-primary/10">
        <div
          className="h-2 w-2 rounded-full bg-primary"
          style={{ animation: "tv-live-pulse 1.2s ease-in-out infinite" }}
        />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary whitespace-nowrap">
          Live
        </span>
      </div>
      {/* Scrolling text */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="flex whitespace-nowrap text-[13px] font-semibold text-white/50 tracking-wide"
          style={{ animation: `tv-ticker-scroll ${Math.max(40, items.length * 8)}s linear infinite` }}
        >
          <span className="pr-8">{doubled}</span>
        </div>
      </div>
    </div>
  )
}

// ── Live Clock (corner) ───────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState("")
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <>{time}</>
}

// ── Main Attract Component ────────────────────────────────────────────────────

export function TVAttract({ challenges }: { challenges: Challenge[] }) {
  // 4 core slides + optional "Coming Up Next" + one spotlight per promotable challenge (guide video is fixed in the right rail)
  const spotlightChallenges = challenges.filter(isPromotableOnAttract)
  const upcoming = useUpcomingAttractChallenge(challenges)
  const showNextSlide = Boolean(upcoming?.start_time)
  const TOTAL = 4 + (showNextSlide ? 1 : 0) + spotlightChallenges.length
  const slideDurationsMs = useMemo(() => {
    const base = [
      SLIDE_DURATION,
      SLIDE_DURATION,
      SLIDE_DURATION,
      SLIDE_DURATION,
    ]
    const next = showNextSlide ? [SLIDE_DURATION] : []
    const spots = spotlightChallenges.map(() => SLIDE_DURATION)
    return [...base, ...next, ...spots]
  }, [showNextSlide, spotlightChallenges.length])

  const [current, setCurrent] = useState(0)
  const [opacity, setOpacity] = useState(1)
  const safeCurrent = TOTAL > 0 ? Math.min(current, TOTAL - 1) : 0
  const dwellMs = slideDurationsMs[safeCurrent] ?? SLIDE_DURATION

  const advance = useCallback(() => {
    setOpacity(0)
    setTimeout(() => {
      setCurrent(s => {
        const from = TOTAL > 0 ? Math.min(s, TOTAL - 1) : 0
        return (from + 1) % TOTAL
      })
      setOpacity(1)
    }, TRANSITION_MS)
  }, [TOTAL])

  // Auto-advance timer — per-slide dwell (video segments longer than static slides)
  useEffect(() => {
    const id = setTimeout(advance, dwellMs)
    return () => clearTimeout(id)
  }, [current, advance, dwellMs])

  const goTo = useCallback(
    (i: number) => {
      setOpacity(0)
      setTimeout(() => {
        setCurrent(TOTAL > 0 ? Math.min(Math.max(i, 0), TOTAL - 1) : 0)
        setOpacity(1)
      }, TRANSITION_MS)
    },
    [TOTAL],
  )

  const slides = [
    <HookSlide       key="hook" />,
    <WhatSlide       key="what" />,
    <HowSlide        key="how" />,
    <ChallengesSlide key="challenges" challenges={challenges} />,
    ...(showNextSlide && upcoming ? [<NextSlide key="next" challenge={upcoming} />] : []),
    // One dedicated spotlight per challenge
    ...spotlightChallenges.map((c, i) => (
      <ChallengeSpotlightSlide
        key={`spotlight-${c.id}`}
        challenge={c}
        index={i}
        total={spotlightChallenges.length}
      />
    )),
  ]

  return (
    <div
      className="relative h-screen w-screen overflow-hidden flex"
      style={{ background: "radial-gradient(ellipse at 40% 50%, #1a1208 0%, #0d0d0f 60%, #080808 100%)" }}
    >
      {/* Animated mesh — full canvas behind everything */}
      <MeshBackground />

      {/* ── Left: full-height carousel (complements fixed YouTube on the right) ── */}
      <div className="flex-1 min-w-0 relative flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-8 pt-5">
          {/* Brand + LIVE badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 ring-1 ring-red-500/40">
              <div
                className="h-1.5 w-1.5 rounded-full bg-red-400"
                style={{ animation: "tv-live-pulse 1.2s ease-in-out infinite" }}
              />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">Live</span>
            </div>
            <span className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-white/70">
              <AiccoreLogo size={22} forDarkBackground className="rounded-md ring-1 ring-white/15" />
              {AICCORE_MAKERSPACE}
            </span>
          </div>
          {/* Clock */}
          <span className="text-[20px] font-mono font-bold text-white/40 tabular-nums">
            <LiveClock />
          </span>
        </div>

        {/* Slide content — fades between slides */}
        <div
          className="relative z-10 flex-1"
          style={{ opacity, transition: `opacity ${TRANSITION_MS}ms ease` }}
        >
          {slides[safeCurrent]}
        </div>

        {/* Progress dots + bar — leave room for ticker at bottom */}
        <div className="relative z-20 flex flex-col items-center gap-3 pb-12">
          <div className="flex items-center gap-2.5">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  "rounded-full transition-all duration-300",
                  i === safeCurrent ? "w-7 h-2 bg-primary" : "w-2 h-2 bg-white/20 hover:bg-white/40",
                )}
              />
            ))}
          </div>
          <div className="w-48 h-0.5 bg-white/10 rounded-full overflow-hidden">
            <div
              key={safeCurrent}
              className="h-full bg-primary/60 rounded-full origin-left"
              style={{ animation: `tv-progress-fill ${dwellMs}ms linear forwards` }}
            />
          </div>
        </div>
      </div>

      {/* ── Right: live panel (flow diagram + stats + info) ── */}
      <LivePanel challenges={challenges} />

      {/* ── Full-width ticker — floats above both columns ── */}
      <MarqueeTicker challenges={challenges} />
    </div>
  )
}
