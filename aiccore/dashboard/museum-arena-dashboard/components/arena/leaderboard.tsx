"use client"

import { useState, useEffect } from "react"
import {
  Monitor,
  Cpu,
  FlaskConical,
  Rocket,
  Crown,
  TrendingUp,
  Clock,
  UserCheck,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn, getApiBase } from "@/lib/utils"

type StudentStatus = "REGISTERED" | "PARTICIPATING" | "SUBMITTED"

interface Student {
  id: string
  nickname: string
  station: string
  status: StudentStatus
  score: number
  is_winner: boolean
  mission?: string
}

const statusConfig: Record<StudentStatus, {
  color: string
  bgColor: string
  ringColor: string
  label: string
  icon: typeof Monitor
}> = {
  REGISTERED: {
    color: "text-sky-400",
    bgColor: "bg-sky-400/10",
    ringColor: "ring-sky-400/20",
    label: "REGISTERED",
    icon: UserCheck,
  },
  PARTICIPATING: {
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
    ringColor: "ring-amber-400/20",
    label: "LIVE BUILDING",
    icon: Zap,
  },
  SUBMITTED: {
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
    ringColor: "ring-emerald-400/20",
    label: "SUBMITTED",
    icon: Rocket,
  },
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/15 ring-1 ring-amber-400/30">
        <Crown className="h-4 w-4 text-amber-400" />
      </div>
    )
  }
  if (rank <= 3) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
        <span className="text-sm font-bold text-primary">{rank}</span>
      </div>
    )
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary ring-1 ring-border">
      <span className="text-sm font-medium text-muted-foreground">{rank}</span>
    </div>
  )
}

export function Leaderboard({
  onDataUpdate,
  refreshKey
}: {
  onDataUpdate?: (count: number) => void;
  refreshKey?: number;
}) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  const [isFinalized, setIsFinalized] = useState(false)

  const fetchLeaderboard = async () => {
    try {
      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/aiccore/leaderboard`)
      const data = await response.json()
      setStudents(data)
      if (onDataUpdate) {
        onDataUpdate(data.length)
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 5000)

    const apiBase = getApiBase()
    const wsUrl = apiBase.replace(/^http/, "ws") + "/api/v1/aiccore/ws";
    const ws = new WebSocket(wsUrl)
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === "SYSTEM_FINALIZE") {
          setIsFinalized(true)
          setTimeout(() => setIsFinalized(false), 20000)
        }
      } catch (e) { }
    }

    return () => {
      clearInterval(interval)
      ws.close()
    }
  }, [])

  useEffect(() => {
    if (refreshKey !== undefined) {
      fetchLeaderboard()
    }
  }, [refreshKey])

  const participatingCount = students.filter(s => s.status === "PARTICIPATING").length
  const submittedCount = students.filter(s => s.status === "SUBMITTED").length

  return (
    <div className="flex flex-col gap-3">
      {/* Stats Bar */}
      <div className="flex items-center gap-4 mb-1">
        <div className="glass flex items-center gap-2 rounded-lg px-3 py-2">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs text-muted-foreground uppercase font-bold tracking-tighter">Active Builders</span>
          <span className="text-xs font-mono font-semibold text-foreground">{participatingCount}</span>
        </div>
        <div className="glass flex items-center gap-2 rounded-lg px-3 py-2">
          <Rocket className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs text-muted-foreground uppercase font-bold tracking-tighter">Mission Submissions</span>
          <span className="text-xs font-mono font-semibold text-foreground">{submittedCount}</span>
        </div>
        <div className="glass flex items-center gap-2 rounded-lg px-3 py-2">
          <Clock className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground uppercase font-bold tracking-tighter">Deployment State</span>
          <span className="text-xs font-mono font-semibold text-foreground uppercase tracking-tighter">Standard Operation</span>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[48px_1.5fr_1fr_100px_140px_80px_70px] items-center gap-6 px-4 py-2">
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/60 uppercase">Rank</span>
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/60 uppercase">Contestant</span>
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/60 uppercase">Assigned Mission</span>
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/60 uppercase text-center">Terminal</span>
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/60 uppercase text-center">Engagement Status</span>
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/60 uppercase text-right">Score</span>
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground/60 uppercase text-right">Award</span>
      </div>

      {/* Student Rows */}
      <div className="flex flex-col gap-1.5">
        {loading && students.length === 0 && (
          <div className="flex items-center justify-center p-8 text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
            Awaiting Builder Connections...
          </div>
        )}
        {students.map((student, i) => {
          const config = statusConfig[student.status] || statusConfig["REGISTERED"]
          const StatusIcon = config.icon
          const rank = i + 1

          return (
            <div
              key={student.id}
              className={cn(
                "grid grid-cols-[48px_1.5fr_1fr_100px_140px_80px_70px] items-center gap-6 rounded-xl px-4 py-4 transition-all duration-300",
                "glass hover:ring-1 hover:ring-primary/20",
                rank === 1 && "ring-1 ring-amber-400/20 glow-gold",
                rank <= 3 && rank !== 1 && "ring-1 ring-primary/10"
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <RankBadge rank={rank} />

              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ring-1 shadow-sm",
                  rank === 1 ? "bg-amber-400/20 text-amber-400 ring-amber-400/30" :
                    rank <= 3 ? "bg-primary/20 text-primary ring-primary/30" :
                      "bg-secondary/40 text-muted-foreground ring-border"
                )}>
                  {student.nickname.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-foreground tracking-wide leading-none">{student.nickname}</span>
                  <span className="text-[10px] text-muted-foreground mt-1 uppercase font-mono tracking-tighter">ID: {student.id.slice(0, 8)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                <span className="text-[10px] font-black uppercase tracking-tight text-muted-foreground line-clamp-1 italic">
                  {student.mission || "DEFAULT_VOID"}
                </span>
              </div>

              <div className="flex items-center justify-center gap-1.5 bg-secondary/20 py-1 px-2 rounded-lg border border-white/5">
                <Monitor className="h-3 w-3 text-muted-foreground/60" />
                <span className="font-mono text-[10px] font-bold text-muted-foreground tracking-tighter">{student.station}</span>
              </div>

              <div className="flex justify-center">
                <Badge
                  className={cn(
                    "gap-1.5 rounded-full border-0 px-3 py-1 text-[9px] font-black tracking-widest ring-1 shadow-sm uppercase",
                    config.bgColor,
                    config.color,
                    config.ringColor
                  )}
                >
                  <StatusIcon className="h-3 w-3" />
                  {config.label}
                </Badge>
              </div>

              <span className="font-mono text-xs font-black text-foreground text-right">{(student.score ?? 0).toLocaleString()}</span>
              <div className="flex justify-end">
                {student.is_winner && <Crown className="h-5 w-5 text-amber-400 animate-pulse-glow" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
