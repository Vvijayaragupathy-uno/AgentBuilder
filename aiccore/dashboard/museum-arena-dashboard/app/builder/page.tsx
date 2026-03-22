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
    getLangflowUrl,
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
    const [isBeforeStart, setIsBeforeStart] = useState(false)
    /** Server truth for scheduled missions — avoids disabled Submit when client clock ≠ UTC start instant. */
    const [serverBuildWindowOpen, setServerBuildWindowOpen] = useState<boolean | null>(null)
    const [demoInfo, setDemoInfo] = useState<{
        myPosition?: number
        total: number
        gateOpen: boolean
    } | null>(null)
    const [demoJoining, setDemoJoining] = useState(false)
    const [demoQueueError, setDemoQueueError] = useState<string | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const autoSubmitFiredRef = useRef(false)
    /** `null` until client reads `?practice=1` — avoids hydrating the wrong branch. */
    const [practiceMode, setPracticeMode] = useState<boolean | null>(null)
    const [practiceError, setPracticeError] = useState<string | null>(null)
    /** After Start Over, server issues a new one-time PIN (old PIN was consumed at unlock). */
    const [lockScreenPrefillPin, setLockScreenPrefillPin] = useState<string | null>(null)
    const practiceModeRef = useRef(false)
    const [langflowMisconfigured, setLangflowMisconfigured] = useState(false)

    useEffect(() => {
        practiceModeRef.current = practiceMode === true
    }, [practiceMode])

    useEffect(() => {
        const p = new URLSearchParams(window.location.search).get("practice") === "1"
        setPracticeMode(p)
    }, [])

    useEffect(() => {
        setLangflowMisconfigured(isLangflowIframeMisconfigured())
    }, [])

    const clearLockScreenPrefill = useCallback(() => setLockScreenPrefillPin(null), [])

    const refreshMissionFromServer = useCallback(async () => {
        if (!session) return
        if (practiceMode === true) {
            setHasActiveChallenge(false)
            setChallengeInfo(null)
            setServerBuildWindowOpen(null)
            setIsBeforeStart(false)
            setTimeLeft(null)
            setInstructionText(null)
            setInstructionFrameUrl(null)
            return
        }
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
                    if (typeof status.mission_build_window_open === "boolean") {
                        setServerBuildWindowOpen(status.mission_build_window_open)
                        setIsBeforeStart(!status.mission_build_window_open)
                    } else {
                        setServerBuildWindowOpen(null)
                        setIsBeforeStart(skewedNow() < new Date(status.start_time).getTime())
                    }
                } else {
                    setServerBuildWindowOpen(null)
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
                        missionBuildEndsAt: null,
                    })
                    setIsBeforeStart(false)
                }
            } else {
                setChallengeInfo(null)
                setServerBuildWindowOpen(null)
                setTimeLeft(null)
                setInstructionText(null)
                setInstructionFrameUrl(null)
            }
        } catch {
            /* ignore */
        }
    }, [session, practiceMode])

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
        // Per-seat build window (used when mission has duration but no mission-level start_time)
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
        setDemoInfo(null)
        setDemoQueueError(null)
        setDemoJoining(false)
        setSubmitError(null)
        setServerBuildWindowOpen(null)
        setIsBeforeStart(false)
        setHasActiveChallenge(false)
        setChallengeInfo(null)
        autoSubmitFiredRef.current = false
    }

    // Poll for submission status
    useEffect(() => {
        if (!session || !isSubmitted) return
        const loadDemo = async () => {
            try {
                const res = await fetch(
                    `${getApiBase()}/api/v1/aiccore/demo/status?session_id=${session.id}`,
                    { credentials: "include" }
                )
                if (res.ok) {
                    const d = await res.json()
                    setDemoInfo({
                        myPosition: d.my_position,
                        total: d.queue_length ?? 0,
                        gateOpen: !!d.gate_open,
                    })
                }
            } catch { /* ignore */ }
        }
        loadDemo()
        const id = setInterval(loadDemo, 5000)
        return () => clearInterval(id)
    }, [session, isSubmitted])

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
                    console.warn("Session token missing or stale. Resetting...")
                    handleReset()
                    return
                }

                if (response.status === 404) {
                    console.warn("Session expired or purged. Resetting...")
                    handleReset()
                    return
                }

                if (!response.ok) return

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

    // Load session from storage if it exists (skip when /builder?practice=1 — that flow uses admin bootstrap)
    useEffect(() => {
        if (practiceMode !== false) return // null: undecided; true: admin bootstrap
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
    }, [practiceMode])

    // Admin Practice: POST /auth/practice-session (requires aiccore_admin; cross-origin needs SameSite=None cookie from admin-login)
    useEffect(() => {
        if (practiceMode !== true || session) return
        let cancelled = false
        setPracticeError(null)
        ;(async () => {
            try {
                const apiBase = getApiBase()
                const res = await fetch(`${apiBase}/api/v1/aiccore/auth/practice-session`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ station_id: getOrCreateBuilderStationId() }),
                })
                if (cancelled) return
                if (!res.ok) {
                    let msg = res.status === 403 ? "Admin login required — use Admin Access on the dashboard, then open Practice again." : `Could not start practice (${res.status})`
                    try {
                        const err = await res.json()
                        const d = err?.detail
                        if (typeof d === "string") msg = d
                    } catch {
                        /* ignore */
                    }
                    setPracticeError(msg)
                    return
                }
                const data = await res.json()
                const sid = data.session_id as string
                const token = data.session_token as string
                const nick = (data.nickname as string) || "Practice"
                setSession({ id: sid, nickname: nick, token })
                localStorage.setItem("aiccore_session_id", sid)
                localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token)
                localStorage.setItem("aiccore_nickname", nick)
                const st = data.stats as { flows_count?: number; achievements_count?: number } | undefined
                if (st) {
                    setStats({
                        flows: st.flows_count ?? 0,
                        achievements: st.achievements_count ?? 0,
                    })
                    localStorage.setItem("aiccore_flows_count", String(st.flows_count ?? 0))
                    localStorage.setItem("aiccore_achievements_count", String(st.achievements_count ?? 0))
                }
            } catch {
                if (!cancelled) setPracticeError("Network error — check connection and try again.")
            }
        })()
        return () => {
            cancelled = true
        }
    }, [practiceMode, session])

    const [lastEventId, setLastEventId] = useState(0)

    // HTTPS Event Polling — replacement for Broadcasts & Ceremony WebSocket
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
                        if (msg.type === "SYSTEM_FINALIZE" && !practiceModeRef.current) {
                            setIsSystemLocked(true)
                        }
                        if (msg.type === "MISSION_LIVE" && msg.data?.title) {
                            const t = msg.data.title as string
                            setBroadcast(`Mission live: ${t} — your build timer starts now (if scheduled).`)
                            setTimeout(() => setBroadcast(null), 12000)
                            refreshMissionRef.current()
                        }
                        if (
                            (msg.type === "DEMO_GATE_OPEN" ||
                                msg.type === "DEMO_QUEUE_UPDATE" ||
                                msg.type === "SUBMISSION_UPDATE") &&
                            sessionRef.current
                        ) {
                            const sid = sessionRef.current.id
                            void fetch(
                                `${getApiBase()}/api/v1/aiccore/demo/status?session_id=${sid}`,
                                { credentials: "include" }
                            )
                                .then(r => (r.ok ? r.json() : null))
                                .then(d => {
                                    if (!d) return
                                    setDemoInfo({
                                        myPosition: d.my_position,
                                        total: d.queue_length ?? 0,
                                        gateOpen: !!d.gate_open,
                                    })
                                })
                                .catch(() => { /* ignore */ })
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

    // Pick up mission_build_window_open soon after scheduled start (don't wait only on 10s poll).
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

    const handleSubmit = useCallback(async () => {
        if (!session || isSubmitting || isSubmitted) return
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
                return
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
        } catch (e) {
            console.error("Submission failed:", e)
            setSubmitError("Network error — try again.")
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

    const handleJoinDemoQueue = useCallback(async () => {
        if (!session) return
        setDemoJoining(true)
        setDemoQueueError(null)
        try {
            const res = await fetch(
                `${getApiBase()}/api/v1/aiccore/session/${session.id}/demo-queue`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        ...sessionAuthHeaders(session),
                    },
                }
            )
            if (!res.ok) {
                let msg = `Could not join (${res.status})`
                try {
                    const err = await res.json()
                    const d = err?.detail
                    msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => x?.msg).filter(Boolean).join(" ") : msg
                } catch {
                    /* ignore */
                }
                setDemoQueueError(msg)
                return
            }
            const st = await fetch(
                `${getApiBase()}/api/v1/aiccore/demo/status?session_id=${session.id}`,
                { credentials: "include" }
            )
            if (st.ok) {
                const d = await st.json()
                setDemoInfo({
                    myPosition: d.my_position,
                    total: d.queue_length ?? 0,
                    gateOpen: !!d.gate_open,
                })
            }
        } catch (e) {
            console.error("Demo queue join failed:", e)
            setDemoQueueError("Network error — check connection and try again.")
        } finally {
            setDemoJoining(false)
        }
    }, [session])

    // Timer: at 0s calls submit once (each browser). Mission mode = shared deadline; per_seat = from unlock.
    useEffect(() => {
        if (!challengeInfo || practiceMode === true) return

        const timer = setInterval(() => {
            const start = new Date(challengeInfo.start_time).getTime()
            const end =
                challengeInfo.mode === "mission" && challengeInfo.missionBuildEndsAt
                    ? new Date(challengeInfo.missionBuildEndsAt).getTime()
                    : start + challengeInfo.duration * 60 * 1000
            const now = skewedNow()

            if (challengeInfo.mode === "mission") {
                const beforeStart =
                    serverBuildWindowOpen === null ? now < start : !serverBuildWindowOpen
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
                if (autoSubmitFiredRef.current) return
                autoSubmitFiredRef.current = true
                void handleSubmit()
                clearInterval(timer)
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [challengeInfo, isSubmitted, isSystemLocked, handleSubmit, serverBuildWindowOpen, practiceMode])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    if (practiceMode === null) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f111c]">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
        )
    }

    if (practiceMode === true && !session) {
        if (practiceError) {
            return (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f111c] p-8 text-center gap-4">
                    <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{practiceError}</p>
                    <a
                        href="/"
                        target="_top"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-primary hover:underline"
                    >
                        Back to dashboard
                    </a>
                </div>
            )
        }
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f111c] gap-3">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-xs text-muted-foreground">Opening practice builder…</p>
            </div>
        )
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

    if ((isSubmitted || isSystemLocked || isChallengeFinalized) && practiceMode !== true) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f111c] overflow-hidden">
                <div className="absolute inset-0 bg-primary/5 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />

                <div className="relative flex flex-col items-center gap-6 text-center p-8 max-w-md z-20">
                    <Trophy className="h-16 w-16 text-amber-400" />

                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold text-foreground">
                            {isChallengeFinalized ? "Challenge Finalized" : isSystemLocked ? "Time's Up" : "All Done!"}
                        </h1>
                        <p className="text-muted-foreground leading-relaxed">
                            {isChallengeFinalized 
                                ? "The host has finalized this challenge. No more submissions are accepted."
                                : isSystemLocked
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

                    {isSubmitted && (
                        <div className="w-full flex flex-col gap-3 rounded-2xl bg-primary/5 p-5 ring-1 ring-primary/20 text-left">
                            <div className="flex items-center gap-2">
                                <Megaphone className="h-5 w-5 text-primary shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Present your flow?</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Join the demo queue so the host can show your Langflow canvas on the main screen after the build phase ends (or when everyone building has submitted).
                                    </p>
                                </div>
                            </div>
                            {demoInfo?.gateOpen && typeof demoInfo.myPosition === "number" && (
                                <p className="text-xs font-medium text-amber-400">
                                    Demos are running — watch the main display. You are #{demoInfo.myPosition} of {demoInfo.total}.
                                </p>
                            )}
                            {demoInfo?.gateOpen && typeof demoInfo.myPosition !== "number" && (
                                <p className="text-xs font-medium text-muted-foreground">
                                    Build phase ended — the TV may be in demo or queue mode. Tap Join demo queue if you have not yet (you need a queue spot to be shown full screen).
                                </p>
                            )}
                            {demoInfo && typeof demoInfo.myPosition === "number" && !demoInfo.gateOpen && (
                                <p className="text-xs text-muted-foreground">
                                    You are <strong className="text-foreground">#{demoInfo.myPosition}</strong> of{" "}
                                    <strong className="text-foreground">{demoInfo.total}</strong> in the demo queue.
                                </p>
                            )}
                            {typeof demoInfo?.myPosition !== "number" && (
                                <>
                                    {demoQueueError && (
                                        <p className="text-xs font-medium text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/20 rounded-lg px-3 py-2">
                                            {demoQueueError}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleJoinDemoQueue}
                                        disabled={demoJoining}
                                        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/15 font-semibold text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
                                    >
                                        {demoJoining ? "Joining…" : "Join demo queue"}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    <p className="text-xs text-muted-foreground text-left leading-relaxed max-w-md">
                        Your submission is stored for the host (Review in the dashboard). Each successful unlock uses up
                        that PIN — <strong className="text-foreground">Start Over</strong> ends this session and the next
                        screen shows a <strong className="text-foreground">new PIN</strong> so you can open the builder again.
                        Or use <strong className="text-foreground">Sign in</strong> on the lock screen anytime to get a fresh PIN.
                    </p>

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
                <div className="flex items-center gap-3 min-w-0">
                    <AiccoreLogo size={22} className="ring-1 ring-border shrink-0" />
                    <span className="text-[11px] font-bold tracking-wide text-foreground truncate min-w-0">
                        {AICCORE_MAKERSPACE}
                    </span>
                    <span className="text-muted-foreground/40 shrink-0">·</span>
                    <span className="text-sm text-muted-foreground truncate">{session.nickname}</span>
                    {practiceMode === true && (
                        <span className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                            Practice
                        </span>
                    )}
                </div>

                {/* Right: tutorial · timer · instructions (if any) · submit · exit */}
                <div className="flex items-center gap-2">
                    <a
                        href={LANGFLOW_TEACH_WATCH_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Same 5-part Langflow walkthrough as the main screen — open on your phone while you build"
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                        <PlayCircle className="h-3 w-3 shrink-0" />
                        <span className="hidden sm:inline">Langflow tutorial</span>
                        <span className="sm:hidden">Video</span>
                    </a>
                    {/* Timer — hidden in admin Practice (no scored mission) */}
                    {practiceMode !== true && (
                        <>
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
                        </>
                    )}

                    {hasChallengeInstructions && practiceMode !== true && (
                        <button
                            type="button"
                            onClick={() => setChallengeInstructionsOpen(true)}
                            title="Open instructions in a side panel next to the builder (or use Open in new tab inside)"
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                        >
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="hidden sm:inline">Challenge instructions</span>
                            <span className="sm:hidden">Guide</span>
                        </button>
                    )}

                    {/* Submit — the primary action (not shown in sandbox Practice) */}
                    {practiceMode !== true && (
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
                    )}

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

            {submitError && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-300">
                    <span className="min-w-0">{submitError}</span>
                    <button
                        type="button"
                        onClick={() => setSubmitError(null)}
                        className="shrink-0 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-200 hover:bg-rose-500/20"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {hasChallengeInstructions && practiceMode !== true && (
                <Sheet open={challengeInstructionsOpen} onOpenChange={setChallengeInstructionsOpen}>
                    <SheetContent
                        side="right"
                        className="flex h-full w-[min(100vw-0.5rem,24rem)] flex-col gap-0 overflow-hidden border-l border-border p-0 shadow-2xl sm:max-w-xl md:max-w-2xl rounded-l-2xl"
                    >
                        <SheetHeader className="space-y-2 border-b border-border bg-card/95 px-4 py-4 pr-12 text-left">
                            <SheetTitle className="text-base">Challenge instructions</SheetTitle>
                            <SheetDescription className="text-xs leading-relaxed">
                                Preview here while you keep building. If the document stays blank, it may block embedding — use the link below.
                            </SheetDescription>
                            {instructionFrameUrl && (
                                <a
                                    href={instructionFrameUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-secondary/80 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                                >
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                    Open handout in new tab
                                </a>
                            )}
                        </SheetHeader>
                        <div className="flex min-h-0 flex-1 flex-col bg-muted/30">
                            {instructionText?.trim() && (
                                <div className="max-h-[38vh] shrink-0 overflow-y-auto border-b border-border px-4 py-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                                    {instructionText.trim()}
                                </div>
                            )}
                            {instructionFrameUrl ? (
                                <iframe
                                    src={instructionFrameUrl}
                                    title="Challenge instructions handout"
                                    className="min-h-[45vh] flex-1 w-full border-0"
                                />
                            ) : (
                                <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
                                    Text-only briefing — use the mission description on the TV if you need more context.
                                </div>
                            )}
                        </div>
                    </SheetContent>
                </Sheet>
            )}

            {/* Builder iframe */}
            <main className="relative flex-1">
                {langflowMisconfigured ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background p-8 text-center">
                        <p className="text-sm font-semibold text-amber-400">Langflow URL points at this dashboard</p>
                        <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
                            The embedded builder tried to load the same host as the Next.js app, so you see the dashboard inside the iframe.
                            Set <code className="rounded bg-secondary px-1">NEXT_PUBLIC_LANGFLOW_URL</code> and{" "}
                            <code className="rounded bg-secondary px-1">NEXT_PUBLIC_AICCORE_API_URL</code> to your{" "}
                            <strong className="text-foreground">AgentBuilder / Langflow</strong> Railway URL, or enable the same-origin proxy with{" "}
                            <code className="rounded bg-secondary px-1">NEXT_PUBLIC_AICCORE_PROXY_PREFIX</code> and{" "}
                            <code className="rounded bg-secondary px-1">AICCORE_UPSTREAM_URL</code> (see <code className="rounded bg-secondary px-1">aiccore/README.md</code>).
                        </p>
                        <a
                            href="/"
                            target="_top"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            Back to dashboard
                        </a>
                    </div>
                ) : (
                    <>
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
                            title={AICCORE_MAKERSPACE}
                        />
                    </>
                )}
            </main>
        </div>
    )
}
