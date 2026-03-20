"use client"

import { useState, useEffect, useCallback } from "react"
import { Brain, Zap, Layers, Cpu, ArrowRight, Clock, Users, Rocket, CheckCircle2, Circle, Loader2, WifiOff, Wrench } from "lucide-react"
import { cn, getApiBase, skewedNow } from "@/lib/utils"
import type { Challenge } from "./tv-display"

const SLIDE_DURATION = 10_000  // ms each slide stays
const TRANSITION_MS  = 600     // fade duration

// ── Slide 1 — Hook ────────────────────────────────────────────────────────────

function HookSlide() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-16 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl scale-[2]" />
        <div
          className="relative h-24 w-24 rounded-3xl bg-primary/15 ring-2 ring-primary/40 flex items-center justify-center"
          style={{ animation: "tv-float 3s ease-in-out infinite" }}
        >
          <Brain className="h-12 w-12 text-primary" />
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
    { icon: Brain,  label: "Real AI",       desc: "Powered by LLMs like GPT-4"       },
    { icon: Zap,    label: "No Code",       desc: "Build without writing a line"      },
    { icon: Cpu,    label: "Live Agents",   desc: "See them think in real time"       },
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full gap-12 px-16 text-center">
      <div className="space-y-3">
        <span className="text-[14px] font-black uppercase tracking-[0.45em] text-primary">What Is This?</span>
        <h2 className="text-[68px] font-black uppercase tracking-tighter leading-none text-foreground">
          Langflow Arena
        </h2>
        <p className="text-[24px] text-muted-foreground font-medium max-w-3xl">
          A live challenge where students visually assemble AI systems — then watch them run.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-5 w-full max-w-4xl">
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
    { num: "01", label: "Walk to a station",  desc: "Find Station 1, 2, or 3 in the room"       },
    { num: "02", label: "Register",           desc: "Enter your name to get a builder code"      },
    { num: "03", label: "Build your AI",      desc: "Connect nodes to create an intelligent flow" },
    { num: "04", label: "Submit",             desc: "Hit submit before time runs out"             },
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-20">
      <div className="text-center space-y-2">
        <span className="text-[14px] font-black uppercase tracking-[0.45em] text-primary">How To Participate</span>
        <h2 className="text-[64px] font-black uppercase tracking-tighter leading-none text-foreground">
          Join the Challenge
        </h2>
      </div>

      <div className="w-full max-w-4xl space-y-4">
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
  const visible = challenges.filter(c => !c.is_active).slice(0, 4)

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
    <div className="flex flex-col items-center justify-center h-full gap-10 px-16">
      <div className="text-center space-y-2">
        <span className="text-[14px] font-black uppercase tracking-[0.45em] text-primary">Available Challenges</span>
        <h2 className="text-[60px] font-black uppercase tracking-tighter leading-none text-foreground">
          What Will You Build?
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-5 w-full max-w-5xl">
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

// ── Slide 5 — Coming Up Next / Tips ──────────────────────────────────────────

