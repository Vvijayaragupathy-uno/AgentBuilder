"use client"

import { useState, useEffect, useCallback } from "react"
import { FlowPreviewCard } from "./flow-preview-card"
import { cn, formatBuilderSeatLabel, getApiBase } from "@/lib/utils"
import { Monitor } from "lucide-react"

interface MosaicSession {
    id: string
    nickname: string
    station: string
    nodes: any[]
    edges: any[]
    runningNodes: string[]
    status: "idle" | "running" | "error" | "submitted"
    lastUpdate: number
}

/** Server truth for who still appears on the mosaic (active + not yet submitted). */
function parseActiveSessionsList(data: unknown): {
    sessions: Record<string, MosaicSession>
    ids: string[]
} {
    const initialSessions: Record<string, MosaicSession> = {}
    const ids: string[] = []
    if (!Array.isArray(data)) return { sessions: initialSessions, ids }

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

        const rawLu = s.last_update ? new Date(s.last_update).getTime() : Date.now()
        const lastUpdate = Number.isFinite(rawLu) ? rawLu : Date.now()
        initialSessions[s.session_id] = {
            id: s.session_id,
            nickname: s.nickname,
            station: s.station_id || "0",
            nodes: mappedNodes,
            edges: mappedEdges,
            runningNodes: [],
            status: s.is_submitted ? "submitted" : "idle",
            lastUpdate,
        }
        ids.push(s.session_id)
    })

    return { sessions: initialSessions, ids }
}

export type MosaicEmptyState = { title: string; subtitle?: string }

/**
 * Shown when `/sessions/active` returns no rows. That is normal if (a) no one has unlocked yet,
 * or (b) everyone still in the arena has already submitted — tiles are intentionally hidden then.
 * The old “Waiting for builders…” line confused people after submit; TV passes a custom emptyState too.
 */
const DEFAULT_MOSAIC_EMPTY: MosaicEmptyState = {
    title: "No live canvases here",
    subtitle:
        "This grid only shows builders who are unlocked and have not submitted yet. Before unlock it stays empty; after everyone submits it stays empty on purpose — use the demo queue on the TV for full-screen walkthroughs.",
}

