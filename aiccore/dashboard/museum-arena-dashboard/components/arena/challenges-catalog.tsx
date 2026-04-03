"use client"

import { useState, useEffect } from "react"
import { Calendar, MapPin, Users, ArrowRight, Rocket, Shield, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn, getApiBase } from "@/lib/utils"

interface Challenge {
    id: string
    title: string
    description: string
    complexity_level: string
    max_participants: number
    duration_minutes: number
    start_time: string | null
    location: string
    is_registration_open: boolean
    registration_count: number
    banner_image_url?: string
    starter_assets_url?: string
}

export function ChallengesCatalog({ onSelectChallenge }: { onSelectChallenge?: (id: string) => void }) {
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchChallenges = async () => {
            try {
                const apiBase = getApiBase()
                const res = await fetch(`${apiBase}/api/v1/aiccore/challenges`)
                if (res.ok) setChallenges(await res.json())
            } catch (err) {
                console.error(err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchChallenges()
    }, [])

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Subtle count line */}
            {!isLoading && challenges.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    {challenges.length} challenge{challenges.length !== 1 ? "s" : ""} available — register to compete
                </p>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="h-[380px] rounded-2xl bg-white/5 animate-pulse border border-white/5" />
                    ))
                ) : challenges.length === 0 ? (
                    <div className="col-span-full py-20 text-center glass rounded-3xl border-dashed">
                        <Rocket className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                        <p className="text-muted-foreground uppercase tracking-widest font-bold text-xs">No challenges scheduled yet.</p>
                    </div>
                ) : (
                    challenges.map(c => (
                        <div
                            key={c.id}
                            className="group relative flex flex-col rounded-2xl border border-white/5 bg-secondary/10 hover:bg-secondary/20 transition-all duration-500 overflow-hidden hover:border-primary/30"
                        >
                            {/* Banner */}
                            <div className="h-36 overflow-hidden relative">
                                {c.banner_image_url ? (
                                    <img src={c.banner_image_url} alt={c.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                ) : (
                                    <div className="w-full h-full bg-primary/5 flex items-center justify-center">
                                        <Shield className="h-10 w-10 text-primary/10" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                                <Badge className={cn(
                                    "absolute top-3 left-3 text-[8px] px-1.5 py-0 border-0 font-black tracking-tighter uppercase",
                                    c.complexity_level === "Beginner" ? "bg-emerald-500/80 text-white" :
                                        c.complexity_level === "Intermediate" ? "bg-amber-500/80 text-white" : "bg-rose-500/80 text-white"
                                )}>
                                    {c.complexity_level}
                                </Badge>
                                <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-full border border-white/10">
                                        <Users className="h-2.5 w-2.5 text-primary" />
                                        <span className="text-[8px] font-bold text-white uppercase tracking-tighter">{c.registration_count}/{c.max_participants}</span>
                                    </div>
                                    {c.starter_assets_url && (
                                        <div className="flex items-center gap-1 bg-emerald-500/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-emerald-400/20">
                                            <Sparkles className="h-2 w-2 text-white" />
                                            <span className="text-[7px] font-black text-white uppercase tracking-widest">Resources</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 pt-2 flex flex-col gap-2.5 flex-1">
                                <h3 className="text-lg font-black tracking-tight uppercase group-hover:text-primary transition-colors leading-tight">{c.title}</h3>
                                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed font-medium">
                                    {c.description}
                                </p>

                                <div className="mt-3 pt-3 flex flex-col gap-1.5 border-t border-white/5">
                                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        <div className="flex items-center gap-1.5 text-primary">
                                            <Calendar className="h-3 w-3" />
                                            <span>{c.start_time ? new Date(c.start_time).toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + new Date(c.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="h-3 w-3 text-primary" />
                                            <span>{c.location}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <div className={cn("h-1.5 w-1.5 rounded-full", c.is_registration_open ? "animate-pulse bg-emerald-400" : "bg-muted")} />
                                            <span className={cn("text-[10px] font-bold uppercase tracking-wider", c.is_registration_open ? "text-emerald-400" : "text-muted-foreground")}>
                                                {c.is_registration_open ? "Open" : "Closed"}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-mono text-muted-foreground/40">{c.duration_minutes} min</span>
                                    </div>
                                </div>

                                <Button
                                    className="mt-1 w-full h-9 text-[10px] font-black uppercase tracking-widest gap-2 bg-white/5 border border-white/10 text-foreground hover:bg-primary hover:text-white transition-all"
                                    onClick={() => onSelectChallenge?.(c.id)}
                                >
                                    View Details <ArrowRight className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
