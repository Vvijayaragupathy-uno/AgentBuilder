"use client"

import { useState, useEffect } from "react"
import { Calendar, MapPin, Users, ArrowRight, Rocket, Shield, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn, getApiBase } from "@/lib/utils"
import Link from "next/link"

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

export function ChallengesCatalog() {
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
        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Mission Hero Section - Portable Version */}
            <section className="relative py-12 mb-12 overflow-hidden rounded-3xl bg-primary/5 ring-1 ring-primary/10">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[300px] h-[300px] bg-primary/20 blur-[100px] rounded-full animate-pulse opacity-30"></div>
                </div>
                <div className="px-8 relative z-10">
                    <Badge variant="outline" className="mb-4 bg-primary/5 text-primary border-primary/20 px-3 py-1 text-[9px] font-black tracking-[0.2em] uppercase">Intelligence Briefing</Badge>
                    <h1 className="text-5xl font-black tracking-tighter uppercase italic leading-[0.85] mb-4">
                        Mission <br />
                        <span className="text-primary italic">Catalog</span>
                    </h1>
                    <p className="text-sm text-muted-foreground font-medium leading-relaxed max-w-lg">
                        Select an active deployment zone to begin building. Each mission earns unique badges and honors.
                    </p>
                </div>
            </section>

            {/* Tactical Catalog Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="h-[400px] rounded-2xl bg-white/5 animate-pulse border border-white/5" />
                    ))
                ) : challenges.length === 0 ? (
                    <div className="col-span-full py-20 text-center glass rounded-3xl border-dashed">
                        <Rocket className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                        <p className="text-muted-foreground uppercase tracking-widest font-bold text-xs">No active tactical deployments found.</p>
                    </div>
                ) : (
                    challenges.map(c => (
                        <div
                            key={c.id}
                            className="group relative flex flex-col rounded-2xl border border-white/5 bg-secondary/10 hover:bg-secondary/20 transition-all duration-500 overflow-hidden hover:border-primary/30"
                        >
                            {/* Banner */}
                            <div className="h-40 overflow-hidden relative">
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
                                        <span className="text-[8px] font-bold text-white uppercase tracking-tighter">{c.registration_count}/{c.max_participants} Units</span>
                                    </div>
                                    {c.starter_assets_url && (
                                        <div className="flex items-center gap-1 bg-emerald-500/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-emerald-400/20">
                                            <Sparkles className="h-2 w-2 text-white" />
                                            <span className="text-[7px] font-black text-white uppercase tracking-widest">Guidelines Attached</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-6 pt-2 flex flex-col gap-3 flex-1">
                                <h3 className="text-xl font-black tracking-tight uppercase group-hover:text-primary transition-colors leading-tight italic">{c.title}</h3>
                                <p className="text-[12px] text-muted-foreground line-clamp-3 leading-relaxed font-medium">
                                    {c.description}
                                </p>

                                <div className="mt-4 pt-4 flex flex-col gap-2 border-t border-white/5">
                                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        <div className="flex items-center gap-1.5 text-primary">
                                            <Calendar className="h-3.5 w-3.5" />
                                            <span>{c.start_time ? new Date(c.start_time).toLocaleDateString([], { month: 'short', day: 'numeric' }) : "TBD"}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="h-3.5 w-3.5 text-primary" />
                                            <span>{c.location}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", c.is_registration_open ? "bg-emerald-400" : "bg-muted")} />
                                            <span className={cn("text-[10px] font-bold uppercase tracking-widest", c.is_registration_open ? "text-emerald-400" : "text-muted-foreground")}>
                                                {c.is_registration_open ? "Reg Open" : "Deployment Locked"}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-mono text-muted-foreground/40">{c.duration_minutes} MIN MISSION</span>
                                    </div>
                                </div>

                                <Link href={`/challenges/${c.id}`} className="mt-1">
                                    <Button className="w-full h-9 text-[10px] font-black uppercase tracking-widest gap-2 bg-white/5 border border-white/10 hover:bg-primary hover:text-white transition-all">
                                        View Directive <ArrowRight className="h-3 w-3" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
