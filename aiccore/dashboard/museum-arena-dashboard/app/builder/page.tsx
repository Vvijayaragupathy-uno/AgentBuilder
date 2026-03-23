"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { LockScreen } from "@/components/arena/lock-screen"
import { AiccoreLogo, AICCORE_MAKERSPACE } from "@/components/arena/aiccore-logo"
import { Rocket, Trophy, CheckCircle2, Megaphone, X, FileText, Clock, LogOut, PlayCircle, ExternalLink } from "lucide-react"
import { LANGFLOW_TEACH_WATCH_URL } from "@/lib/langflow-teach"
import {
    applyServerTimeFromIso,
    cn,
    getApiBase,
    getLangflowUrlWithSession,
    getOrCreateBuilderStationId,
    isLangflowIframeMisconfigured,
    skewedNow,
} from "@/lib/utils"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"

/** When the mission has no scheduled start, each builder's countdown starts at unlock (this seat). */
const SESSION_BUILD_START_MS_KEY = "aiccore_session_build_start_ms"
const SESSION_TOKEN_STORAGE_KEY = "aiccore_session_token"

function sessionAuthHeaders(session: { id: string; token: string } | null): HeadersInit {
    if (!session) return {}
    return {
        "X-AICCORE-Session-Id": session.id,
        "X-AICCORE-Session-Token": session.token,
    }
}

