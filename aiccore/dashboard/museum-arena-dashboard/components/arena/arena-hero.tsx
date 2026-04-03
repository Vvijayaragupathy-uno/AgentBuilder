"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, getApiBase } from "@/lib/utils"

interface Challenge {
    id: string
    title: string
    complexity_level: string
    is_active: boolean
    is_registration_open: boolean
    registration_count: number
}

interface Student {
    status: "REGISTERED" | "CHECKED_IN" | "PARTICIPATING" | "SUBMITTED"
    mission: string | null
}

const COMPLEXITY_COLORS: Record<string, string> = {
    Beginner:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Intermediate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    Advanced:     "bg-rose-500/10 text-rose-400 border-rose-500/20",
}

type ArenaState = "live" | "registration" | "standby"

export function ArenaHero() {
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [students, setStudents] = useState<Student[]>([])

    const fetchData = async () => {
        const apiBase = getApiBase()
        try {
            const [challengesRes, leaderboardRes] = await Promise.all([
                fetch(`${apiBase}/api/v1/aiccore/challenges`),
                fetch(`${apiBase}/api/v1/aiccore/leaderboard`),
            ])
            if (challengesRes.ok) setChallenges(await challengesRes.json())
            if (leaderboardRes.ok) setStudents(await leaderboardRes.json())
        } catch { /* network error — ignore */ }
    }

    useEffect(() => {
        fetchData()
        const id = setInterval(fetchData, 10_000)
        return () => clearInterval(id)
    }, [])

    const activeChallenge   = challenges.find(c => c.is_active) ?? null
    const nextChallenge     = !activeChallenge ? (challenges.find(c => c.is_registration_open) ?? null) : null
    const displayChallenge  = activeChallenge ?? nextChallenge

    const arenaState: ArenaState = activeChallenge ? "live" : nextChallenge ? "registration" : "standby"

    // Stats scoped to the displayed challenge when one exists
    const scoped = displayChallenge
        ? students.filter(s => s.mission === displayChallenge.title)
        : students

    const building  = scoped.filter(s => s.status === "PARTICIPATING").length
    const checkedIn = scoped.filter(s => s.status === "CHECKED_IN").length
    const submitted = scoped.filter(s => s.status === "SUBMITTED").length
    const registered = displayChallenge ? displayChallenge.registration_count : students.length

    return (
        <div className="glass rounded-xl border border-white/5 overflow-hidden transition-all duration-500">
            {/* Main banner */}
            <div className="p-6 flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
                <div className="flex flex-col gap-2">
                    {/* State label */}
                    {arenaState === "live" && (
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Mission Live</span>
                            {displayChallenge && (
                                <Badge variant="outline" className={cn("text-[10px]", COMPLEXITY_COLORS[displayChallenge.complexity_level] ?? "")}>
                                    {displayChallenge.complexity_level}
                                </Badge>
                            )}
                        </div>
                    )}
                    {arenaState === "registration" && (
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400">Registration Open</span>
                            {displayChallenge && (
                                <Badge variant="outline" className={cn("text-[10px]", COMPLEXITY_COLORS[displayChallenge.complexity_level] ?? "")}>
                                    {displayChallenge.complexity_level}
                                </Badge>
                            )}
                        </div>
                    )}
                    {arenaState === "standby" && (
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Arena Standing By</span>
                    )}

                    {/* Challenge title or atmospheric copy */}
                    <h1 className={cn(
                        "text-2xl font-black tracking-tight leading-tight",
                        arenaState === "standby" ? "text-muted-foreground" : "text-foreground"
                    )}>
                        {displayChallenge
                            ? displayChallenge.title
                            : "The arena is quiet."}
                    </h1>
                    {arenaState === "standby" && (
                        <p className="text-sm text-muted-foreground/60">The next mission is being prepared.</p>
                    )}
                </div>

                {/* CTAs */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button asChild size="sm">
                        <Link href="/register">Register</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                        <Link href="/builder">I have a code</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/builder">Log in</Link>
                    </Button>
                </div>
            </div>

            {/* Stats bar — the arena's pulse */}
            <div className="grid grid-cols-4 divide-x divide-white/5 border-t border-white/5 bg-black/20">
                {[
                    { label: "Building",   value: building,  color: "text-amber-400",   dot: "bg-amber-400" },
                    { label: "Checked In", value: checkedIn, color: "text-cyan-400",    dot: "bg-cyan-400" },
                    { label: "Submitted",  value: submitted, color: "text-emerald-400", dot: "bg-emerald-400" },
                    { label: "Registered",  value: registered, color: "text-sky-400",     dot: "bg-sky-400" },
                ].map(({ label, value, color, dot }) => (
                    <div key={label} className="flex flex-col items-center justify-center py-3 px-2 gap-0.5">
                        <span className={cn("text-xl font-black tabular-nums", color)}>{value}</span>
                        <div className="flex items-center gap-1">
                            <span className={cn("h-1 w-1 rounded-full", dot)} />
                            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