export function MosaicDisplay({ emptyState }: { emptyState?: MosaicEmptyState }) {
    const [sessions, setSessions] = useState<Record<string, MosaicSession>>({})
    const [activeIds, setActiveIds] = useState<string[]>([])

    const syncFromServer = useCallback(async () => {
        try {
            const apiBase = getApiBase()
            const response = await fetch(`${apiBase}/api/v1/aiccore/sessions/active`)
            if (!response.ok) return
            const data = await response.json()
            const { sessions: next, ids } = parseActiveSessionsList(data)
            setSessions(next)
            setActiveIds(ids)
        } catch (err) {
            console.error("Failed to sync mosaic sessions", err)
        }
    }, [])

    useEffect(() => {
        void syncFromServer()

        // Poll — fixes stuck tiles if a WebSocket "submitted" was missed or no WS clients were connected
        const poll = window.setInterval(() => void syncFromServer(), 5000)

        // 2. Connect to WebSocket with auto-reconnect
        let ws: WebSocket | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let retryDelay = 1000
        let destroyed = false

        const handleMessage = (data: any) => {
            if (!data) return

            if (data.type === "SESSIONS_CLEARED") {
                setSessions({})
                setActiveIds([])
                return
            }

            if (
                data.type === "DEMO_QUEUE_UPDATE" ||
                data.type === "DEMO_GATE_OPEN" ||
                data.type === "SUBMISSION_UPDATE"
            ) {
                void syncFromServer()
                return
            }

            if (!data.event_type) return

            if (data.event_type === "flow_saved" || data.event_type === "submitted") {
                const payload = data.payload
                const snapshot = payload.snapshot || {}
                const isSubmission = data.event_type === "submitted"

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
                            nodes: mappedNodes.length > 0 ? mappedNodes : (existing?.nodes || []),
                            edges: mappedEdges.length > 0 ? mappedEdges : (existing?.edges || []),
                            runningNodes: isSubmission ? [] : (existing?.runningNodes || []),
                            status: isSubmission ? "submitted" : (existing?.status || "idle"),
                            lastUpdate: Date.now()
                        }
                    }
                })

                if (isSubmission) {
                    setActiveIds(prev => prev.filter(id => id !== data.session_id))
                } else {
                    setActiveIds(prev => prev.includes(data.session_id) ? prev : [...prev, data.session_id])
                }
            }

            if (
                typeof data.event_type === "string" &&
                (data.event_type.endsWith("_started") || data.event_type.endsWith("_completed"))
            ) {
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

        const connectWs = () => {
            if (destroyed) return
            const apiBase = getApiBase()
            const wsUrl = apiBase.replace(/^http/, "ws") + "/api/v1/aiccore/ws"
            ws = new WebSocket(wsUrl)

            ws.onmessage = (event) => {
                try {
                    handleMessage(JSON.parse(event.data))
                } catch { /* ignore malformed messages */ }
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
            clearInterval(poll)
            if (reconnectTimer) clearTimeout(reconnectTimer)
            ws?.close()
        }
    }, [syncFromServer])

    // Dynamic grid: all active sessions (scroll if many — no silent cap at 9)
    const count = activeIds.length
    const cols = count <= 1 ? "grid-cols-1" : count <= 4 ? "grid-cols-2" : "grid-cols-3"

    if (count === 0) {
        const title = emptyState?.title ?? DEFAULT_MOSAIC_EMPTY.title
        const subtitle = emptyState?.subtitle ?? DEFAULT_MOSAIC_EMPTY.subtitle
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
                <Monitor className="h-12 w-12 stroke-[1.5] opacity-50" />
                <p className="text-sm font-medium uppercase tracking-[0.2em] opacity-80">
                    {title}
                </p>
                {subtitle ? (
                    <p className="max-w-lg text-[13px] font-medium leading-snug text-muted-foreground/80 normal-case tracking-normal">
                        {subtitle}
                    </p>
                ) : null}
            </div>
        )
    }

    return (
        <div className={cn("grid h-full w-full min-h-0 gap-3 overflow-y-auto p-3 text-white auto-rows-[minmax(180px,1fr)]", cols)}>
            {activeIds.map((id) => {
                const session = sessions[id]
                if (!session) return null
                return (
                    <div key={id} className={cn(
                        "glass relative flex flex-col overflow-hidden rounded-2xl ring-1 transition-all",
                        session.status === "submitted"
                            ? "border-amber-500/30 ring-amber-500/20"
                            : "border-primary/10 ring-primary/5"
                    )}>
                        <div className="flex items-center justify-between border-b border-primary/5 bg-primary/5 px-4 py-2">
                            <div className="flex items-center gap-2">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                                    {(session.nickname || "??").slice(0, 2).toUpperCase()}
                                </div>
                                <span className="text-xs font-bold tracking-tight text-foreground">{session.nickname}</span>
                            </div>
                            <div
                                className="flex items-center gap-1.5 opacity-50"
                                title={session.station && session.station !== "0" ? session.station : undefined}
                            >
                                <Monitor className="h-3 w-3" />
                                <span className="font-mono text-[10px] font-bold">
                                    {formatBuilderSeatLabel(session.station)}
                                </span>
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
                                "flex h-1.5 w-1.5 rounded-full",
                                session.status === "running" ? "animate-pulse bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" :
                                    session.status === "error" ? "bg-red-500" :
                                        session.status === "submitted" ? "bg-amber-400" : "animate-pulse bg-emerald-400"
                            )} />
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-tighter",
                                session.status === "running" ? "text-primary" :
                                    session.status === "error" ? "text-red-400" :
                                        session.status === "submitted" ? "text-amber-400" : "text-emerald-400/80"
                            )}>
                                {session.status === "running" ? "Running" :
                                    session.status === "error" ? "Error" :
                                        session.status === "submitted" ? "Submitted" : "Active"}
                            </span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