function NextSlide({ challenges }: { challenges: Challenge[] }) {
  const [now, setNow] = useState(skewedNow)
  const upcoming = challenges.find(c => c.is_registration_open && !c.is_active && c.start_time)

  useEffect(() => {
    const id = setInterval(() => setNow(skewedNow()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!upcoming || !upcoming.start_time) {
    const tips = [
      "Connect a Prompt → LLM → Output to build your first AI",
      "Use a Chat Input node to make your flow conversational",
      "Add a Text Splitter to process long documents with ease",
      "Combine multiple LLM calls for smarter, multi-step agents",
    ]
    return (
      <div className="flex flex-col items-center justify-center h-full gap-10 px-20 text-center">
        <div className="space-y-2">
          <span className="text-[14px] font-black uppercase tracking-[0.45em] text-primary">Builder Tips</span>
          <h2 className="text-[64px] font-black uppercase tracking-tighter leading-none text-foreground">
            Pro Moves
          </h2>
        </div>
        <div className="space-y-4 w-full max-w-4xl">
          {tips.map((tip, i) => (
            <div key={i} className="glass rounded-2xl px-8 py-5 ring-1 ring-white/5 flex items-center gap-5 text-left">
              <span className="text-[32px] font-black font-mono text-primary/30 w-10 shrink-0">{i + 1}</span>
              <p className="text-[22px] font-bold text-foreground">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const diffMs   = Math.max(0, new Date(upcoming.start_time).getTime() - now)
  const totalSec = Math.floor(diffMs / 1000)
  const mins     = Math.floor(totalSec / 60)
  const secs     = totalSec % 60

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-16 text-center">
      <div className="space-y-3">
        <span className="text-[14px] font-black uppercase tracking-[0.45em] text-primary">Coming Up Next</span>
        <h2 className="text-[68px] font-black uppercase tracking-tighter leading-none text-foreground">
          {upcoming.title}
        </h2>
        <p className="text-[22px] text-muted-foreground max-w-3xl mx-auto">{upcoming.description}</p>
      </div>

      <div className="glass rounded-3xl px-16 py-8 ring-1 ring-primary/30 glow-amber">
        <p className="text-[14px] font-black uppercase tracking-[0.4em] text-primary mb-3">Starts In</p>
        <p className="text-[96px] font-black font-mono text-foreground leading-none tabular-nums">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </p>
      </div>

      <p className="text-[18px] font-bold text-muted-foreground uppercase tracking-wider">
        Walk to a station to register
      </p>
    </div>
  )
}

// ── Slide N+5 — Per-challenge Spotlight ──────────────────────────────────────

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
    "Walk to any available station",
    "Enter your name to get a builder code",
    `Build your AI flow — you have ${challenge.duration_minutes} min`,
    "Hit Submit before the timer ends",
  ]

  return (
    <div className="flex flex-col justify-center h-full px-16 gap-8">

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
          {isOpen ? "Registration Open — Walk to a station now" : "Coming Soon"}
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

// ── Animated Langflow diagram (CSS-only, no video dependency) ────────────────

function AnimatedFlow() {
  const nodes = [
    { id: "input",    label: "Chat Input",   sub: "User question",      x: "10%",  y: "18%", color: "text-blue-400",    ring: "ring-blue-400/30",    bg: "bg-blue-400/10"    },
    { id: "prompt",   label: "Prompt",       sub: "System context",     x: "10%",  y: "52%", color: "text-violet-400", ring: "ring-violet-400/30", bg: "bg-violet-400/10" },
    { id: "llm",      label: "LLM",          sub: "GPT-4 / Claude",     x: "45%",  y: "35%", color: "text-primary",    ring: "ring-primary/40",    bg: "bg-primary/15"    },
    { id: "memory",   label: "Memory",       sub: "Conversation store",  x: "45%",  y: "68%", color: "text-cyan-400",   ring: "ring-cyan-400/30",   bg: "bg-cyan-400/10"   },
    { id: "output",   label: "Chat Output",  sub: "AI response",        x: "78%",  y: "45%", color: "text-emerald-400",ring: "ring-emerald-400/30",bg: "bg-emerald-400/10"},
  ]

  const edges = [
    { x1: "26%", y1: "27%", x2: "44%", y2: "40%", delay: "0s"   },
    { x1: "26%", y1: "58%", x2: "44%", y2: "44%", delay: "0.4s" },
    { x1: "64%", y1: "40%", x2: "78%", y2: "49%", delay: "0.8s" },
    { x1: "26%", y1: "58%", x2: "44%", y2: "72%", delay: "0.2s" },
    { x1: "64%", y1: "73%", x2: "78%", y2: "53%", delay: "1s"   },
  ]

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* SVG edges */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        {edges.map((e, i) => (
          <line
            key={i}
            x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="1.8s" begin={e.delay} repeatCount="indefinite" />
          </line>
        ))}
        {/* Animated dot travelling each edge */}
        {edges.map((e, i) => (
          <circle key={`dot-${i}`} r="3" fill="hsl(38 92% 52% / 0.8)">
            <animateMotion dur="2.4s" begin={e.delay} repeatCount="indefinite" path={`M ${e.x1} ${e.y1} L ${e.x2} ${e.y2}`} />
          </circle>
        ))}
      </svg>

      {/* Nodes */}
      {nodes.map((n, i) => (
        <div
          key={n.id}
          className={cn(
            "absolute flex flex-col gap-0.5 px-3 py-2 rounded-xl glass ring-1 shadow-lg",
            n.ring,
          )}
          style={{
            left: n.x,
            top: n.y,
            transform: "translate(-50%, -50%)",
            zIndex: 1,
            animation: `tv-float ${4 + i * 0.7}s ease-in-out infinite ${i * 0.5}s`,
          }}
        >
          <div className={cn("flex items-center gap-1.5")}>
            <div className={cn("h-2 w-2 rounded-full", n.bg, n.ring, "ring-1")} />
            <span className={cn("text-[11px] font-black uppercase tracking-wide", n.color)}>
              {n.label}
            </span>
          </div>
          <span className="text-[10px] text-white/35 pl-3.5">{n.sub}</span>
        </div>
      ))}

      {/* Centre glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-24 h-24 rounded-full bg-primary/8 blur-3xl" />
      </div>
    </div>
  )
}

// ── Station status row ────────────────────────────────────────────────────────

type StationState = "available" | "building" | "done" | "offline" | "maintenance"

function StationPill({ num, state }: { num: number; state: StationState }) {
  const config = {
    available:   { label: "Available",   icon: Circle,       color: "text-emerald-400", bg: "bg-emerald-400/10", ring: "ring-emerald-400/25" },
    building:    { label: "Building…",   icon: Loader2,      color: "text-amber-400",   bg: "bg-amber-400/10",   ring: "ring-amber-400/25"   },
    done:        { label: "Submitted",   icon: CheckCircle2, color: "text-blue-400",    bg: "bg-blue-400/10",    ring: "ring-blue-400/25"    },
    offline:     { label: "Offline",     icon: WifiOff,      color: "text-slate-400",   bg: "bg-slate-400/10",   ring: "ring-slate-400/25"   },
    maintenance: { label: "Maintenance", icon: Wrench,       color: "text-orange-400",  bg: "bg-orange-400/10",  ring: "ring-orange-400/25"  },
  }[state]
  const Icon = config.icon

  return (
    <div className={cn("flex-1 flex flex-col items-center gap-1.5 glass rounded-xl py-3 ring-1", config.ring)}>
      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", config.bg)}>
        <Icon className={cn("h-4 w-4", config.color, state === "building" && "animate-spin")} />
      </div>
      <p className="text-[13px] font-black text-white/80">Station {num}</p>
      <p className={cn("text-[10px] font-bold uppercase tracking-wider", config.color)}>{config.label}</p>
    </div>
  )
}

// ── Right Live Panel (replaces video) ────────────────────────────────────────

interface RealStation {
  id: string
  status: string
}

function stationStatusToState(status: string): StationState {
  if (status === "occupied") return "building"
  if (status === "maintenance") return "maintenance"
  if (status === "offline") return "offline"
  return "available"
}

function LivePanel({ challenges }: { challenges: Challenge[] }) {
  const upcoming = challenges.filter(c => !c.is_active).slice(0, 2)
  const totalRegistered = challenges.reduce((sum, c) => sum + (c.registration_count ?? 0), 0)

  const [stations, setStations] = useState<RealStation[]>([])

  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/v1/aiccore/stations`)
        if (res.ok) setStations(await res.json())
      } catch { /* ignore */ }
    }
    fetchStations()
    const id = setInterval(fetchStations, 10_000)
    return () => clearInterval(id)
  }, [])

  // Show up to 3 real stations; fall back to a placeholder if none registered yet
  const displayStations: { id: string; state: StationState }[] =
    stations.length > 0
      ? stations.slice(0, 3).map(s => ({ id: s.id, state: stationStatusToState(s.status) }))
      : [
          { id: "1", state: "available" },
          { id: "2", state: "available" },
          { id: "3", state: "available" },
        ]

  return (
    <div className="w-[36%] shrink-0 flex flex-col border-l border-white/8 bg-black/20 backdrop-blur-sm relative z-10">

      {/* ── Animated flow diagram (top ~40%) ── */}
      <div className="relative shrink-0" style={{ height: "40%" }}>
        <div className="absolute top-3 left-0 right-0 flex justify-center z-10">
          <span className="text-[10px] font-black uppercase tracking-[0.35em] text-white/25">
            Langflow in Action
          </span>
        </div>
        <AnimatedFlow />
        {/* Fade bottom edge into panel */}
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
      </div>

      {/* ── Stations ── */}
      <div className="px-5 pb-4 flex flex-col gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">Station Status</p>
        <div className="flex gap-3">
          {displayStations.map((s, i) => (
            <StationPill key={s.id} num={i + 1} state={s.state} />
          ))}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="flex items-center gap-3 px-5 pb-4">
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
        <div className="flex-1 flex flex-col gap-2.5 px-5 pb-4 overflow-hidden">
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
      <div className="mt-auto mx-5 mb-12 glass rounded-xl px-4 py-5 ring-1 ring-primary/25 text-center">
        <p className="text-[15px] font-black uppercase tracking-wider text-primary">Walk to a station</p>
        <p className="text-[12px] text-muted-foreground/55 mt-1">to register and join the challenge</p>
      </div>
    </div>
  )
}

// ── Scrolling Ticker ──────────────────────────────────────────────────────────

function MarqueeTicker({ challenges }: { challenges: Challenge[] }) {
  const items = [
    "Welcome to AICCORE Arena",
    `${challenges.length || "—"} challenge${challenges.length !== 1 ? "s" : ""} available today`,
    "Walk to any station to register and participate",
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
  // 5 fixed slides + one spotlight per challenge
  const spotlightChallenges = challenges.filter(c => !c.is_active)
  const TOTAL = 5 + spotlightChallenges.length

  const [current, setCurrent] = useState(0)
  const [opacity, setOpacity] = useState(1)

  const advance = useCallback(() => {
    setOpacity(0)
    setTimeout(() => {
      setCurrent(s => (s + 1) % TOTAL)
      setOpacity(1)
    }, TRANSITION_MS)
  }, [TOTAL])

  // Auto-advance timer — resets whenever current slide changes
  useEffect(() => {
    const id = setTimeout(advance, SLIDE_DURATION)
    return () => clearTimeout(id)
  }, [current, advance])

  const goTo = useCallback((i: number) => {
    setOpacity(0)
    setTimeout(() => { setCurrent(i); setOpacity(1) }, TRANSITION_MS)
  }, [])

  const slides = [
    <HookSlide       key="hook" />,
    <WhatSlide       key="what" />,
    <HowSlide        key="how" />,
    <ChallengesSlide key="challenges" challenges={challenges} />,
    <NextSlide       key="next"       challenges={challenges} />,
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

      {/* ── Left: slide area (68%) ── */}
      <div className="flex-1 relative flex flex-col overflow-hidden">

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
            <span className="text-[13px] font-black uppercase tracking-[0.3em] text-white/55">
              AICCORE Arena
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
          {slides[current]}
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
                  i === current ? "w-7 h-2 bg-primary" : "w-2 h-2 bg-white/20 hover:bg-white/40",
                )}
              />
            ))}
          </div>
          <div className="w-48 h-0.5 bg-white/10 rounded-full overflow-hidden">
            <div
              key={current}
              className="h-full bg-primary/60 rounded-full origin-left"
              style={{ animation: `tv-progress-fill ${SLIDE_DURATION}ms linear forwards` }}
            />
          </div>
        </div>
      </div>

      {/* ── Right: live panel (flow diagram + stations + info) ── */}
      <LivePanel challenges={challenges} />

      {/* ── Full-width ticker — floats above both columns ── */}
      <MarqueeTicker challenges={challenges} />
    </div>
  )
}
