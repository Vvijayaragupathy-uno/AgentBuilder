"use client"

import { useState, useEffect } from "react"
import { Trophy, Users, Calendar } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn, getApiBase } from "@/lib/utils"

interface Challenge {
    id: string
    title: string
    complexity_level: string
    is_finalized: boolean
    start_time: string | null
    registration_count: number
}

interface LeaderboardEntry {
    nickname: string
    is_winner: boolean
    mission: string | null
}

const COMPLEXITY_COLORS: Record<string, string> = {
    Beginner:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Intermediate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    Advanced:     "bg-rose-500/10 text-rose-400 border-rose-500/20",
}

export function ArenaArchive() {
    const [finalized, setFinalized] = useState<Challenge[]>([])
    const [winners, setWinners] = useState<LeaderboardEntry[]>([])

    useEffect(() => {
        const fetchData = async () => {
            const apiBase = getApiBase()
            try {
                const [challengesRes, leaderboardRes] = await Promise.all([
                    fetch(`${apiBase}/api/v1/aiccore/challenges`),
                    fetch(`${apiBase}/api/v1/aiccore/leaderboard`),
                ])
                if (challengesRes.ok) {
                    const data: Challenge[] = await challengesRes.json()
                    setFinalized(data.filter(c => c.is_finalized).reverse())
                }
                if (leaderboardRes.ok) {
                    const data: LeaderboardEntry[] = await leaderboardRes.json()
                    setWinners(data.filter(e => e.is_winner))
                }
            } catch { /* network error — ignore */ }
        }
        fetchData()
    }, [])

    if (finalized.length === 0) return null

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 px-1">
                <Trophy className="h-4 w-4 text-amber-400" />
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">The Archive</h2>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">— Past Missions</span>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
                {finalized.map(challenge => {
                    const winner = winners.find(w => w.mission === challenge.title)
                    return (
                        <div
                            key={challenge.id}
                            className="shrink-0 w-52 flex flex-col gap-3 glass rounded-xl border border-white/5 p-4"
                        >
                            {/* Header */}
                            <div className="flex flex-col gap-1.5">
                                <Badge
                                    variant="outline"
                                    className={cn("w-fit text-[9px]", COMPLEXITY_COLORS[challenge.complexity_level] ?? "")}
                                >
                                    {challenge.complexity_level}
                                </Badge>
                                <h3 className="text-xs font-black tracking-tight leading-snug text-foreground line-clamp-2">
                                    {challenge.title}
                                </h3>
                            </div>

                            {/* Meta */}
                            <div className="flex flex-col gap-1.5 text-[10px] text-muted-foreground">
                                {challenge.start_time && (
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="h-3 w-3 shrink-0" />
                                        <span>{new Date(challenge.start_time).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5">
                                    <Users className="h-3 w-3 shrink-0" />
                                    <span>{challenge.registration_count} participant{challenge.registration_count !== 1 ? "s" : ""}</span>
                                </div>
                            </div>

                            {/* Winner */}
                            <div className={cn(
                                "mt-auto rounded-lg px-3 py-2 flex items-center gap-2",
                                winner ? "bg-amber-500/10 border border-amber-500/20" : "bg-white/5 border border-white/5"
                            )}>
                                <Trophy className={cn("h-3 w-3 shrink-0", winner ? "text-amber-400" : "text-muted-foreground/40")} />
                                <span className={cn("text-[10px] font-bold truncate", winner ? "text-amber-300" : "text-muted-foreground/40")}>
                                    {winner ? winner.nickname : "No winner recorded"}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
