import { useState, useEffect, useMemo } from "react"
import {
  CheckCircle2,
  Trophy,
  Clock,
  User,
  Monitor,
  Sparkles,
  Eye,
  History,
  Play,
  Download,
  Target
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { FlowPreviewCard } from "./flow-preview-card"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn, getApiBase } from "@/lib/utils"

interface Achievement {
  id: string
  name: string
  description: string
}

interface Submission {
  id: string
  session_id: string
  user_id: string | null
  nickname: string
  challenge_name: string
  station: string
  submittedAt: string
  flowName: string
  description: string
  approved: boolean
  winner: boolean
  score: number
  nodes: any[]
  edges: any[]
}

function SubmissionCard({
  sub,
  achievements,
  onApprove,
  onMarkWinner,
  onAwardHonor,
  onScoreSaved,
}: {
  sub: Submission,
  achievements: Achievement[],
  onApprove: (id: string) => void,
  onMarkWinner: (id: string) => void,
  onAwardHonor: (userId: string, achId: string) => void,
  onScoreSaved: () => void,
}) {
  const [history, setHistory] = useState<any[]>([])
  const [scoreInput, setScoreInput] = useState(String(sub.score ?? 0))
  const [scoreSaving, setScoreSaving] = useState(false)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isHistoryMode, setIsHistoryMode] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)

  useEffect(() => {
    setScoreInput(String(sub.score ?? 0))
  }, [sub.id, sub.score])

  const currentNodes = useMemo(() => {
    if (historyIndex === -1 || !history[historyIndex]) return sub.nodes
    const snapshot = history[historyIndex].payload.snapshot || {}
    return (snapshot.nodes || []).map((n: any) => ({
      id: n.id,
      label: n.data?.node?.display_name || n.label || "Component",
      type: n.data?.node?.display_name?.toLowerCase().includes("chat") ? "input" :
        n.data?.node?.display_name?.toLowerCase().includes("llm") ? "llm" : "process",
      x: n.position?.x || (n.x ?? 0),
      y: n.position?.y || (n.y ?? 0)
    }))
  }, [history, historyIndex, sub.nodes])

  const currentEdges = useMemo(() => {
    if (historyIndex === -1 || !history[historyIndex]) return sub.edges
    const snapshot = history[historyIndex].payload.snapshot || {}
    return (snapshot.edges || []).map((e: any) => ({
      from: e.source || e.from,
      to: e.target || e.to
    }))
  }, [history, historyIndex, sub.edges])

  const fetchHistory = async () => {
    if (history.length > 0) {
      setIsHistoryMode(!isHistoryMode)
      return
    }
    try {
      const apiBase = getApiBase()
      const res = await fetch(`${apiBase}/api/v1/aiccore/session/${sub.session_id}/events`)
      const events = await res.json()
      const snapshots = events.filter((e: any) => (e.event_type === "flow_saved" || e.event_type === "submitted") && e.payload?.snapshot)
      setHistory(snapshots)
      setHistoryIndex(snapshots.length - 1)
      setIsHistoryMode(true)
    } catch (err) {
      console.error("Failed to fetch history", err)
    }
  }

  const handleDownload = () => {
    const apiBase = getApiBase()
    window.location.href = `${apiBase}/api/v1/aiccore/submissions/${sub.id}/download`
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-4 rounded-xl p-4 transition-all duration-300",
        "glass hover:ring-1 hover:ring-primary/20",
        sub.winner && "ring-1 ring-amber-400/30 glow-gold",
        sub.approved && !sub.winner && "ring-1 ring-emerald-400/20"
      )}
    >
      {/* Winner Crown */}
      {sub.winner && (
        <div className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/20 ring-1 ring-amber-400/40 z-10">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ring-1",
            sub.winner ? "bg-amber-400/15 text-amber-400 ring-amber-400/30" :
              sub.approved ? "bg-emerald-400/15 text-emerald-400 ring-emerald-400/30" :
                "bg-primary/10 text-primary ring-primary/20"
          )}>
            <User className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground leading-none">{sub.nickname}</span>
              <Badge variant="outline" className="text-[8px] font-black uppercase tracking-tighter py-0 px-1 border-primary/20 text-primary/70">
                {sub.id.slice(0, 8)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1">
                <Monitor className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-[10px] font-mono text-muted-foreground">#{sub.station}</span>
              </div>
              <span className="text-muted-foreground/30">|</span>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-[10px] text-muted-foreground">{sub.submittedAt}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
            title="Download Workflow JSON"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchHistory}
            className={cn("h-7 w-7 rounded-md", isHistoryMode ? "text-primary bg-primary/10" : "text-muted-foreground")}
            title="View History Scroll"
          >
            <History className="h-3.5 w-3.5" />
          </Button>

          <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10"
                title="Launch in Builder"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 overflow-hidden bg-black border-white/10">
              <DialogHeader className="p-4 border-b border-white/5 bg-zinc-950 flex flex-row items-center justify-between">
                <div>
                  <DialogTitle className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Builder Inspection: {sub.nickname}
                  </DialogTitle>
                </div>
              </DialogHeader>
              <div className="flex-1 bg-zinc-900 overflow-hidden relative">
                <iframe
                  src={`${getApiBase()}/?session_id=${sub.session_id}`}
                  className="w-full h-full border-0"
                  title="Builder Inspection"
                />
              </div>
            </DialogContent>
          </Dialog>

          {sub.approved && (
            <Badge className={cn(
              "gap-1 rounded-md border-0 px-2 py-0.5 text-[10px] font-semibold tracking-wider ring-1",
              sub.winner
                ? "bg-amber-400/10 text-amber-400 ring-amber-400/20"
                : "bg-emerald-400/10 text-emerald-400 ring-emerald-400/20"
            )}>
              {sub.winner ? "WINNER" : "APPROVED"}
            </Badge>
          )}
        </div>
      </div>

      {/* Mission Label */}
      <div className="flex items-center gap-1.5 px-1">
        <Target className="h-3 w-3 text-rose-400" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">
          Mission Target: <span className="text-foreground">{sub.challenge_name}</span>
        </span>
      </div>

      {/* Score (curator) — PATCH /submissions/{id}/score */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Score</span>
          <Input
            type="number"
            min={0}
            max={99999}
            step={0.5}
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            className="h-8 w-24 font-mono text-xs"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={scoreSaving}
          className="h-8 text-[10px] font-bold uppercase"
          onClick={async () => {
            const v = parseFloat(scoreInput)
            if (Number.isNaN(v) || v < 0) return
            setScoreSaving(true)
            try {
              const apiBase = getApiBase()
              const res = await fetch(`${apiBase}/api/v1/aiccore/submissions/${sub.id}/score`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ score: v }),
              })
              if (res.ok) onScoreSaved()
            } catch (e) {
              console.error(e)
            } finally {
              setScoreSaving(false)
            }
          }}
        >
          {scoreSaving ? "…" : "Save score"}
        </Button>
      </div>

      {/* Flow Name & Description */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-medium text-foreground">{isHistoryMode ? `Playback: Frame #${historyIndex + 1}` : sub.flowName}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed pl-5 line-clamp-2">{sub.description}</p>
      </div>

      {/* Scrubber - Dynamic Animation */}
      {isHistoryMode && history.length > 0 && (
        <div className="px-5 py-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-primary uppercase tracking-widest">History Reel</span>
            <span className="text-[9px] font-mono text-muted-foreground uppercase">{new Date(history[historyIndex].timestamp).toLocaleTimeString()}</span>
          </div>
          <Slider
            value={[historyIndex]}
            onValueChange={(v) => setHistoryIndex(v[0])}
            max={history.length - 1}
            step={1}
            className="my-1"
          />
        </div>
      )}

      {/* Mini Flow Preview */}
      <div className="relative overflow-hidden rounded-lg bg-black/20 border border-white/5">
        <FlowPreviewCard
          nodes={currentNodes}
          edges={currentEdges}
          className="h-28"
        />
        {isHistoryMode && (
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 ring-1 ring-white/10 backdrop-blur-md">
            <Play className="h-2 w-2 text-primary animate-pulse" />
            <span className="text-[8px] font-bold text-white tracking-tighter">REPLAYABLE</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex items-center gap-2">
          {!sub.approved && (
            <Button
              size="sm"
              onClick={() => onApprove(sub.id)}
              className="h-8 gap-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25 hover:bg-emerald-500/25 hover:text-emerald-300"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold tracking-wide">Approve</span>
            </Button>
          )}
          {!sub.winner && (
            <Button
              size="sm"
              onClick={() => onMarkWinner(sub.id)}
              className={cn(
                "h-8 gap-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300",
                "bg-primary/15 text-primary ring-1 ring-primary/25 hover:bg-primary/25 hover:text-primary",
              )}
            >
              <Trophy className="h-3.5 w-3.5" />
              Publish Winner
            </Button>
          )}
          {sub.winner && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-1.5 ring-1 ring-amber-400/20 glow-gold">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-bold tracking-wider text-amber-400">CHAMPION</span>
            </div>
          )}
        </div>

        {/* Achievement Selector */}
        {achievements.length > 0 && sub.user_id && (
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Award Special Honor</span>
            <div className="flex flex-wrap gap-1.5">
              {achievements.map(ach => (
                <Button
                  key={ach.id}
                  variant="outline"
                  size="sm"
                  onClick={() => onAwardHonor(sub.user_id!, ach.id)}
                  className="h-6 text-[9px] px-2 rounded-md border-primary/20 hover:bg-primary/10"
                >
                  <Sparkles className="h-2.5 w-2.5 mr-1 text-primary" />
                  {ach.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ReviewPanel() {
  const [items, setItems] = useState<Submission[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const apiBase = getApiBase()
      const [sRes, aRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/aiccore/submissions`),
        fetch(`${apiBase}/api/v1/aiccore/achievements`)
      ])

      if (sRes.ok) {
        const data = await sRes.json()
        const mapped: Submission[] = data.map((d: any) => ({
          id: d.id,
          session_id: d.session_id,
          user_id: d.user_id,
          nickname: d.nickname,
          challenge_name: d.challenge_name,
          station: d.station_id || "0",
          submittedAt: new Date(d.submitted_at).toLocaleTimeString(),
          flowName: d.flow_snapshot?.name || "Untitled Flow",
          description: d.flow_snapshot?.description || "",
          approved: Boolean(d.is_approved),
          winner: Boolean(d.is_winner),
          score: typeof d.score === "number" ? d.score : Number(d.score) || 0,
          nodes: (d.flow_snapshot?.nodes || []).map((n: any) => ({
            id: n.id,
            label: n.data?.node?.display_name || n.label || "Component",
            type: n.data?.node?.display_name?.toLowerCase().includes("chat") ? "input" :
              n.data?.node?.display_name?.toLowerCase().includes("llm") ? "llm" : "process",
            x: n.position?.x || n.x || 0,
            y: n.position?.y || n.y || 0
          })),
          edges: (d.flow_snapshot?.edges || []).map((e: any) => ({
            from: e.source || e.from,
            to: e.target || e.to
          }))
        }))
        setItems(mapped)
      }

      if (aRes.ok) {
        setAchievements(await aRes.json())
      }
    } catch (error) {
      console.error("Failed to fetch data:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  async function handleApprove(id: string) {
    try {
      const apiBase = getApiBase()
      const res = await fetch(`${apiBase}/api/v1/aiccore/submissions/${id}/approve`, { method: "POST" })
      if (res.ok) await fetchData()
    } catch (error) {
      console.error("Failed to approve submission:", error)
    }
  }

  async function handlePublishWinner(id: string) {
    try {
      const apiBase = getApiBase()
      const res = await fetch(`${apiBase}/api/v1/aiccore/submissions/${id}/winner`, {
        method: "POST"
      })
      if (res.ok) {
        fetchData()
      }
    } catch (error) {
      console.error("Failed to mark winner:", error)
    }
  }

  async function handleAwardHonor(userId: string, achievementId: string) {
    try {
      const apiBase = getApiBase()
      const res = await fetch(`${apiBase}/api/v1/aiccore/users/${userId}/award/${achievementId}`, {
        method: "POST"
      })
      if (res.ok) {
        alert("Honor awarded successfully!")
      }
    } catch (error) {
      console.error("Failed to award honor:", error)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="flex items-center gap-4 mb-1">
        <div className="glass flex items-center gap-2 rounded-lg px-3 py-2">
          <Eye className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">Submissions</span>
          <span className="text-xs font-mono font-semibold text-foreground">{items.length}</span>
        </div>
        <div className="glass flex items-center gap-2 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs text-muted-foreground">Approved</span>
          <span className="text-xs font-mono font-semibold text-foreground">
            {items.filter((s) => s.approved).length}
          </span>
        </div>
        <div className="glass flex items-center gap-2 rounded-lg px-3 py-2">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs text-muted-foreground">Winner</span>
          <span className="text-xs font-mono font-semibold text-foreground">
            {items.find((s) => s.winner)?.nickname ?? "---"}
          </span>
        </div>
      </div>

      {/* Submissions Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {loading && items.length === 0 && (
          <div className="col-span-full flex items-center justify-center p-12 text-muted-foreground text-sm uppercase tracking-widest animate-pulse">
            Awaiting Submissions...
          </div>
        )}
        {items.map((sub) => (
          <SubmissionCard
            key={sub.id}
            sub={sub}
            achievements={achievements}
            onApprove={handleApprove}
            onMarkWinner={handlePublishWinner}
            onAwardHonor={handleAwardHonor}
            onScoreSaved={fetchData}
          />
        ))}
      </div>
    </div>
  )
}
