"use client"

import { useState, useEffect } from "react"
import { Rocket, Clock, Users, MapPin, ArrowRight, Timer, Zap, KeyRound, Send } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, getApiBase } from "@/lib/utils"

interface Challenge {
    id: string
    title: string
    description: string
    complexity_level: string
    start_time: string | null
    duration_minutes: number | null
    location: string | null
    registration_count: number
    max_participants: number
    is_active: boolean
    is_registration_open: boolean
}

const COMPLEXITY_COLORS: Record<string, string> = {
    Beginner:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Intermediate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    Advanced:     "bg-rose-500/10 text-rose-400 border-rose-500/20",
}

export function LiveChallenges({
    onViewAll,
    onSelectChallenge,
}: {
    onViewAll?: () => void
    onSelectChallenge?: (id: string) => void
}) {
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [loading, setLoading] = useState(true)

    const fetchChallenges = async () => {
        try {
            const apiBase = getApiBase()
            const res = await fetch(`${apiBase}/api/v1/aiccore/challenges`)
            if (res.ok) {
                const data = await res.json()
                setChallenges(data.filter((c: Challenge) => c.is_active || c.is_registration_open))
            }
        } catch { } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchChallenges()
        const interval = setInterval(fetchChallenges, 10000)
        return () => clearInterval(interval)
    }, [])

    // Show the most relevant challenge: active first, then registration-open
    const featured = challenges.find(c => c.is_active) ?? challenges[0] ?? null

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-primary animate-bounce-slow" />
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">The Field</h2>
                </div>
                <button
                    onClick={onViewAll}
                    className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
                >
                    All Challenges →
                </button>
            </div>

            {/* Featured challenge card */}
            {featured ? (
                <Card className="flex-1 glass border-white/5 hover:border-primary/30 hover:bg-primary/5 hover:ring-1 hover:ring-primary/20 transition-all duration-300">
                    <CardContent className="p-5 flex flex-col gap-4 h-full">
                        {/* Title + badge */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                {featured.is_active && (
                                    <Badge className="bg-emerald-500 text-white border-0 text-[8px] font-black uppercase">Live</Badge>
                                )}
                                <Badge variant="outline" className={cn("text-[9px]", COMPLEXITY_COLORS[featured.complexity_level] ?? "")}>
                                    {featured.complexity_level}
                                </Badge>
                            </div>
                            <h3 className="text-base font-black tracking-tight leading-snug text-foreground uppercase">
                                {featured.title}
                            </h3>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                            {featured.description}
                        </p>

                        {/* Metadata grid */}
                        <div className="grid grid-cols-2 gap-2 mt-auto">
                            {featured.start_time && (
                                <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-black/30 border border-white/5">
                                    <div className="flex items-center gap-1 text-[8px] font-bold text-muted-foreground uppercase">
                                        <Clock className="h-2.5 w-2.5" /> Start
                                    </div>
                                    <span className="text-[11px] font-mono font-bold text-foreground">
                                        {new Date(featured.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>
                            )}
                            {featured.duration_minutes && (
                                <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-black/30 border border-white/5">
                                    <div className="flex items-center gap-1 text-[8px] font-bold text-muted-foreground uppercase">
                                        <Timer className="h-2.5 w-2.5" /> Duration
                                    </div>
                                    <span className="text-[11px] font-mono font-bold text-foreground">
                                        {featured.duration_minutes}m
                                    </span>
                                </div>
                            )}
                            {featured.location && (
                                <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-black/30 border border-white/5">
                                    <div className="flex items-center gap-1 text-[8px] font-bold text-muted-foreground uppercase">
                                        <MapPin className="h-2.5 w-2.5" /> Location
                                    </div>
                                    <span className="text-[11px] font-bold text-foreground truncate">
                                        {featured.location}
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-black/30 border border-white/5">
                                <div className="flex items-center gap-1 text-[8px] font-bold text-muted-foreground uppercase">
                                    <Users className="h-2.5 w-2.5" /> Participants
                                </div>
                                <span className="text-[11px] font-mono font-bold text-foreground">
                                    {featured.registration_count}/{featured.max_participants}
                                </span>
                            </div>
                        </div>

                        <Button
                            className="w-full h-9 text-[10px] font-black uppercase tracking-widest gap-2 bg-white/5 border border-white/10 text-foreground hover:bg-primary hover:text-white transition-all"
                            onClick={() => onSelectChallenge?.(featured.id)}
                        >
                            Full Details <ArrowRight className="h-3 w-3" />
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <Card className="flex-1 glass border-white/5">
                    <CardContent className="p-6 h-full flex flex-col gap-5">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-sm font-black uppercase tracking-widest text-foreground">How it works</h3>
                            <p className="text-[10px] text-muted-foreground">Join a timed mission. Build an AI agent. Compete.</p>
                        </div>

                        <div className="flex flex-col gap-3">
                            {[
                                { icon: KeyRound, step: "1", label: "Register", detail: "Create your handle and set a PIN to get your deployment code." },
                                { icon: Zap,      step: "2", label: "Unlock a station", detail: "Enter your 4-digit code at any builder station to start a session." },
                                { icon: Rocket,   step: "3", label: "Build", detail: "Use Langflow to construct your AI agent before the timer runs out." },
                                { icon: Send,     step: "4", label: "Submit", detail: "Submit your flow to enter the leaderboard and compete for the win." },
                            ].map(({ icon: Icon, step, label, detail }) => (
                                <div key={step} className="flex items-start gap-3">
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20">
                                        <Icon className="h-3 w-3 text-primary" />
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[11px] font-bold text-foreground">{label}</span>
                                        <span className="text-[10px] text-muted-foreground leading-relaxed">{detail}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={onViewAll}
                            className="mt-auto text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest text-left"
                        >
                            Browse past challenges →
                        </button>
                    </CardContent>
                </Card>
            )}

            {/* Additional upcoming challenges (if more than 1) */}
            {challenges.filter(c => c.id !== featured!.id).length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-1">Also upcoming</p>
                    {challenges.filter(c => c.id !== featured.id).slice(0, 2).map(c => (
                        <button
                            key={c.id}
                            onClick={() => onSelectChallenge?.(c.id)}
                            className="flex items-center justify-between glass rounded-lg border border-white/5 px-3 py-2 hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
                        >
                            <span className="text-xs font-bold text-foreground truncate">{c.title}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 ml-2" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
