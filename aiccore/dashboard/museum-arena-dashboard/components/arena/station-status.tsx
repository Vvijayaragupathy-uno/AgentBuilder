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
import { cn, getApiBase } from "@/lib/utils"

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

    const fetchStations = async () => {
        try {
            const apiBase = getApiBase()
            const res = await fetch(`${apiBase}/api/v1/aiccore/stations`)
            if (res.ok) {
                const data = await res.json()
                setStations(data)
            }
        } catch (err) {
            console.error("Failed to fetch stations", err)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchStations()
        // Poll as a fallback every 30s (WebSocket handles real-time below)
        const interval = setInterval(fetchStations, 30000)

        // WebSocket: re-fetch immediately when any station event arrives, with auto-reconnect
        let ws: WebSocket | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let retryDelay = 1000
        let destroyed = false

        const connectWs = () => {
            if (destroyed) return
            const apiBase = getApiBase()
            const wsUrl = apiBase.replace(/^http/, "ws") + "/api/v1/aiccore/ws"
            ws = new WebSocket(wsUrl)
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data)
                    if (msg.type === "STATION_UPDATE") fetchStations()
                } catch (_) {}
            }
            ws.onopen = () => { retryDelay = 1000 }
            ws.onclose = () => {
                if (destroyed) return
                reconnectTimer = setTimeout(() => {
                    retryDelay = Math.min(retryDelay * 2, 30_000)
                    connectWs()
                }, retryDelay)
            }
        }
        connectWs()

        return () => {
            destroyed = true
            clearInterval(interval)
            if (reconnectTimer) clearTimeout(reconnectTimer)
            ws?.close()
        }
    }, [])

    const onlineCount = stations.filter(s => s.status !== "maintenance" && s.status !== "offline").length
    const totalCount = stations.length
    const pulseLabel = totalCount === 0 ? "OFFLINE" : onlineCount === totalCount ? "OPTIMAL" : onlineCount > totalCount / 2 ? "DEGRADED" : "CRITICAL"
    const pulseColorClass = pulseLabel === "OPTIMAL" ? "text-emerald-400" : pulseLabel === "DEGRADED" ? "text-amber-400" : "text-rose-400"
    const pulseDotClass = pulseLabel === "OPTIMAL" ? "bg-emerald-400" : pulseLabel === "DEGRADED" ? "bg-amber-400" : "bg-rose-400"

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* System Status Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                        <Activity className="h-6 w-6 text-primary animate-pulse" />
                        Station Status
                    </h2>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Real-time health monitoring for local builder stations</p>
                </div>
                <div className="glass px-6 py-3 rounded-2xl border-primary/20 flex items-center gap-6">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">System Pulse</span>
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
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Units</span>
                        <span className="text-xl font-black">{onlineCount} / {totalCount}</span>
                    </div>
                </div>
            </div>

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
