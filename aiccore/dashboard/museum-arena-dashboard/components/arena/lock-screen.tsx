"use client"

import React, { useState, useEffect } from "react"
import { cn, getApiBase, getOrCreateBuilderStationId } from "@/lib/utils"
import { Loader2, ArrowRight, CheckCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { AiccoreLogo, AICCORE_MAKERSPACE } from "@/components/arena/aiccore-logo"

interface Challenge {
    id: string
    title: string
    description: string
    complexity_level: string
    is_active?: boolean
    is_registration_open?: boolean
    is_finalized?: boolean
}

interface LockScreenProps {
    onUnlock: (sessionId: string, sessionToken: string, nickname: string, stats?: any) => void
    /** After Start Over, server returns a fresh one-time PIN — prefill the keypad. */
    prefillPin?: string
    onPrefillConsumed?: () => void
}

export function LockScreen({ onUnlock, prefillPin, onPrefillConsumed }: LockScreenProps) {
    const [view, setView] = useState<"unlock" | "register" | "login">("unlock")
    const [code, setCode] = useState("")
    const [nickname, setNickname] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [selectedChallenge, setSelectedChallenge] = useState<string>("")
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successCode, setSuccessCode] = useState<string | null>(null)
    const [isMounted, setIsMounted] = useState(false)
    const [arenaClosed, setArenaClosed] = useState<boolean | null>(null)

    useEffect(() => { setIsMounted(true) }, [])

    useEffect(() => {
        const base = getApiBase()
        if (!base) return
        fetch(`${base}/api/v1/aiccore/system/status`)
            .then(r => (r.ok ? r.json() : null))
            .then((j: { locked?: boolean } | null) => {
                if (j && typeof j.locked === "boolean") setArenaClosed(!!j.locked)
                else setArenaClosed(false)
            })
            .catch(() => setArenaClosed(false))
    }, [])

    useEffect(() => {
        if (!prefillPin || prefillPin.length !== 4) return
        setView("unlock")
        setCode(prefillPin.replace(/\D/g, "").slice(0, 4))
        setError(null)
        onPrefillConsumed?.()
    }, [prefillPin, onPrefillConsumed])

    useEffect(() => {
        if (view !== "register") return
        getApiBase() && fetch(`${getApiBase()}/api/v1/aiccore/challenges`)
            .then(r => r.json())
            .then(d => setChallenges(Array.isArray(d) ? d : []))
            .catch(console.error)
    }, [view])

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault()
        if (code.length !== 4) return
        setLoading(true)
        setError(null)
        try {
            const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null
            const challengeId = params?.get("challenge_id")?.trim() || undefined
            const res = await fetch(`${getApiBase()}/api/v1/aiccore/auth/unlock`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Each laptop gets its own ws-* id → multiple concurrent builders on the big TV mosaic
                body: JSON.stringify({
                    unlock_code: code,
                    station_id: getOrCreateBuilderStationId(),
                    ...(challengeId ? { challenge_id: challengeId } : {}),
                }),
                credentials: "include"
            })
            if (!res.ok) {
                let detail = "Unlock failed."
                try {
                    const err = await res.json()
                    const raw = err?.detail
                    detail =
                        typeof raw === "string"
                            ? raw
                            : Array.isArray(raw)
                                ? raw.map((x: { msg?: string }) => x?.msg).filter(Boolean).join(" ")
                                : detail
                } catch {
                    /* ignore */
                }
                throw new Error(detail)
            }
            const data = await res.json()
            onUnlock(data.session_id, data.session_token, data.nickname, data.stats)
        } catch (err: any) {
            setError(err?.message || "Unlock failed.")
            setCode("")
        } finally {
            setLoading(false)
        }
    }

    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault()
        if (view === "register" && (!nickname || !username || !password || !selectedChallenge)) return
        if (view === "login" && (!username || !password)) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`${getApiBase()}/api/v1/aiccore/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nickname: view === "register" ? nickname : undefined,
                    username,
                    password,
                    challenge_id: view === "register" ? selectedChallenge : undefined
                }),
                credentials: "include"
            })
            if (!res.ok) {
                const err = await res.json()
                const detail = typeof err.detail === "object" ? JSON.stringify(err.detail) : (err.detail || "")
                if (detail === "PASSWORD_REQUIRED") {
                    setView("login")
                    setError("That username already exists. Please sign in.")
                    return
                }
                if (detail === "INCORRECT_PASSWORD") throw new Error("Incorrect PIN.")
                throw new Error(detail || "Something went wrong.")
            }
            const data = await res.json()
            setSuccessCode(data.unlock_code)
            setTimeout(() => {
                setCode(data.unlock_code)
                setView("unlock")
                setSuccessCode(null)
                setError(null)
            }, 4000)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const inputClass = "h-11 w-full rounded-lg bg-secondary/60 px-4 text-sm border border-border focus:border-primary focus:outline-none transition-colors"

    // Must match server: POST /users → ensure_requested_challenge_registration (and list_challenges
    // already folds is_registration_open to false while a mission is live or finalized).
    const challengesForRegister = challenges.filter(c => c.is_registration_open === true)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm space-y-3">
                {arenaClosed === true && (
                    <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-100 leading-relaxed">
                        <p className="font-semibold text-amber-50">The arena is closed</p>
                        <p className="mt-1 text-amber-100/90">
                            PIN unlock is paused until staff opens the floor. You can still create an account for an{" "}
                            <span className="font-medium">upcoming</span> mission (not the live round).
                        </p>
                    </div>
                )}

                {/* Card */}
                <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">

                    {/* Header */}
                    <div className="mb-6 text-center">
                        <div className="flex justify-center mb-4">
                            <AiccoreLogo size={40} className="ring-1 ring-border shadow-sm" />
                        </div>
                        <h1 className="text-xl font-semibold text-foreground">
                            {view === "unlock" ? `Welcome to ${AICCORE_MAKERSPACE}` :
                                view === "register" ? "Create an Account" : "Sign In"}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {view === "unlock" ? "Enter your 4-digit PIN to start building." :
                                view === "register" ? "Fill in your details to get started." :
                                    "Enter your username and PIN."}
                        </p>
                        {view === "unlock" && (
                            <p className="mt-3 text-[11px] text-muted-foreground/90 leading-relaxed px-1">
                                Each PIN works <span className="font-semibold text-foreground">once</span> per unlock. After you leave
                                or tap Start Over, use the <span className="font-semibold text-foreground">new PIN</span> on this screen
                                or <span className="font-semibold text-foreground">Sign in</span> below to generate one.
                            </p>
                        )}
                    </div>

                    {/* Success state */}
                    {successCode ? (
                        <div className="flex flex-col items-center gap-4 py-2">
                            <CheckCircle className="h-10 w-10 text-emerald-400" />
                            <div className="text-center">
                                <p className="text-sm font-medium text-foreground">Account created!</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Your PIN — entering automatically…</p>
                            </div>
                            <div className="text-4xl font-black tracking-[0.3em] font-mono text-foreground py-4 px-6 rounded-xl bg-secondary w-full text-center">
                                {successCode}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Continuing in 4 seconds…</span>
                            </div>
                        </div>

                    /* PIN entry */
                    ) : view === "unlock" && isMounted ? (
                        <form onSubmit={handleUnlock} className="flex flex-col gap-4" suppressHydrationWarning>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={4}
                                placeholder="· · · ·"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                                className={cn(
                                    "h-20 w-full rounded-xl bg-secondary text-center font-mono text-5xl font-bold tracking-[0.4em] transition-colors",
                                    "border-2 border-border focus:border-primary focus:outline-none",
                                    "placeholder:text-muted-foreground/30",
                                    error && "border-destructive"
                                )}
                                disabled={loading || arenaClosed === true}
                                autoComplete="one-time-code"
                                ref={(el) => { if (el) el.focus() }}
                                suppressHydrationWarning
                            />

                            {error && <p className="text-xs text-destructive text-center">{error}</p>}

                            <button
                                type="submit"
                                disabled={loading || code.length !== 4 || arenaClosed === true}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40 hover:opacity-90"
                            >
                                {loading
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <><span>Start Building</span><ArrowRight className="h-4 w-4" /></>
                                }
                            </button>

                            <div className="flex justify-center gap-4 text-xs text-muted-foreground pt-1">
                                <button type="button" onClick={() => { setView("register"); setError(null) }} className="hover:text-foreground transition-colors underline underline-offset-4">
                                    New? Register
                                </button>
                                <span className="opacity-30">·</span>
                                <button type="button" onClick={() => { setView("login"); setError(null) }} className="hover:text-foreground transition-colors underline underline-offset-4">
                                    Sign in
                                </button>
                            </div>
                        </form>

                    /* Sign in */
                    ) : view === "login" ? (
                        <form onSubmit={handleAuthAction} className="flex flex-col gap-4">
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Username</label>
                                    <input
                                        placeholder="your_username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, "_"))}
                                        className={inputClass + " font-mono"}
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">PIN</label>
                                    <input
                                        type="password"
                                        placeholder="••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={inputClass}
                                        required
                                    />
                                </div>
                            </div>

                            {error && <p className="text-xs text-destructive">{error}</p>}

                            <button
                                type="submit"
                                disabled={loading || !username || !password}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40 hover:opacity-90"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Sign In</span><ArrowRight className="h-4 w-4" /></>}
                            </button>

                            <div className="flex justify-center gap-4 text-xs text-muted-foreground pt-1">
                                <button type="button" onClick={() => { setView("register"); setError(null) }} className="hover:text-foreground transition-colors underline underline-offset-4">
                                    New? Register
                                </button>
                                <span className="opacity-30">·</span>
                                <button type="button" onClick={() => { setView("unlock"); setError(null) }} className="hover:text-foreground transition-colors underline underline-offset-4">
                                    Back
                                </button>
                            </div>
                        </form>

                    /* Register */
                    ) : (
                        <form onSubmit={handleAuthAction} className="flex flex-col gap-4">
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                                        <input
                                            placeholder="PixelMaster"
                                            value={nickname}
                                            onChange={(e) => setNickname(e.target.value)}
                                            className={inputClass}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Username</label>
                                        <input
                                            placeholder="user_99"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, "_"))}
                                            className={inputClass + " font-mono"}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">PIN</label>
                                    <input
                                        type="password"
                                        placeholder="e.g. 1234"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={inputClass}
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Choose a Challenge</label>
                                    {challengesForRegister.length === 0 ? (
                                        <p className="text-[11px] text-muted-foreground leading-relaxed rounded-lg border border-border bg-secondary/30 px-3 py-2">
                                            {arenaClosed === true ? (
                                                <>
                                                    No mission is accepting sign-ups right now. Staff must either{" "}
                                                    <span className="font-medium text-foreground/90">open registration</span> on an upcoming
                                                    (not live) challenge, or{" "}
                                                    <span className="font-medium text-foreground/90">unlock the arena</span> so PIN entry works
                                                    for the live round.
                                                </>
                                            ) : (
                                                <>
                                                    Nothing is open for new sign-ups. The live round uses PIN only after you’re registered; if
                                                    this is the next event, ask staff to enable registration on that challenge.
                                                </>
                                            )}
                                        </p>
                                    ) : (
                                    <div className="flex flex-col gap-1.5 max-h-[130px] overflow-y-auto">
                                        {challengesForRegister.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => setSelectedChallenge(c.id)}
                                                className={cn(
                                                    "flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs border transition-colors",
                                                    selectedChallenge === c.id
                                                        ? "border-primary bg-primary/10 text-foreground"
                                                        : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                                                )}
                                            >
                                                <span className="font-medium capitalize">{c.title}</span>
                                                <Badge variant="outline" className={cn("text-[9px] px-1.5 border-0 ml-2 shrink-0",
                                                    c.complexity_level === "Beginner" ? "bg-emerald-500/15 text-emerald-400" :
                                                        c.complexity_level === "Intermediate" ? "bg-amber-500/15 text-amber-400" :
                                                            "bg-rose-500/15 text-rose-400"
                                                )}>
                                                    {c.complexity_level}
                                                </Badge>
                                            </button>
                                        ))}
                                    </div>
                                    )}
                                </div>
                            </div>

                            {error && <p className="text-xs text-destructive">{error}</p>}

                            <button
                                type="submit"
                                disabled={
                                    loading ||
                                    !nickname ||
                                    !username ||
                                    !selectedChallenge ||
                                    !password ||
                                    challengesForRegister.length === 0
                                }
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40 hover:opacity-90"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Create Account</span><ArrowRight className="h-4 w-4" /></>}
                            </button>

                            <div className="flex justify-center gap-4 text-xs text-muted-foreground pt-1">
                                <button type="button" onClick={() => { setView("login"); setError(null) }} className="hover:text-foreground transition-colors underline underline-offset-4">
                                    Already registered? Sign in
                                </button>
                                <span className="opacity-30">·</span>
                                <button type="button" onClick={() => { setView("unlock"); setError(null) }} className="hover:text-foreground transition-colors underline underline-offset-4">
                                    Back
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
