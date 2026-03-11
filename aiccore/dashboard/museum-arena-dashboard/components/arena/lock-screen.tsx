"use client"

import React, { useState, useEffect } from "react"
import { cn, getApiBase } from "@/lib/utils"
import {
    Loader2,
    ArrowRight,
    Rocket,
    Sparkles,
    Fingerprint,
    UserPlus,
    Users
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface Challenge {
    id: string
    title: string
    description: string
    complexity_level: string
}

interface LockScreenProps {
    onUnlock: (sessionId: string, nickname: string, stats?: any) => void
}

export function LockScreen({ onUnlock }: LockScreenProps) {
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
    const [selectedStats, setSelectedStats] = useState<any>(null)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    useEffect(() => {
        if (view === "register") {
            const fetchChallenges = async () => {
                try {
                    const apiBase = getApiBase()
                    const response = await fetch(`${apiBase}/api/v1/aiccore/challenges`)
                    const data = await response.json()
                    setChallenges(Array.isArray(data) ? data : [])
                } catch (err) {
                    console.error("Failed to fetch challenges:", err)
                }
            }
            fetchChallenges()
        }
    }, [view])

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault()
        if (code.length !== 4) return

        setLoading(true)
        setError(null)

        try {
            const apiBase = getApiBase()
            const response = await fetch(`${apiBase}/api/v1/aiccore/auth/unlock`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ unlock_code: code }),
                credentials: "include"
            })

            if (!response.ok) {
                const err = await response.json()
                const detailStr = typeof err.detail === 'object' ? JSON.stringify(err.detail) : (err.detail || "Invalid code")
                throw new Error(detailStr)
            }

            const data = await response.json()
            onUnlock(data.session_id, data.nickname, data.stats)
        } catch (err: any) {
            setError(err.message || "Access Denied")
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
            const apiBase = getApiBase()
            const response = await fetch(`${apiBase}/api/v1/aiccore/users`, {
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

            if (!response.ok) {
                const err = await response.json()
                const detailStr = typeof err.detail === 'object' ? JSON.stringify(err.detail) : (err.detail || "Action failed")

                if (detailStr === "PASSWORD_REQUIRED") {
                    if (view === "register") {
                        setView("login")
                        setError("Handle already in use. Please sign in with your PIN.")
                        return
                    }
                    throw new Error("PIN/Password required.")
                }
                if (detailStr === "INCORRECT_PASSWORD") {
                    throw new Error("Incorrect Password.")
                }
                if (detailStr.toLowerCase().includes("nickname") && detailStr.toLowerCase().includes("required")) {
                    throw new Error("Account not found. Please click 'Create Profile' below.")
                }
                throw new Error(detailStr)
            }

            const data = await response.json()
            setSuccessCode(data.unlock_code)
            setSelectedStats(data.stats)

            // Auto-transition after showing the code
            setTimeout(() => {
                setCode(data.unlock_code)
                setView("unlock")
                setSuccessCode(null)
                setError(null)
            }, 5000)
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 blur-[120px] rounded-full animate-pulse-slow font-sans"></div>
            </div>

            <div className="relative mx-auto flex w-full max-w-[420px] flex-col items-center gap-8 p-6 text-center animate-in fade-in zoom-in duration-500">
                <div className="relative group transition-transform hover:scale-105 duration-300">
                    <div className="absolute -inset-4 rounded-3xl bg-primary/20 blur-2xl animate-pulse group-hover:bg-primary/30 transition-colors" />
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-black ring-1 ring-primary/30 shadow-2xl shadow-primary/20">
                        {view === "unlock" ? <Fingerprint className="h-12 w-12 text-primary" /> : <Users className="h-12 w-12 text-primary" />}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-black tracking-tighter text-foreground uppercase italic leading-none">
                        {view === "unlock" ? "Station Access" :
                            view === "register" ? "Join the Mission" : "Builder Sign-in"}
                    </h1>
                    <p className="text-sm text-muted-foreground font-medium px-4">
                        {view === "unlock" ? "Enter your 4-digit code to initialize the building deck." :
                            view === "register" ? "Create your builder profile to start creating agents." :
                                "Enter your handle and PIN to generate a new station code."}
                    </p>
                </div>

                {successCode ? (
                    <div className="flex w-full flex-col gap-6 p-8 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 animate-in zoom-in duration-300">
                        <div className="flex flex-col gap-2">
                            <Sparkles className="h-8 w-8 text-emerald-400 mx-auto animate-bounce" />
                            <h2 className="text-xl font-bold text-emerald-400">Success!</h2>
                            <p className="text-xs text-muted-foreground uppercase font-mono tracking-widest">Your Station Unlock Code</p>
                        </div>
                        <div className="text-6xl font-black tracking-[0.2em] text-white font-mono bg-black/40 py-6 rounded-2xl shadow-inner border border-white/5">
                            {successCode}
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            <p className="text-[10px] text-muted-foreground uppercase font-medium">Auto-navigating in 5s...</p>
                        </div>
                    </div>
                ) : view === "unlock" && isMounted ? (
                    <form onSubmit={handleUnlock} className="flex w-full flex-col gap-6 w-full" suppressHydrationWarning>
                        <div className="relative group">
                            <input
                                type="text"
                                maxLength={4}
                                placeholder="0000"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                                className={cn(
                                    "h-24 w-full rounded-3xl bg-secondary/30 text-center font-mono text-6xl font-black tracking-[0.5em] transition-all",
                                    "border-2 border-white/5 focus:border-primary/50 focus:bg-secondary/50 focus:outline-none focus:ring-8 focus:ring-primary/5",
                                    "shadow-inner placeholder:opacity-10",
                                    error && "border-destructive/50 focus:border-destructive/50 focus:ring-destructive/10"
                                )}
                                disabled={loading}
                                autoComplete="one-time-code"
                                autoCorrect="off"
                                spellCheck="false"
                                ref={(input) => input && input.focus()}
                                suppressHydrationWarning
                            />
                        </div>

                        {error && <p className="text-xs font-bold text-destructive uppercase tracking-wider animate-bounce">{error}</p>}

                        <div className="flex flex-col gap-3">
                            <button
                                type="submit"
                                disabled={loading || code.length !== 4}
                                className={cn(
                                    "group relative flex h-16 items-center justify-center rounded-2xl font-black text-sm uppercase tracking-[0.15em] transition-all",
                                    "bg-primary text-primary-foreground hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-primary/20",
                                    "disabled:cursor-not-allowed disabled:opacity-50"
                                )}
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Unlock Station"}
                                {!loading && <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1" />}
                            </button>

                            <div className="flex items-center justify-center gap-6 mt-2">
                                <button type="button" onClick={() => { setView("register"); setError(null); }} className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">
                                    New? <span className="text-primary underline underline-offset-4 decoration-primary/30">Create Profile</span>
                                </button>
                                <div className="h-3 w-px bg-white/10" />
                                <button type="button" onClick={() => { setView("login"); setError(null); }} className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">
                                    Returning? <span className="text-primary underline underline-offset-4 decoration-primary/30">Sign In</span>
                                </button>
                            </div>
                        </div>
                    </form>
                ) : view === "login" ? (
                    <form onSubmit={handleAuthAction} className="flex w-full flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="space-y-4">
                            <div className="space-y-1 text-left">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground pl-1 tracking-widest">Unique Handle</label>
                                <input
                                    placeholder="e.g. user_99"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, "_"))}
                                    className="h-14 w-full rounded-2xl bg-secondary/50 px-5 text-sm font-bold border border-white/5 focus:border-primary/50 focus:outline-none transition-all font-mono"
                                    required
                                />
                            </div>
                            <div className="space-y-1 text-left">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground pl-1 tracking-widest">PIN / Password</label>
                                <input
                                    type="password"
                                    placeholder="••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-14 w-full rounded-2xl bg-secondary/50 px-5 text-sm font-bold border border-white/5 focus:border-primary/50 focus:outline-none transition-all"
                                    required
                                />
                            </div>
                        </div>

                        {error && <p className="text-[10px] font-bold text-destructive uppercase tracking-widest">{error}</p>}

                        <div className="flex flex-col gap-4">
                            <button
                                type="submit"
                                disabled={loading || !username || !password}
                                className={cn(
                                    "group relative flex h-16 items-center justify-center rounded-2xl font-black text-sm uppercase tracking-[0.15em] transition-all",
                                    "bg-primary text-primary-foreground hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-primary/20",
                                    "disabled:cursor-not-allowed disabled:opacity-50"
                                )}
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Recover Station Access"}
                                {!loading && <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1" />}
                            </button>

                            <div className="flex items-center justify-center gap-6 mt-2">
                                <button type="button" onClick={() => { setView("register"); setError(null); }} className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">
                                    New? <span className="text-primary underline underline-offset-4 decoration-primary/30">Create Profile</span>
                                </button>
                                <div className="h-3 w-px bg-white/10" />
                                <button type="button" onClick={() => { setView("unlock"); setError(null); }} className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">
                                    Back to <span className="text-primary underline underline-offset-4 decoration-primary/30">Unlock</span>
                                </button>
                            </div>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleAuthAction} className="flex w-full flex-col gap-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1 text-left">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground pl-1 tracking-widest">Display Nickname</label>
                                    <input
                                        placeholder="e.g. PixelMaster"
                                        value={nickname}
                                        onChange={(e) => setNickname(e.target.value)}
                                        className="h-12 w-full rounded-xl bg-secondary/50 px-4 text-xs font-bold border border-white/5 focus:border-primary/50 focus:outline-none transition-all"
                                        required
                                    />
                                </div>
                                <div className="space-y-1 text-left">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground pl-1 tracking-widest">Unique Handle</label>
                                    <input
                                        placeholder="e.g. user_99"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, "_"))}
                                        className="h-12 w-full rounded-xl bg-secondary/50 px-4 text-xs font-bold border border-white/5 focus:border-primary/50 focus:outline-none transition-all font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1 text-left">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground pl-1 tracking-widest">Security PIN / Password</label>
                                <input
                                    type="password"
                                    placeholder="e.g. 1234"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-12 w-full rounded-xl bg-secondary/50 px-4 text-xs font-bold border border-white/5 focus:border-primary/50 focus:outline-none transition-all"
                                    required
                                />
                            </div>

                            <div className="space-y-1 text-left">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground pl-1 tracking-widest">Choose Your Challenge</label>
                                <div className="grid grid-cols-1 gap-2 max-h-[140px] overflow-y-auto pr-1">
                                    {challenges.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setSelectedChallenge(c.id)}
                                            className={cn(
                                                "relative flex flex-col gap-1 rounded-xl p-3 text-left transition-all",
                                                "border border-white/5 bg-secondary/30 hover:bg-secondary/50",
                                                selectedChallenge === c.id ? "border-primary/50 bg-primary/10 ring-1 ring-primary/50 opacity-100" : "opacity-60"
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-bold text-foreground capitalize">{c.title}</span>
                                                <Badge className={cn("text-[8px] px-1.5 py-0 border-0", c.complexity_level === "Beginner" ? "bg-emerald-500/20 text-emerald-400" : c.complexity_level === "Intermediate" ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400")}>
                                                    {c.complexity_level}
                                                </Badge>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground leading-tight line-clamp-1">{c.description}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {error && <p className="text-[10px] font-bold text-destructive uppercase tracking-widest">{error}</p>}

                        <div className="flex flex-col gap-3">
                            <button
                                type="submit"
                                disabled={loading || !nickname || !username || !selectedChallenge || !password}
                                className={cn(
                                    "group relative flex h-16 items-center justify-center rounded-2xl font-black text-sm uppercase tracking-[0.15em] transition-all",
                                    "bg-white text-black hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-white/10",
                                    "disabled:cursor-not-allowed disabled:opacity-50"
                                )}
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Initialize Agent Builder"}
                                {!loading && <Rocket className="ml-3 h-5 w-5 transition-transform group-hover:-translate-y-1" />}
                            </button>

                            <div className="flex items-center justify-center gap-6 mt-2">
                                <button type="button" onClick={() => { setView("login"); setError(null); }} className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">
                                    Returning? <span className="text-primary underline underline-offset-4 decoration-primary/30">Sign In</span>
                                </button>
                                <div className="h-3 w-px bg-white/10" />
                                <button type="button" onClick={() => { setView("unlock"); setError(null); }} className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">
                                    Have Code? <span className="text-primary underline underline-offset-4 decoration-primary/30">Unlock</span>
                                </button>
                            </div>
                        </div>
                    </form>
                )}

                <div className="flex items-center gap-1.5 opacity-30 mt-2">
                    <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
                    <p className="text-[9px] text-muted-foreground uppercase tracking-[0.3em] font-mono">STATION_LOCAL • SYSTEM_V1</p>
                </div>
            </div>

            <style jsx global>{`
                @keyframes pulse-slow {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.05; }
                    50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.1; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 10s ease-in-out infinite;
                }
            `}</style>
        </div>
    )
}
