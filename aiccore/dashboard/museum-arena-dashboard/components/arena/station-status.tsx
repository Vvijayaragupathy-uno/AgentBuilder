"use client"

import { useState, useEffect } from "react"
import {
    Cpu,
    Activity,
    Wifi,
    Thermometer,
    AlertCircle
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn, fetchWithCredentials, getApiBase } from "@/lib/utils"

interface Station {
    id: string
    status: string
    ip: string
    load: number
    temp: number
    last_active: string | null
}

function formatLastActive(lastActive: string | null): string {
    if (!lastActive) return "N/A"
    const diff = Math.floor((Date.now() - new Date(lastActive).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`
}

export function StationStatus() {
    const [stations, setStations] = useState<Station[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeBuilderCount, setActiveBuilderCount] = useState<number | null>(null)

    const fetchStations = async () => {
        try {
            const apiBase = getApiBase()
            const [stationsRes, sessionsRes] = await Promise.all([
                fetchWithCredentials(`${apiBase}/api/v1/aiccore/stations`),
                fetchWithCredentials(`${apiBase}/api/v1/aiccore/sessions/active`),
            ])
            if (stationsRes.ok) {
                const data = await stationsRes.json()
                setStations(Array.isArray(data) ? data : [])
            }
            if (sessionsRes.ok) {
                const sess = await sessionsRes.json()
                setActiveBuilderCount(Array.isArray(sess) ? sess.length : 0)
            }
        } catch (err) {
            console.error("Failed to fetch stations", err)
        } finally {
            setIsLoading(false)
        }
    }

    const [lastEventId, setLastEventId] = useState(0)

    useEffect(() => {
        fetchStations()
        const interval = setInterval(fetchStations, 30000)

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
                    if (
                        msg.type === "STATION_UPDATE" ||
                        msg.type === "LEADERBOARD_UPDATE" ||
                        msg.type === "SESSION_UPDATE"
                    ) {
                        shouldRefresh = true
                    }
                })

                if (shouldRefresh) {
                   fetchStations()
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
    }, [lastEventId])

    const onlineCount = stations.filter(s => s.status !== "maintenance" && s.status !== "offline").length
    const totalCount = stations.length
    /** Registered kiosk PCs only — browser builders do not appear here until something calls POST /stations/register. */
    const pulseLabel =
        totalCount === 0
            ? "STANDBY"
            : onlineCount === totalCount
              ? "OPTIMAL"
              : onlineCount > totalCount / 2
                ? "DEGRADED"
                : "CRITICAL"
    const pulseColorClass =
        pulseLabel === "STANDBY"
            ? "text-amber-400"
            : pulseLabel === "OPTIMAL"
              ? "text-emerald-400"
              : pulseLabel === "DEGRADED"
                ? "text-amber-400"
                : "text-rose-400"
    const pulseDotClass =
        pulseLabel === "STANDBY"
            ? "bg-amber-400"
            : pulseLabel === "OPTIMAL"
              ? "bg-emerald-400"
              : pulseLabel === "DEGRADED"
                ? "bg-amber-400"
                : "bg-rose-400"

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* System Status Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                        <Activity className="h-6 w-6 text-primary animate-pulse" />
                        Station Status
                    </h2>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest max-w-xl">
                        Kiosk PCs that register with the API and send heartbeats. Browser-only builders use a virtual seat ID and still show on Live / Leaderboard.
                    </p>
                </div>
                <div className="glass px-6 py-3 rounded-2xl border-primary/20 flex items-center gap-6">
                    <div className="flex flex-col">
                        <span
                            className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                            title="STANDBY = no kiosk rows in the database yet. Builders in the browser are tracked separately."
                        >
                            System Pulse
                        </span>
                        <div className="flex items-center gap-2">
                            <div className="relative flex h-2 w-2">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pulseDotClass} opacity-75`}></span>
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${pulseDotClass}`}></span>
                            </div>
                            <span className={`text-xl font-black tracking-tight ${pulseColorClass}`}>{pulseLabel}</span>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-white/10" />
                    <div className="flex flex-col">
                        <span
                            className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                            title="Registered kiosk stations that are not offline or in maintenance"
                        >
                            Kiosk units
                        </span>
                        <span className="text-xl font-black">{onlineCount} / {totalCount}</span>
                        {activeBuilderCount != null && activeBuilderCount > 0 && (
                            <span className="text-[10px] font-bold normal-case tracking-normal text-muted-foreground/80 leading-tight mt-1 max-w-[11rem]">
                                {activeBuilderCount} browser builder{activeBuilderCount !== 1 ? "s" : ""} unlocked (Live board)
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {!isLoading && stations.length === 0 && (
                <div className="rounded-2xl border border-primary/15 bg-primary/5 px-5 py-4 text-sm text-muted-foreground">
                    <p className="font-bold text-foreground/90 mb-1">Why 0 / 0 while someone is on the Live board?</p>
                    <p>
                        This tab only lists machines that call{" "}
                        <code className="text-[11px] bg-secondary/80 px-1 py-0.5 rounded">POST /api/v1/aiccore/stations/register</code>{" "}
                        and heartbeats. Museum laptops using the normal builder URL get a per-browser{" "}
                        <code className="text-[11px] bg-secondary/80 px-1 py-0.5 rounded">ws-…</code> seat ID instead — they appear on{" "}
                        <span className="text-foreground/80 font-semibold">Live</span> and{" "}
                        <span className="text-foreground/80 font-semibold">Leaderboard</span>, not here, until you add a small station agent.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stations.map((s) => (
                    <Card key={s.id} className="glass group overflow-hidden border-primary/10 hover:border-primary/30 transition-all flex flex-col">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "flex h-8 w-8 items-center justify-center rounded-lg ring-1",
                                        s.status === "available" ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" :
                                            s.status === "occupied" ? "bg-primary/15 text-primary ring-primary/30" :
                                                "bg-rose-500/15 text-rose-400 ring-rose-500/30"
                                    )}>
                                        <Cpu className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-sm font-bold">{s.id}</CardTitle>
                                        <p className="text-[10px] font-mono text-muted-foreground">{s.ip}</p>
                                    </div>
                                </div>
                                <Badge variant="outline" className={cn(
                                    "text-[10px] uppercase font-bold px-1.5 py-0",
                                    s.status === "available" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                        s.status === "occupied" ? "bg-primary/10 text-primary border-primary/20" :
                                            "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                )}>
                                    {s.status}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-2 flex-1">
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[10px] uppercase font-bold text-muted-foreground/70">
                                    <div className="flex items-center gap-1">
                                        <Activity className="h-3 w-3" /> CPU Load
                                    </div>
                                    <span className={cn(s.load > 80 ? "text-rose-400 font-bold" : "text-foreground font-medium")}>{s.load}%</span>
                                </div>
                                <Progress value={s.load} className="h-1 bg-primary/5" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground/70">
                                        <Thermometer className="h-3 w-3" /> Core Temp
                                    </div>
                                    <p className="text-sm font-bold text-foreground">{s.temp}°C</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground/70">
                                        <Wifi className="h-3 w-3" /> Heartbeat
                                    </div>
                                    <p className="text-sm font-bold text-foreground">{formatLastActive(s.last_active)}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-primary/5 mt-auto">
                                <Badge variant="outline" className="text-[9px] text-muted-foreground font-mono px-2 py-0 border-0">
                                    LAST SEEN: {formatLastActive(s.last_active)}
                                </Badge>
                                {s.status === "maintenance" && (
                                    <div className="flex items-center gap-1 text-rose-400 animate-pulse">
                                        <AlertCircle className="h-3 w-3" />
                                        <span className="text-[9px] font-bold uppercase">Critical Update</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