export default function BuilderPage() {
    const [session, setSession] = useState<{ id: string; nickname: string; token: string } | null>(null)
    const [stats, setStats] = useState<{ flows: number; achievements: number } | null>(null)
    const [iframeLoaded, setIframeLoaded] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [broadcast, setBroadcast] = useState<string | null>(null)
    const [instructionText, setInstructionText] = useState<string | null>(null)
    const [instructionFrameUrl, setInstructionFrameUrl] = useState<string | null>(null)
    const [challengeInstructionsOpen, setChallengeInstructionsOpen] = useState(false)
    const [isSystemLocked, setIsSystemLocked] = useState(false)
    const [timeLeft, setTimeLeft] = useState<number | null>(null)
    const [challengeInfo, setChallengeInfo] = useState<{
        start_time: string
        duration: number
        mode: "mission" | "per_seat"
        isFinalized?: boolean
        /** Server UTC instant for mission end — aligns countdown with mission_build_window_open. */
        missionBuildEndsAt?: string | null
    } | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [hasActiveChallenge, setHasActiveChallenge] = useState(false)
    /** True only before scheduled start — not after the build window ends (see missionBuildPhase). */
    const [isBeforeStart, setIsBeforeStart] = useState(false)
    /** From GET system/status — distinguishes before_start vs after_end vs open. */
    const [missionBuildPhase, setMissionBuildPhase] = useState<string | null>(null)
    /** Server truth for scheduled missions — avoids disabled Submit when client clock ≠ UTC start instant. */
    const [serverBuildWindowOpen, setServerBuildWindowOpen] = useState<boolean | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const autoSubmitFiredRef = useRef(false)
    const [langflowMisconfigured, setLangflowMisconfigured] = useState(false)
    /** After Start Over, server issues a new one-time PIN (old PIN was consumed at unlock). */
    const [lockScreenPrefillPin, setLockScreenPrefillPin] = useState<string | null>(null)

    useEffect(() => {
        setLangflowMisconfigured(isLangflowIframeMisconfigured())
    }, [])

    const clearLockScreenPrefill = useCallback(() => setLockScreenPrefillPin(null), [])

    const refreshMissionFromServer = useCallback(async () => {
        if (!session) return
        try {
            const apiBase = getApiBase()
            await fetch(
                `${apiBase}/api/v1/aiccore/session/${session.id}/attach-to-live-mission`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: sessionAuthHeaders(session),
                }
            ).catch(() => { /* non-fatal */ })
            const res = await fetch(`${apiBase}/api/v1/aiccore/system/status`)
            const status = await res.json()
            applyServerTimeFromIso(status.server_time)
            const doc =
                typeof status.instructions_document_url === "string" &&
                status.instructions_document_url.trim()
                    ? status.instructions_document_url.trim()
                    : null
            const starter =
                typeof status.starter_assets_url === "string" && status.starter_assets_url.trim()
                    ? status.starter_assets_url.trim()
                    : null
            setInstructionFrameUrl(doc || starter || null)
            setInstructionText(
                typeof status.instructions_text === "string" ? status.instructions_text : null,
            )
            setHasActiveChallenge(!!status.active_challenge)
            if (status.active_challenge && status.duration_minutes != null) {
                if (status.start_time) {
                    try {
                        localStorage.removeItem(SESSION_BUILD_START_MS_KEY)
                    } catch {
                        /* ignore */
                    }
                    setChallengeInfo({
                        start_time: status.start_time,
                        duration: status.duration_minutes,
                        mode: "mission",
                        isFinalized: !!status.is_finalized,
                        missionBuildEndsAt:
                            typeof status.mission_build_ends_at === "string"
                                ? status.mission_build_ends_at
                                : null,
                    })
                    if (typeof status.mission_build_window_phase === "string") {
                        setMissionBuildPhase(status.mission_build_window_phase)
                        setIsBeforeStart(status.mission_build_window_phase === "before_start")
                    } else {
                        setMissionBuildPhase(null)
                    }
                    if (typeof status.mission_build_window_open === "boolean") {
                        setServerBuildWindowOpen(status.mission_build_window_open)
                        if (typeof status.mission_build_window_phase !== "string") {
                            const startMs = new Date(status.start_time).getTime()
                            const open = status.mission_build_window_open
                            setIsBeforeStart(!open && skewedNow() < startMs)
                        }
                    } else {
                        setServerBuildWindowOpen(null)
                        if (typeof status.mission_build_window_phase !== "string") {
                            setIsBeforeStart(skewedNow() < new Date(status.start_time).getTime())
                        }
                    }
                } else {
                    setServerBuildWindowOpen(null)
                    setMissionBuildPhase(null)
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
                        isFinalized: !!status.is_finalized,
                        missionBuildEndsAt: null,
                    })
                    setIsBeforeStart(false)
                }
            } else {
                setChallengeInfo(null)
                setServerBuildWindowOpen(null)
                setMissionBuildPhase(null)
                setTimeLeft(null)
                setInstructionText(null)
                setInstructionFrameUrl(null)
            }
        } catch {
            /* ignore */
        }
    }, [session])

    const refreshMissionRef = useRef(refreshMissionFromServer)
    const sessionRef = useRef<{ id: string; nickname: string; token: string } | null>(null)
    useEffect(() => {
        refreshMissionRef.current = refreshMissionFromServer
    }, [refreshMissionFromServer])
    useEffect(() => {
        sessionRef.current = session
    }, [session])

    const hasChallengeInstructions =
        Boolean(instructionText?.trim()) || Boolean(instructionFrameUrl)

    useEffect(() => {
        if (!hasChallengeInstructions) setChallengeInstructionsOpen(false)
    }, [hasChallengeInstructions])

    // Handle unlock from LockScreen
    const handleUnlock = (sessionId: string, sessionToken: string, nickname: string, userStats?: any) => {
        setSession({ id: sessionId, nickname, token: sessionToken })
        localStorage.setItem("aiccore_session_id", sessionId)
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, sessionToken)
        localStorage.setItem(SESSION_BUILD_START_MS_KEY, String(skewedNow()))
        localStorage.setItem("aiccore_nickname", nickname)

        if (userStats) {
            setStats({ flows: userStats.flows_count || 0, achievements: userStats.achievements_count || 0 })
            localStorage.setItem("aiccore_flows_count", String(userStats.flows_count || 0))
            localStorage.setItem("aiccore_achievements_count", String(userStats.achievements_count || 0))
        }

        setIsSubmitted(false)
    }

    const handleReset = async () => {
        let newUnlockFromServer: string | null = null
        if (session) {
            try {
                const apiBase = getApiBase()
                const res = await fetch(`${apiBase}/api/v1/aiccore/session/${session.id}/deactivate`, {
                    method: "POST",
                    credentials: "include",
                    headers: sessionAuthHeaders(session),
                })
                if (res.ok) {
                    const j = await res.json().catch(() => ({}))
                    const pin = j?.new_unlock_code
                    if (typeof pin === "string" && /^[0-9]{4}$/.test(pin)) {
                        newUnlockFromServer = pin
                    }
                }
            } catch (err) {
                console.error("Cleanup failed:", err)
            }
        }
        setLockScreenPrefillPin(newUnlockFromServer)
        localStorage.removeItem("aiccore_session_id")
        localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
        localStorage.removeItem(SESSION_BUILD_START_MS_KEY)
        localStorage.removeItem("aiccore_nickname")
        localStorage.removeItem("aiccore_flows_count")
        localStorage.removeItem("aiccore_achievements_count")
        setSession(null)
        setStats(null)
        setIframeLoaded(false)
        setIsSubmitted(false)
        setSubmitError(null)
        setServerBuildWindowOpen(null)
        setMissionBuildPhase(null)
        setIsBeforeStart(false)
        setHasActiveChallenge(false)
        setChallengeInfo(null)
        autoSubmitFiredRef.current = false
    }

    useEffect(() => {
        if (!session || isSubmitted) return

        const checkStatus = async () => {
            try {
                const apiBase = getApiBase()
                const response = await fetch(`${apiBase}/api/v1/aiccore/session/${session.id}/status`, {
                    credentials: "include",
                    headers: sessionAuthHeaders(session),
                })

                if (response.status === 403) {
                    handleReset()
                    return
                }
                if (response.status === 404) {
                    handleReset()
                    return
                }
                if (!response.ok) return

                const data = await response.json()
                if (data.is_submitted) {
                    setIsSubmitted(true)
                }
                if (typeof data.disable_auto_submit === "boolean") {
                    localStorage.setItem("aiccore_disable_auto_submit", String(data.disable_auto_submit));
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
        const savedToken = localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)
        const savedName = localStorage.getItem("aiccore_nickname")
        const savedFlows = localStorage.getItem("aiccore_flows_count")
        const savedAchs = localStorage.getItem("aiccore_achievements_count")

        if (savedId && savedName && savedToken) {
            setSession({ id: savedId, nickname: savedName, token: savedToken })
            if (savedFlows !== null && savedAchs !== null) {
                setStats({ flows: Number(savedFlows), achievements: Number(savedAchs) })
            }
        } else if (savedId || savedName || savedToken) {
            localStorage.removeItem("aiccore_session_id")
            localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
            localStorage.removeItem("aiccore_nickname")
        }
    }, [])

    const [lastEventId, setLastEventId] = useState(0)

    useEffect(() => {
        let destroyed = false
        let timeoutId: ReturnType<typeof setTimeout>

        const poll = async () => {
            if (destroyed) return
            try {
                const url = `${getApiBase()}/api/v1/aiccore/events/poll?last_id=${lastEventId}&timeout=15`
                const res = await fetch(url)
                if (!res.ok) throw new Error("Poll failed")
                const data = await res.json()
                
                if (destroyed) return

                const events = data.events || []
                let newLastId = lastEventId

                events.forEach((eventWrapper: any) => {
                    const msg = eventWrapper.data
                    newLastId = Math.max(newLastId, eventWrapper.id)

                    try {
                        if (msg.type === "ADMIN_BROADCAST") {
                            setBroadcast(msg.message)
                            setTimeout(() => setBroadcast(null), 10000)
                        }
                        if (msg.type === "SYSTEM_FINALIZE") {
                            setIsSystemLocked(true)
                        }
                        if (msg.type === "MISSION_LIVE" && msg.data?.title) {
                            const t = msg.data.title as string
                            setBroadcast(`Mission live: ${t} — your build timer starts now (if scheduled).`)
                            setTimeout(() => setBroadcast(null), 12000)
                            refreshMissionRef.current()
                        }
                    } catch (err) {
                        console.error("Poll message parse error:", err)
                    }
                })

                if (newLastId > lastEventId) {
                    setLastEventId(newLastId)
                } else {
                    poll()
                }
            } catch (err) {
                if (!destroyed) {
                    timeoutId = setTimeout(poll, 3000)
                }
            }
        }

        poll()

        return () => {
            destroyed = true
            if (timeoutId) clearTimeout(timeoutId)
        }
    }, [lastEventId])

    useEffect(() => {
        if (!session) return
        void refreshMissionFromServer()
        const interval = setInterval(() => {
            void refreshMissionFromServer()
        }, 10000)
        return () => clearInterval(interval)
    }, [session, refreshMissionFromServer])

    useEffect(() => {
        if (!session || isSubmitted || !isBeforeStart) return
        const id = setInterval(() => void refreshMissionFromServer(), 2000)
        return () => clearInterval(id)
    }, [session, isSubmitted, isBeforeStart, refreshMissionFromServer])

    useEffect(() => {
        const onVis = () => {
            if (typeof document === "undefined" || document.visibilityState !== "visible") return
            if (sessionRef.current) void refreshMissionRef.current()
        }
        document.addEventListener("visibilitychange", onVis)
        return () => document.removeEventListener("visibilitychange", onVis)
    }, [])

    const handleSubmit = useCallback(async (): Promise<boolean> => {
        if (!session || isSubmitting || isSubmitted) return false
        setIsSubmitting(true)
        setSubmitError(null)
        try {
            const apiBase = getApiBase()
            const res = await fetch(`${apiBase}/api/v1/aiccore/session/${session.id}/submit`, {
                method: "POST",
                credentials: "include",
                headers: sessionAuthHeaders(session),
            })
            if (res.ok) {
                setIsSubmitted(true)
                return true
            }
            let msg = `Submit failed (${res.status})`
            try {
                const err = await res.json()
                const d = err?.detail
                msg = typeof d === "string" ? d : msg
            } catch {
                /* ignore */
            }
            setSubmitError(msg)
            return false
        } catch (e) {
            console.error("Submission failed:", e)
            setSubmitError("Network error — try again.")
            return false
        } finally {
            setIsSubmitting(false)
        }
    }, [session, isSubmitting, isSubmitted])

    const challengeTickKey = challengeInfo
        ? `${challengeInfo.mode}:${challengeInfo.start_time ?? ""}:${challengeInfo.duration}:${challengeInfo.missionBuildEndsAt ?? ""}`
        : ""

    useEffect(() => {
        autoSubmitFiredRef.current = false
    }, [challengeTickKey])

    useEffect(() => {
        if (!challengeInfo || isSubmitted || isSystemLocked) return

        const timer = setInterval(() => {
            const start = new Date(challengeInfo.start_time).getTime()
            const end =
                challengeInfo.mode === "mission" && challengeInfo.missionBuildEndsAt
                    ? new Date(challengeInfo.missionBuildEndsAt).getTime()
                    : start + challengeInfo.duration * 60 * 1000
            const now = skewedNow()

            if (challengeInfo.mode === "mission") {
                // `mission_build_window_open === false` means both "before start" and "after end";
                // only treat as before start when `now` is still before the scheduled start instant.
                const beforeStart =
                    serverBuildWindowOpen === null
                        ? now < start
                        : serverBuildWindowOpen === false && now < start
                if (beforeStart) {
                    setIsBeforeStart(true)
                    setTimeLeft(null)
                    return
                }
            }

            setIsBeforeStart(false)
            const remaining = Math.max(0, Math.floor((end - now) / 1000))
            setTimeLeft(remaining)

            if (remaining === 0 && !isSubmitted && !isSystemLocked) {
                const disableAuto = localStorage.getItem("aiccore_disable_auto_submit") === "true";
                if (disableAuto) {
                    console.log("🚫 Auto-submit disabled by config.");
                    return;
                }
                if (autoSubmitFiredRef.current) return
                autoSubmitFiredRef.current = true
                void handleSubmit().then((ok) => {
                    if (!ok) autoSubmitFiredRef.current = false
                })
                // Do not clearInterval here: on failure we retry next tick; on success isSubmitted
                // flips true and this effect's cleanup disposes the interval.
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [challengeInfo, isSubmitted, isSystemLocked, handleSubmit, serverBuildWindowOpen])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    if (!session) {
        return (
            <LockScreen
                onUnlock={handleUnlock}
                prefillPin={lockScreenPrefillPin ?? undefined}
                onPrefillConsumed={clearLockScreenPrefill}
            />
        )
    }

    const isChallengeFinalized = challengeInfo?.isFinalized === true
    /** Scheduled mission: Submit only while server reports the build window open (or legacy client window). */
    const missionSubmitBlocked =
        challengeInfo?.mode === "mission" &&
        (serverBuildWindowOpen === false ||
            (serverBuildWindowOpen === null &&
                challengeInfo.start_time &&
                (() => {
                    const startMs = new Date(challengeInfo.start_time).getTime()
                    const endMs = challengeInfo.missionBuildEndsAt
                        ? new Date(challengeInfo.missionBuildEndsAt).getTime()
                        : startMs + challengeInfo.duration * 60 * 1000
                    const t = skewedNow()
                    return t < startMs || t >= endMs
                })()))
    /** Mission / round is over on the server — "Start over" is misleading; offer sign-out only. */
    const missionRoundEnded =
        isChallengeFinalized ||
        isSystemLocked ||
        (isSubmitted && !hasActiveChallenge)
    /** Submitted while others may still be building — station may reset for an early exit. */
    const showProminentStartOver = isSubmitted && hasActiveChallenge && !isChallengeFinalized && !isSystemLocked

    if ((isSubmitted || isSystemLocked || isChallengeFinalized)) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f111c] overflow-hidden">
                <div className="absolute inset-0 bg-primary/5 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />

                <div className="relative flex flex-col items-center gap-6 text-center p-8 max-w-md z-20">
                    <Trophy className="h-16 w-16 text-amber-400" />

                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold text-foreground">
                            {isChallengeFinalized
                                ? "Challenge Finalized"
                                : isSystemLocked
                                  ? "Time's Up"
                                  : missionRoundEnded
                                    ? "Mission complete"
                                    : "All Done!"}
                        </h1>
                        <p className="text-muted-foreground leading-relaxed">
                            {isChallengeFinalized
                                ? "The host has finalized this challenge. No more submissions are accepted."
                                : isSystemLocked
                                  ? "The challenge has ended. Your work has been saved."
                                  : missionRoundEnded
                                    ? "This round is over. Your submission is saved — you can close this window or sign out so the next guest can use this station."
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

                    {showProminentStartOver ? (
                        <>
                            <p className="text-xs text-muted-foreground text-left leading-relaxed max-w-md">
                                Your submission is stored for the host. Use Start over only if you need to leave this
                                station before the round ends (for example, so someone else can unlock).
                            </p>

                            <button
                                type="button"
                                onClick={handleReset}
                                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] shadow-lg shadow-primary/20"
                            >
                                Start Over
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground text-left leading-relaxed max-w-md">
                                {missionRoundEnded
                                    ? "No need to “start” anything — the challenge is finished."
                                    : "Your submission is stored for the host."}
                            </p>

                            <button
                                type="button"
                                onClick={handleReset}
                                className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
                            >
                                Sign out (release station for next guest)
                            </button>
                        </>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
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

            <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <AiccoreLogo size={22} className="ring-1 ring-border shrink-0" />
                    <span className="text-[11px] font-bold tracking-wide text-foreground truncate min-w-0">
                        {AICCORE_MAKERSPACE}
                    </span>
                    <span className="text-muted-foreground/40 shrink-0">·</span>
                    <span className="text-sm text-muted-foreground truncate">{session.nickname}</span>
                </div>

                <div className="flex items-center gap-2">
                    <a
                        href={LANGFLOW_TEACH_WATCH_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                        <PlayCircle className="h-3 w-3 shrink-0" />
                        <span className="hidden sm:inline">Langflow tutorial</span>
                        <span className="sm:hidden">Video</span>
                    </a>

                    {missionBuildPhase === "after_end" || missionBuildPhase === "finalized" ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs font-medium">
                            <Clock className="h-3 w-3" />
                            <span>
                                {missionBuildPhase === "finalized"
                                    ? "Challenge finalized"
                                    : "Build window ended"}
                            </span>
                        </div>
                    ) : timeLeft !== null ? (
                        <div className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border",
                            timeLeft < 300
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse"
                                : "bg-secondary text-foreground border-border"
                        )}>
                            <Clock className="h-3 w-3" />
                            <span>{formatTime(timeLeft)}</span>
                        </div>
                    ) : missionBuildPhase === "before_start" || (missionBuildPhase === null && isBeforeStart) ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400 text-xs font-medium">
                            <Clock className="h-3 w-3" />
                            <span>Not started yet</span>
                        </div>
                    ) : null}

                    {hasChallengeInstructions && (
                        <button
                            type="button"
                            onClick={() => setChallengeInstructionsOpen(true)}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                        >
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="hidden sm:inline">Challenge instructions</span>
                        </button>
                    )}

                    <button
                        onClick={handleSubmit}
                        disabled={
                            isSubmitting ||
                            isSubmitted ||
                            isSystemLocked ||
                            missionSubmitBlocked ||
                            !hasActiveChallenge
                        }
                        className={cn(
                            "flex items-center gap-2 rounded-lg px-5 py-1.5 text-sm font-semibold transition-all active:scale-95",
                            (isSubmitting || missionSubmitBlocked || !hasActiveChallenge || isSystemLocked)
                                ? "bg-muted cursor-not-allowed opacity-40 text-muted-foreground"
                                : "bg-primary text-primary-foreground hover:opacity-90"
                        )}
                    >
                        <Rocket className={cn("h-3.5 w-3.5", isSubmitting && "animate-spin")} />
                        {isSubmitting ? "Submitting…" : "Submit"}
                    </button>

                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                    </button>
                </div>
            </header>

            {submitError && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-300">
                    <span className="min-w-0">{submitError}</span>
                    <button type="button" onClick={() => setSubmitError(null)} className="shrink-0 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-200 hover:bg-rose-500/20">
                        Dismiss
                    </button>
                </div>
            )}

            {hasChallengeInstructions && (
                <Sheet open={challengeInstructionsOpen} onOpenChange={setChallengeInstructionsOpen}>
                    <SheetContent side="right" className="flex h-full w-[min(100vw-0.5rem,24rem)] flex-col gap-0 overflow-hidden border-l border-border p-0 shadow-2xl sm:max-w-xl md:max-w-2xl rounded-l-2xl">
                        <SheetHeader className="space-y-2 border-b border-border bg-card/95 px-4 py-4 pr-12 text-left">
                            <SheetTitle className="text-base">Challenge instructions</SheetTitle>
                            <SheetDescription className="text-xs">
                                Preview handout while you keep building.
                            </SheetDescription>
                            {instructionFrameUrl && (
                                <a href={instructionFrameUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-secondary/80 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                    Open in new tab
                                </a>
                            )}
                        </SheetHeader>
                        <div className="flex min-h-0 flex-1 flex-col bg-muted/30">
                            {instructionText?.trim() && (
                                <div className="max-h-[38vh] shrink-0 overflow-y-auto border-b border-border px-4 py-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                                    {instructionText.trim()}
                                </div>
                            )}
                            {instructionFrameUrl && (
                                <iframe src={instructionFrameUrl} title="Challenge handout" className="flex-1 w-full border-0" />
                            )}
                        </div>
                    </SheetContent>
                </Sheet>
            )}

            <main className="relative flex-1">
                {langflowMisconfigured ? (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-8 text-center">
                        <p className="max-w-md text-sm text-muted-foreground">
                            Langflow connection error. Please refresh or notify technical staff.
                        </p>
                    </div>
                ) : (
                    <iframe
                        src={getLangflowUrlWithSession(session.id)}
                        className={cn("h-full w-full border-0 transition-opacity duration-300", !iframeLoaded && "opacity-0")}
                        onLoad={() => setIframeLoaded(true)}
                    />
                )}
                {!iframeLoaded && !langflowMisconfigured && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-3">
                        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        <p className="text-xs text-muted-foreground animate-pulse font-medium">Connecting to Langflow…</p>
                    </div>
                )}
            </main>
        </div>
    )
}
