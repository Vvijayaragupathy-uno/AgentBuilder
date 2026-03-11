"use client"

import { useState, useEffect } from "react"
import { LockScreen } from "@/components/arena/lock-screen"
import { Shield, Rocket, RefreshCw, Trophy, CheckCircle2, Zap, BarChart3, Medal, Megaphone, X, FileText, Clock } from "lucide-react"
import { cn, getApiBase } from "@/lib/utils"

export default function BuilderPage() {
    const [session, setSession] = useState<{ id: string; nickname: string } | null>(null)
    const [stats, setStats] = useState<{ flows: number; achievements: number } | null>(null)
    const [iframeLoaded, setIframeLoaded] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [broadcast, setBroadcast] = useState<string | null>(null)
    const [challengeAssets, setChallengeAssets] = useState<string | null>(null)
    const [isSystemLocked, setIsSystemLocked] = useState(false)
    const [timeLeft, setTimeLeft] = useState<number | null>(null)
    const [challengeInfo, setChallengeInfo] = useState<{ start_time: string; duration: number } | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Handle unlock from LockScreen
    const handleUnlock = (sessionId: string, nickname: string, userStats?: any) => {
        setSession({ id: sessionId, nickname })
        localStorage.setItem("aiccore_session_id", sessionId)
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

    // WebSocket Listener for Broadcasts & Ceremony
    useEffect(() => {
        const apiBase = getApiBase()
        const wsUrl = apiBase.replace(/^http/, "ws")
        const ws = new WebSocket(`${wsUrl}/api/v1/aiccore/ws`)

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)

                if (data.type === "ADMIN_BROADCAST") {
                    setBroadcast(data.message)
                    // Auto-hide broadcast after 10 seconds
                    setTimeout(() => setBroadcast(null), 10000)
                }

                if (data.type === "SYSTEM_FINALIZE") {
                    setIsSystemLocked(true)
                }
            } catch (err) {
                console.error("WS error:", err)
            }
        }

        return () => ws.close()
    }, [])

    useEffect(() => {
        if (!session) return
        const fetchChallenge = async () => {
            try {
                const apiBase = getApiBase()
                const res = await fetch(`${apiBase}/api/v1/aiccore/system/status`)
                const status = await res.json()
                if (status.starter_assets_url) {
                    setChallengeAssets(status.starter_assets_url)
                }
                if (status.start_time && status.duration_minutes) {
                    setChallengeInfo({
                        start_time: status.start_time,
                        duration: status.duration_minutes
                    })
                }
            } catch (e) { }
        }
        fetchChallenge()
    }, [session])

    // Timer Logic
    useEffect(() => {
        if (!challengeInfo) return

        const timer = setInterval(() => {
            const start = new Date(challengeInfo.start_time).getTime()
            const end = start + (challengeInfo.duration * 60 * 1000)
            const now = Date.now()
            const remaining = Math.max(0, Math.floor((end - now) / 1000))

            setTimeLeft(remaining)

            if (remaining === 0 && !isSubmitted && !isSystemLocked) {
                console.log("Timer expired. Auto-submitting...")
                handleSubmit()
                clearInterval(timer)
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [challengeInfo, isSubmitted, isSystemLocked])

    const handleSubmit = async () => {
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
    }

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

                <div className="relative flex flex-col items-center gap-8 text-center p-8 max-w-lg z-20">
                    <div className="relative group">
                        <div className="absolute -inset-8 rounded-full bg-primary/20 blur-3xl opacity-50 group-hover:opacity-100 transition-opacity" />
                        <div className="relative flex h-32 w-32 items-center justify-center rounded-3xl bg-black ring-1 ring-white/10 shadow-2xl">
                            {isSystemLocked ? <Trophy className="h-16 w-16 text-amber-400 animate-bounce" /> : <Trophy className="h-16 w-16 text-amber-400" />}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h1 className="text-5xl font-black tracking-tighter uppercase italic leading-none">
                            {isSystemLocked ? "Station Locked" : "Mission Complete"}
                        </h1>
                        <p className="text-muted-foreground font-medium leading-relaxed">
                            {isSystemLocked ? "The mission window has closed. All stations are locked for evaluation." : "Agent successfully deployed to the AICCORE Registry!"}
                        </p>
                    </div>

                    <div className="w-full mt-4 flex flex-col gap-2 rounded-2xl bg-secondary/50 p-6 ring-1 ring-border">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-sm text-muted-foreground uppercase font-bold tracking-widest">Builder</span>
                            <span className="text-lg font-black text-foreground">{session.nickname}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-t border-border pt-2 mt-2">
                            <span className="text-sm text-muted-foreground uppercase font-bold tracking-widest">Status</span>
                            <div className="flex items-center gap-2 text-emerald-400 font-bold">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>{isSystemLocked ? "FINISHED" : "SUBMITTED"}</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleReset}
                        className="group relative flex h-16 w-full items-center justify-center rounded-2xl bg-primary font-black text-primary-foreground transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-primary/20 uppercase tracking-widest mt-4"
                    >
                        Return to Start
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
            {/* Live Broadcast Overlay */}
            {broadcast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xl animate-in fade-in slide-in-from-top-8 duration-500">
                    <div className="bg-sky-500 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/20 ring-4 ring-sky-500/20">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                            <Megaphone className="h-6 w-6 animate-bounce" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Message from System Command</span>
                            <span className="text-sm font-bold">{broadcast}</span>
                        </div>
                        <button onClick={() => setBroadcast(null)} className="ml-auto p-1 hover:bg-white/10 rounded">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Mini Header for the builder */}
            <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
                        <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-xs font-bold tracking-tight text-foreground">AICCORE Agent Builder</span>
                        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">Builder Mode</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {challengeAssets && (
                        <a
                            href={challengeAssets}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-1 text-[10px] font-black text-emerald-400 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20 transition-all uppercase tracking-widest"
                        >
                            <FileText className="h-3 w-3" />
                            Download Mission Directive
                        </a>
                    )}

                    {stats && (
                        <div className="flex items-center gap-3 border-r border-border pr-4">
                            <div className="flex items-center gap-1.5 opacity-70">
                                <BarChart3 className="h-3 w-3 text-primary" />
                                <span className="text-[10px] font-bold font-mono tracking-tighter uppercase">{stats.flows} FLOWS</span>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-70">
                                <Medal className="h-3 w-3 text-amber-500" />
                                <span className="text-[10px] font-bold font-mono tracking-tighter uppercase">{stats.achievements} BADGES</span>
                            </div>
                        </div>
                    )}

                    {timeLeft !== null && (
                        <div className={cn(
                            "flex items-center gap-2 px-3 py-1 rounded-md border text-[10px] font-black tracking-widest uppercase",
                            timeLeft < 300 ? "bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse" : "bg-primary/5 text-primary border-primary/10"
                        )}>
                            <Clock className="h-3 w-3" />
                            <span>Mission Ends: {formatTime(timeLeft)}</span>
                        </div>
                    )}

                    <div className="h-4 w-[1px] bg-border" />

                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || isSubmitted || isSystemLocked}
                        className={cn(
                            "flex items-center gap-2 rounded-md px-4 py-1.5 text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95",
                            isSubmitting ? "bg-muted cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20"
                        )}
                    >
                        <Rocket className={cn("h-3 w-3", isSubmitting && "animate-spin")} />
                        {isSubmitting ? "Deploying..." : "Submit Mission"}
                    </button>

                    <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 ring-1 ring-primary/20">
                        <div className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-bold text-foreground">Participant: {session.nickname}</span>
                    </div>

                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all uppercase tracking-tighter"
                    >
                        <RefreshCw className="h-3 w-3" />
                        Reset Station
                    </button>
                </div>
            </header>

            {/* Langflow IFrame */}
            <main className="relative flex-1 bg-secondary/20">
                {!iframeLoaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <Rocket className="h-8 w-8 animate-bounce text-primary" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.2em]">Launching Building Deck...</p>
                    </div>
                )}

                <iframe
                    src={`${getApiBase().replace(":7860", ":5173")}/?session_id=${session.id}`} // Point to Langflow Frontend Dev Server
                    className={cn(
                        "h-full w-full border-0 transition-opacity duration-700",
                        iframeLoaded ? "opacity-100" : "opacity-0"
                    )}
                    onLoad={() => setIframeLoaded(true)}
                    title="AICCORE Agent Builder"
                />
            </main>

            {/* Footer / Status */}
            <footer className="flex h-8 items-center justify-between border-t border-border bg-card px-4 text-[10px] text-muted-foreground font-mono">
                <div className="flex gap-4">
                    <span>STATION_LOCAL</span>
                    <span>LATENCY: 12ms</span>
                </div>
                <div className="flex gap-2 items-center">
                    <Zap className="h-3 w-3 text-amber-400 fill-amber-400 animate-pulse" />
                    <span>LIVE TELEMETRY ACTIVE</span>
                </div>
            </footer>
        </div>
    )
}
