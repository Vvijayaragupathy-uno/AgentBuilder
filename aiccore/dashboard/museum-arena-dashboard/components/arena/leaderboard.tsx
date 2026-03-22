"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Monitor,
  Crown,
  Zap,
  Rocket,
  Clock,
  UserCheck,
  Users,
  LogIn,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn, formatBuilderSeatLabel, getApiBase } from "@/lib/utils"

type StudentStatus = "REGISTERED" | "CHECKED_IN" | "PARTICIPATING" | "SUBMITTED"

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
    label: "Registered",
    icon: UserCheck,
  },
  CHECKED_IN: {
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/10",
    ringColor: "ring-cyan-400/20",
    label: "Checked in",
    icon: LogIn,
  },
  PARTICIPATING: {
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
    ringColor: "ring-amber-400/20",
    label: "Building",
    icon: Zap,
  },
  SUBMITTED: {
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
    ringColor: "ring-emerald-400/20",
    label: "Submitted",
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

function SkeletonRow({ index }: { index: number }) {
  return (
    <div
      className="grid grid-cols-[40px_1fr_80px_130px_80px] items-center gap-4 rounded-xl px-4 py-3 glass"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="skeleton h-8 w-8 rounded-lg" />
      <div className="flex items-center gap-2.5">
        <div className="skeleton h-8 w-8 rounded-full shrink-0" />
        <div className="skeleton h-3 w-28 rounded" />
      </div>
      <div className="skeleton h-6 w-14 rounded-lg mx-auto" />
      <div className="skeleton h-5 w-24 rounded-full mx-auto" />
      <div className="skeleton h-3 w-10 rounded ml-auto" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5">
      <div className="relative">
        <div className="h-20 w-20 rounded-2xl bg-secondary/50 flex items-center justify-center ring-1 ring-border">
          <Users className="h-9 w-9 text-muted-foreground/20" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-secondary flex items-center justify-center ring-1 ring-border">
          <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
        </div>
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-sm font-bold text-foreground tracking-wide">Awaiting Contestants</p>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          Contestants will appear here once they register and join their stations.
        </p>
      </div>
      <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
        <div className="h-px w-10 bg-border" />
        <span>Monitoring Active</span>
        <div className="h-px w-10 bg-border" />
      </div>
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)

  const fetchLeaderboard = useCallback(async () => {
    try {
      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/aiccore/leaderboard`)
      const data = await response.json()
      setStudents(data)
      setLastUpdated(new Date())
      if (onDataUpdate) {
        onDataUpdate(data.length)
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error)
    } finally {
      setLoading(false)
    }
  }, [onDataUpdate])

  const [lastEventId, setLastEventId] = useState(0)

  useEffect(() => {
    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 10000)

    let destroyed = false
    let timeoutId: ReturnType<typeof setTimeout>

    const pollEvents = async () => {
      if (destroyed) return
      try {
        const url = `${getApiBase()}/api/v1/aiccore/events/poll?last_id=${lastEventId}&timeout=15`
        const res = await fetch(url)
        if (!res.ok) throw new Error("Poll failed")
        const data = await res.json()
        
        if (destroyed) return

        const events = data.events || []
        let newLastId = lastEventId
        let shouldRefresh = false

        events.forEach((eventWrapper: any) => {
          const msg = eventWrapper.data
          newLastId = Math.max(newLastId, eventWrapper.id)

          if (msg.type === "SYSTEM_FINALIZE") {
            setIsFinalized(true)
            setTimeout(() => setIsFinalized(false), 20000)
            shouldRefresh = true
          }
          
          if (msg.event_type === "submitted") {
             shouldRefresh = true
          }
        })

        if (shouldRefresh) {
          fetchLeaderboard()
        }

        if (newLastId > lastEventId) {
          setLastEventId(newLastId)
        } else {
          pollEvents()
        }
      } catch (err) {
        if (!destroyed) {
          timeoutId = setTimeout(pollEvents, 5000)
        }
      }
    }

    pollEvents()

    return () => {
      destroyed = true
      clearInterval(interval)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [fetchLeaderboard, lastEventId])

  useEffect(() => {
    if (refreshKey !== undefined) {
      fetchLeaderboard()
    }
  }, [refreshKey, fetchLeaderboard])

  const checkedInCount = students.filter(s => s.status === "CHECKED_IN").length
  const participatingCount = students.filter(s => s.status === "PARTICIPATING").length
  const submittedCount = students.filter(s => s.status === "SUBMITTED").length

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : null

  return (
    <div className="flex flex-col gap-3">
      {/* Stats + Live bar — single compact row */}
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <div className="glass flex items-center gap-3 rounded-lg px-3 py-2">
          <div
            className="flex items-center gap-1.5"
            title="Builders who unlocked the station UI (PIN ok). Not the same as registered kiosk PCs on the Stations tab."
          >
            <LogIn className="h-3 w-3 text-cyan-400 shrink-0" />
            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">Checked in</span>
            <span className="text-xs font-mono font-bold tabular-nums">{checkedInCount}</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">Building</span>
            <span className="text-xs font-mono font-bold tabular-nums">{participatingCount}</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <Rocket className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">Submitted</span>
            <span className="text-xs font-mono font-bold tabular-nums">{submittedCount}</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">Total</span>
            <span className="text-xs font-mono font-bold tabular-nums">{students.length}</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 glass rounded-lg px-3 py-2">
          <div className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Live</span>
          {updatedLabel && (
            <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{updatedLabel}</span>
          )}
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[40px_1fr_80px_130px_80px] items-center gap-4 px-4 py-2">
        <span className="text-[9px] font-bold tracking-widest text-muted-foreground/50 uppercase">#</span>
        <span className="text-[9px] font-bold tracking-widest text-muted-foreground/50 uppercase">Contestant</span>
        <span className="text-[9px] font-bold tracking-widest text-muted-foreground/50 uppercase text-center">Seat</span>
        <span className="text-[9px] font-bold tracking-widest text-muted-foreground/50 uppercase text-center">Status</span>
        <span className="text-[9px] font-bold tracking-widest text-muted-foreground/50 uppercase text-right">Score</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1.5">
        {loading && students.length === 0 ? (
          Array(5).fill(0).map((_, i) => <SkeletonRow key={i} index={i} />)
        ) : !loading && students.length === 0 ? (
          <EmptyState />
        ) : (
          students.map((student, i) => {
            const config = statusConfig[student.status as StudentStatus] || statusConfig["REGISTERED"]
            const StatusIcon = config.icon
            const rank = i + 1

            return (
              <div
                key={student.id}
                className={cn(
                  "grid grid-cols-[40px_1fr_80px_130px_80px] items-center gap-4 rounded-xl px-4 py-3",
                  "glass hover:ring-1 hover:ring-primary/20 transition-all duration-300",
                  rank === 1 && "ring-1 ring-amber-400/20 glow-gold",
                  rank <= 3 && rank !== 1 && "ring-1 ring-primary/10"
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <RankBadge rank={rank} />

                {/* Contestant */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 shadow-sm",
                    rank === 1 ? "bg-amber-400/20 text-amber-400 ring-amber-400/30" :
                      rank <= 3 ? "bg-primary/20 text-primary ring-primary/30" :
                        "bg-secondary/40 text-muted-foreground ring-border"
                  )}>
                    {student.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-bold text-foreground tracking-wide leading-none truncate">
                    {student.nickname}
                  </span>
                </div>

                {/* Station */}
                <div
                  className="flex items-center justify-center gap-1 bg-secondary/20 py-1 px-1.5 rounded-lg border border-white/5"
                  title={student.station && student.station !== "0" ? student.station : "No seat id stored for this session"}
                >
                  <Monitor className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  <span className="font-mono text-[10px] font-bold text-muted-foreground">
                    {formatBuilderSeatLabel(student.station)}
                  </span>
                </div>

                {/* Status */}
                <div className="flex justify-center">
                  <Badge
                    className={cn(
                      "gap-1.5 rounded-full border-0 px-2.5 py-0.5 text-[9px] font-black tracking-wider ring-1 shadow-sm uppercase whitespace-nowrap",
                      config.bgColor,
                      config.color,
                      config.ringColor
                    )}
                  >
                    <StatusIcon className="h-2.5 w-2.5 shrink-0" />
                    {config.label}
                  </Badge>
                </div>

                {/* Score + winner crown */}
                <div className="flex items-center justify-end gap-1.5">
                  {student.is_winner && (
                    <Crown
                      className="h-3.5 w-3.5 text-amber-400 shrink-0"
                      style={{ animation: "pulse-glow 2s ease-in-out infinite" }}
                    />
                  )}
                  <span className="font-mono text-xs font-black text-foreground tabular-nums">
                    {(student.score ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Suppress unused finalized state warning */}
      {isFinalized && null}
    </div>
  )
}
