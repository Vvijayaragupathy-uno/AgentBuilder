"use client"

import { useState, useEffect, useCallback } from "react"
import { LockScreen } from "@/components/arena/lock-screen"
import { Rocket, Trophy, CheckCircle2, Megaphone, X, FileText, Clock, LogOut } from "lucide-react"
import { applyServerTimeFromIso, cn, getApiBase, getLangflowUrl, skewedNow } from "@/lib/utils"

/** When the mission has no scheduled start, each builder's countdown starts at unlock (this seat). */
const SESSION_BUILD_START_MS_KEY = "aiccore_session_build_start_ms"

export default function BuilderPage() {
    const [session, setSession] = useState<{ id: string; nickname: string } | null>(null)
    const [stats, setStats] = useState<{ flows: number; achievements: number } | null>(null)
    const [iframeLoaded, setIframeLoaded] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [broadcast, setBroadcast] = useState<string | null>(null)
    const [challengeAssets, setChallengeAssets] = useState<string | null>(null)
    const [isSystemLocked, setIsSystemLocked] = useState(false)
    const [timeLeft, setTimeLeft] = useState<number | null>(null)
    const [challengeInfo, setChallengeInfo] = useState<{ start_time: string; duration: number; mode: "mission" | "per_seat" } | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [hasActiveChallenge, setHasActiveChallenge] = useState(false)
    const [isBeforeStart, setIsBeforeStart] = useState(false)

    // Handle unlock from LockScreen
    const handleUnlock = (sessionId: string, nickname: string, userStats?: any) => {
        setSession({ id: sessionId, nickname })
        localStorage.setItem("aiccore_session_id", sessionId)
        // Per-seat build window (used when mission has duration but no mission-level start_time)
        localStorage.setItem(SESSION_BUILD_START_MS_KEY, String(skewedNow()))
        localStorage.setItem("aiccore_nickname", nickname)
        document.cookie = `aiccore_session_id=${sessionId}; path=/; max-age=86400; SameSite=Lax`

        if (userStats) {
            setStats({ flows: userStats.flows_count || 0, achievements: userStats.achievements_count || 0 })
            localStorage.setItem("aiccore_flows_count", String(userStats.flows_count || 0))
            localStorage.setItem("aiccore_achievements_count", String(userStats.achievements_count || 0))
        }

        setIsSubmitted(false)
    }

    const handleReset = async () => {
        if (session) {
            try {
                const apiBase = getApiBase()
                await fetch(`${apiBase}/api/v1/aiccore/session/${session.id}/deactivate`, {
                    method: "POST",
                    credentials: "include"
                })
            } catch (err) {
                console.error("Cleanup failed:", err)
            }
        }
        localStorage.removeItem("aiccore_session_id")
        localStorage.removeItem(SESSION_BUILD_START_MS_KEY)
        localStorage.removeItem("aiccore_nickname")
        localStorage.removeItem("aiccore_flows_count")
        localStorage.removeItem("aiccore_achievements_count")
        document.cookie = "aiccore_session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC"
        setSession(null)
        setStats(null)
        setIframeLoaded(false)
        setIsSubmitted(false)
    }

    // Poll for submission status
    useEffect(() => {
        if (!session || isSubmitted) return

        const checkStatus = async () => {
            try {
                const apiBase = getApiBase()
                const response = await fetch(`${apiBase}/api/v1/aiccore/session/${session.id}/status`, {
                    credentials: "include"
                })

                if (response.status === 404) {
                    console.warn("Session expired or purged. Resetting...")
                    handleReset()
                    return
                }

                const data = await response.json()
                if (data.is_submitted) {
                    setIsSubmitted(true)
                }
            } catch (err) {
                console.log("Status poll failed:", err)
            }
        }

        const interval = setInterval(checkStatus, 3000)
        return () => clearInterval(interval)
    }, [session, isSubmitted])

    // Load session from storage if it exists
    useEffect(() => {
        const savedId = localStorage.getItem("aiccore_session_id")
        const savedName = localStorage.getItem("aiccore_nickname")
        const savedFlows = localStorage.getItem("aiccore_flows_count")
        const savedAchs = localStorage.getItem("aiccore_achievements_count")

        if (savedId && savedName) {
            setSession({ id: savedId, nickname: savedName })
            if (savedFlows !== null && savedAchs !== null) {
                setStats({ flows: Number(savedFlows), achievements: Number(savedAchs) })
            }
        }
    }, [])

    // WebSocket Listener for Broadcasts & Ceremony (with auto-reconnect)
    useEffect(() => {
        let ws: WebSocket | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let retryDelay = 1000
        let destroyed = false

        const connect = () => {
            if (destroyed) return
            const apiBase = getApiBase()
            ws = new WebSocket(`${apiBase.replace(/^http/, "ws")}/api/v1/aiccore/ws`)

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === "ADMIN_BROADCAST") {
                        setBroadcast(data.message)
                        setTimeout(() => setBroadcast(null), 10000)
                    }
                    if (data.type === "SYSTEM_FINALIZE") {
                        setIsSystemLocked(true)
                    }
                } catch (err) {
                    console.error("WS parse error:", err)
                }
            }

            ws.onopen = () => { retryDelay = 1000 }

            ws.onclose = () => {
                if (destroyed) return
                reconnectTimer = setTimeout(() => {
                    retryDelay = Math.min(retryDelay * 2, 30_000)
                    connect()
                }, retryDelay)
            }
        }

        connect()

        return () => {
            destroyed = true
            if (reconnectTimer) clearTimeout(reconnectTimer)
            ws?.close()
        }
    }, [])

    useEffect(() => {
        if (!session) return
        const fetchChallenge = async () => {
            try {
                const apiBase = getApiBase()
                const res = await fetch(`${apiBase}/api/v1/aiccore/system/status`)
                const status = await res.json()
                applyServerTimeFromIso(status.server_time)
                if (status.starter_assets_url) {
                    setChallengeAssets(status.starter_assets_url)
                }
                // Track whether there is any active challenge at all
                setHasActiveChallenge(!!status.active_challenge)
                // Timer + auto-submit need duration. Start time is optional:
                // - With start_time: everyone shares the same end = mission_start + duration (synchronized).
                // - Without start_time: each laptop uses unlock time + duration (per seat).
                if (status.active_challenge && status.duration_minutes != null) {
                    if (status.start_time) {
                        setChallengeInfo({
                            start_time: status.start_time,
                            duration: status.duration_minutes,
                            mode: "mission",
                        })
                        setIsBeforeStart(skewedNow() < new Date(status.start_time).getTime())
                    } else {
                        let stored = localStorage.getItem(SESSION_BUILD_START_MS_KEY)
                        if (!stored) {
                            const n = skewedNow()
                            localStorage.setItem(SESSION_BUILD_START_MS_KEY, String(n))
                            stored = String(n)
                        }
                        setChallengeInfo({
                            start_time: new Date(Number(stored)).toISOString(),
                            duration: status.duration_minutes,
                            mode: "per_seat",
                        })
                        setIsBeforeStart(false)
                    }
                } else {
                    setChallengeInfo(null)
                    setTimeLeft(null)
                }
            } catch (e) { }
        }
        fetchChallenge()
    }, [session])

    const handleSubmit = useCallback(async () => {
        if (!session || isSubmitting || isSubmitted) return
        setIsSubmitting(true)
        try {
            const apiBase = getApiBase()
            const res = await fetch(`${apiBase}/api/v1/aiccore/session/${session.id}/submit`, {
                method: "POST"
            })
            if (res.ok) {
                setIsSubmitted(true)
            }
        } catch (e) {
            console.error("Submission failed:", e)
        } finally {
            setIsSubmitting(false)
        }
    }, [session, isSubmitting, isSubmitted])

    // Timer: at 0s calls submit once (each browser). Mission mode = shared deadline; per_seat = from unlock.
    useEffect(() => {
        if (!challengeInfo) return

        const timer = setInterval(() => {
            const start = new Date(challengeInfo.start_time).getTime()
            const end = start + challengeInfo.duration * 60 * 1000
            const now = skewedNow()

            if (challengeInfo.mode === "mission" && now < start) {
                setIsBeforeStart(true)
                setTimeLeft(null)
                return
            }

            setIsBeforeStart(false)
            const remaining = Math.max(0, Math.floor((end - now) / 1000))
            setTimeLeft(remaining)

            if (remaining === 0 && !isSubmitted && !isSystemLocked) {
                void handleSubmit()
                clearInterval(timer)
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [challengeInfo, isSubmitted, isSystemLocked, handleSubmit])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    if (!session) {
        return <LockScreen onUnlock={handleUnlock} />
    }



    if (isSubmitted || isSystemLocked) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f111c] overflow-hidden">
                <div className="absolute inset-0 bg-primary/5 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />

                <div className="relative flex flex-col items-center gap-6 text-center p-8 max-w-md z-20">
                    <Trophy className="h-16 w-16 text-amber-400" />

                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold text-foreground">
                            {isSystemLocked ? "Time's Up" : "All Done!"}
                        </h1>
                        <p className="text-muted-foreground leading-relaxed">
                            {isSystemLocked
                                ? "The challenge has ended. Your work has been saved."
                                : "Your work has been submitted successfully. Great job!"}
                        </p>
                    </div>

                    <div className="w-full flex flex-col gap-2 rounded-2xl bg-secondary/50 p-5 ring-1 ring-border">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Participant</span>
                            <span className="text-sm font-semibold text-foreground">{session.nickname}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-2 mt-1">
                            <span className="text-sm text-muted-foreground">Status</span>
                            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-sm">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>{isSystemLocked ? "Finished" : "Submitted"}</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleReset}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] shadow-lg shadow-primary/20"
                    >
                        Start Over
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
            {/* Announcement Banner */}
            {broadcast && (
                <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] w-full max-w-lg animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-sky-500 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-white/20">
                        <Megaphone className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-medium flex-1">{broadcast}</span>
                        <button onClick={() => setBroadcast(null)} className="p-1 hover:bg-white/10 rounded transition-colors">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4 shrink-0">
                {/* Left: brand + participant name */}
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">AICCORE</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-sm text-muted-foreground">{session.nickname}</span>
                </div>

                {/* Right: file link · timer · submit · exit */}
                <div className="flex items-center gap-2">
                    {challengeAssets && (
                        <a
                            href={challengeAssets}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                            <FileText className="h-3 w-3" />
                            Challenge Guide
                        </a>
                    )}

                    {/* Timer */}
                    {timeLeft !== null ? (
                        <div
                            title={
                                challengeInfo?.mode === "per_seat"
                                    ? "Your build time started when you unlocked this station. At 0:00 your flow auto-submits."
                                    : "Shared mission end (mission start + duration). At 0:00 your flow auto-submits."
                            }
                            className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border",
                            timeLeft < 300
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse"
                                : "bg-secondary text-foreground border-border"
                        )}>
                            <Clock className="h-3 w-3" />
                            <span>{formatTime(timeLeft)}</span>
                            {challengeInfo?.mode === "per_seat" && (
                                <span className="hidden sm:inline text-[9px] uppercase text-muted-foreground font-bold">your slot</span>
                            )}
                        </div>
                    ) : isBeforeStart ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400 text-xs font-medium">
                            <Clock className="h-3 w-3" />
                            <span>Not started yet</span>
                        </div>
                    ) : null}

                    {/* Submit — the primary action */}
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || isSubmitted || isSystemLocked || isBeforeStart || !hasActiveChallenge}
                        title={
                            isBeforeStart ? "The challenge hasn't started yet" :
                            !hasActiveChallenge ? "No active challenge" :
                            isSystemLocked ? "The challenge has ended" : "Submit your work"
                        }
                        className={cn(
                            "flex items-center gap-2 rounded-lg px-5 py-1.5 text-sm font-semibold transition-all active:scale-95",
                            (isSubmitting || isBeforeStart || !hasActiveChallenge || isSystemLocked)
                                ? "bg-muted cursor-not-allowed opacity-40 text-muted-foreground"
                                : "bg-primary text-primary-foreground hover:opacity-90"
                        )}
                    >
                        <Rocket className={cn("h-3.5 w-3.5", isSubmitting && "animate-spin")} />
                        {isSubmitting ? "Submitting…" : "Submit"}
                    </button>

                    {/* Exit */}
                    <button
                        onClick={handleReset}
                        title="Exit"
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                    </button>
                </div>
            </header>

            {/* Builder iframe */}
            <main className="relative flex-1">
                {!iframeLoaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background">
                        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        <p className="text-xs text-muted-foreground">Loading…</p>
                    </div>
                )}
                <iframe
                    src={`${getLangflowUrl()}/?session_id=${session.id}`}
                    className={cn(
                        "h-full w-full border-0 transition-opacity duration-700",
                        iframeLoaded ? "opacity-100" : "opacity-0"
                    )}
                    onLoad={() => setIframeLoaded(true)}
                    title="AICCORE Agent Builder"
                />
            </main>
        </div>
    )
}
