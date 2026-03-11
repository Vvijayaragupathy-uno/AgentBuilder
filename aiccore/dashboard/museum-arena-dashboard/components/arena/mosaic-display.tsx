"use client"

import { useState, useEffect } from "react"
import { FlowPreviewCard } from "./flow-preview-card"
import { cn, getApiBase } from "@/lib/utils"
import { Monitor } from "lucide-react"

interface MosaicSession {
    id: string
    nickname: string
    station: string
    nodes: any[]
    edges: any[]
    runningNodes: string[]
    status: "idle" | "running" | "error"
    lastUpdate: number
}

export function MosaicDisplay() {
    const [sessions, setSessions] = useState<Record<string, MosaicSession>>({})
    const [activeIds, setActiveIds] = useState<string[]>([])

    useEffect(() => {
        // 1. Fetch initial active sessions
        const fetchSessions = async () => {
            try {
                const apiBase = getApiBase()
                const response = await fetch(`${apiBase}/api/v1/aiccore/sessions/active`)
                const data = await response.json()

                if (Array.isArray(data)) {
                    const initialSessions: Record<string, MosaicSession> = {}
                    const ids: string[] = []

                    data.forEach((s: any) => {
                        const snapshot = s.snapshot || {}

                        const mappedNodes = (snapshot.nodes || []).map((n: any) => ({
                            id: n.id,
                            label: n.data?.node?.display_name || n.label || "Component",
                            type: n.data?.node?.display_name?.toLowerCase().includes("chat") ? "input" :
                                n.data?.node?.display_name?.toLowerCase().includes("llm") ? "llm" : "process",
                            x: n.position?.x || (n.x ?? 0),
                            y: n.position?.y || (n.y ?? 0)
                        }))

                        const mappedEdges = (snapshot.edges || []).map((e: any) => ({
                            from: e.source || e.from,
                            to: e.target || e.to
                        }))

                        initialSessions[s.session_id] = {
                            id: s.session_id,
                            nickname: s.nickname,
                            station: s.station_id || "0",
                            nodes: mappedNodes,
                            edges: mappedEdges,
                            runningNodes: [],
                            status: "idle",
                            lastUpdate: new Date(s.last_update).getTime()
                        }
                        ids.push(s.session_id)
                    })

                    setSessions(initialSessions)
                    setActiveIds(ids)
                }
            } catch (err) {
                console.error("Failed to fetch initial sessions", err)
            }
        }
        fetchSessions()

        // 2. Connect to WebSocket
        const apiBase = getApiBase()
        const wsUrl = apiBase.replace(/^http/, "ws") + "/api/v1/aiccore/ws";
        const ws = new WebSocket(wsUrl)

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (!data || !data.event_type) return

            if (data.event_type === "flow_saved" || data.event_type === "submitted") {
                const payload = data.payload
                const snapshot = payload.snapshot || {}

                const mappedNodes = (snapshot.nodes || []).map((n: any) => {
                    const x = n.position?.x || (n.x ?? 0)
                    const y = n.position?.y || (n.y ?? 0)
                    let type: any = "process"
                    const componentName = n.data?.node?.display_name?.toLowerCase() || ""
                    if (componentName.includes("input") || componentName.includes("chat")) type = "input"
                    else if (componentName.includes("llm") || componentName.includes("openai")) type = "llm"
                    else if (componentName.includes("output")) type = "output"

                    return {
                        id: n.id,
                        label: n.data?.node?.display_name || n.label || "Component",
                        type: type,
                        x: x,
                        y: y
                    }
                })

                const mappedEdges = (snapshot.edges || []).map((e: any) => ({
                    from: e.source || e.from,
                    to: e.target || e.to
                }))

                setSessions(prev => {
                    const existing = prev[data.session_id]
                    return {
                        ...prev,
                        [data.session_id]: {
                            id: data.session_id,
                            nickname: payload.nickname || existing?.nickname || "Anonymous",
                            station: payload.station_id || existing?.station || "0",
                            nodes: mappedNodes,
                            edges: mappedEdges,
                            runningNodes: existing?.runningNodes || [],
                            status: existing?.status || "idle",
                            lastUpdate: Date.now()
                        }
                    }
                })

                setActiveIds(prev => prev.includes(data.session_id) ? prev : [...prev, data.session_id])
            }

            if (data.event_type.endsWith("_started") || data.event_type.endsWith("_completed")) {
                const payload = data.payload
                const isStarted = data.event_type.endsWith("_started")
                const isVertex = data.event_type.includes("vertex")

                setSessions(prev => {
                    const existing = prev[data.session_id]
                    if (!existing) return prev

                    let newRunningNodes = [...existing.runningNodes]
                    if (isVertex && payload.vertex_id) {
                        if (isStarted) {
                            if (!newRunningNodes.includes(payload.vertex_id)) newRunningNodes.push(payload.vertex_id)
                        } else {
                            newRunningNodes = newRunningNodes.filter(id => id !== payload.vertex_id)
                        }
                    }

                    return {
                        ...prev,
                        [data.session_id]: {
                            ...existing,
                            status: isStarted ? "running" : (payload.status === "error" ? "error" : "idle"),
                            runningNodes: newRunningNodes,
                            lastUpdate: Date.now()
                        }
                    }
                })
            }
        }

        return () => ws.close()
    }, [])

    // Dynamic grid column calculation
    const count = activeIds.length
    const cols = count <= 1 ? "grid-cols-1" : count <= 4 ? "grid-cols-2" : "grid-cols-3"
    const rows = count <= 2 ? "grid-rows-1" : count <= 6 ? "grid-rows-2" : "grid-rows-3"

    if (count === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground opacity-50">
                <Monitor className="h-12 w-12 stroke-[1.5]" />
                <p className="text-sm font-medium uppercase tracking-[0.2em]">Awaiting Builder Activity</p>
            </div>
        )
    }

    return (
        <div className={cn("grid h-full w-full gap-4 p-4 text-white", cols, rows)}>
            {activeIds.slice(0, 9).map((id) => {
                const session = sessions[id]
                if (!session) return null
                return (
                    <div key={id} className="glass relative flex flex-col overflow-hidden rounded-2xl border-primary/10 ring-1 ring-primary/5 transition-all">
                        <div className="flex items-center justify-between border-b border-primary/5 bg-primary/5 px-4 py-2">
                            <div className="flex items-center gap-2">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                                    {(session.nickname || "??").slice(0, 2).toUpperCase()}
                                </div>
                                <span className="text-xs font-bold tracking-tight text-foreground">{session.nickname}</span>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-50">
                                <Monitor className="h-3 w-3" />
                                <span className="font-mono text-[10px] font-bold italic">STATION #{session.station}</span>
                            </div>
                        </div>

                        <div className="flex-1 p-3">
                            <FlowPreviewCard
                                nodes={session.nodes}
                                edges={session.edges}
                                runningNodes={session.runningNodes}
                                className="h-full border-0 bg-transparent ring-0"
                            />
                        </div>

                        <div className="absolute bottom-3 right-3 flex items-center gap-1 scale-75">
                            <span className={cn(
                                "flex h-1.5 w-1.5 rounded-full animate-pulse",
                                session.status === "running" ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" :
                                    session.status === "error" ? "bg-red-500" : "bg-emerald-400"
                            )} />
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-tighter",
                                session.status === "running" ? "text-primary" :
                                    session.status === "error" ? "text-red-400" : "text-emerald-400/80"
                            )}>
                                {session.status === "running" ? "Processing..." :
                                    session.status === "error" ? "Error" : "Live"}
                            </span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
