"use client"

import { useState, useEffect } from "react"
import { Calendar, MapPin, Users, ArrowRight, ExternalLink, Shield, Rocket, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"
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
}

export default function ChallengesPage() {
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchChallenges = async () => {
            try {
                const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
                const res = await fetch(`http://${host}:7860/api/v1/aiccore/challenges`)
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
        <div className="min-h-screen bg-[#0f111c] text-white selection:bg-primary/30 selection:text-primary-foreground">
            {/* Nav */}
            <nav className="sticky top-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 h-16">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 transition-all group-hover:scale-110">
                            <Shield className="h-5 w-5 text-primary" />
                        </div>
                        <span className="font-black tracking-tighter uppercase italic text-lg">AICCORE <span className="text-muted-foreground opacity-50">Platform</span></span>
                    </Link>
                    <div className="flex gap-4">
                        <Link href="/builder">
                            <Button variant="ghost" className="text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors">Builder Portal</Button>
                        </Link>
                        <Link href="/register">
                            <Button className="text-xs font-bold uppercase tracking-widest shadow-lg shadow-primary/20">Sign Up</Button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative py-24 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full animate-pulse opacity-20"></div>
                </div>
                <div className="mx-auto max-w-7xl px-6 relative">
                    <div className="max-w-3xl">
                        <Badge variant="outline" className="mb-6 bg-primary/5 text-primary border-primary/20 px-4 py-1.5 text-[10px] font-black tracking-[0.2em] uppercase">Mission Briefings</Badge>
                        <h1 className="text-6xl md:text-8xl font-black tracking-tighter uppercase italic leading-[0.85] mb-8">
                            Mission <br />
                            <span className="text-primary italic">Catalog</span>
                        </h1>
                        <p className="text-lg text-muted-foreground font-medium leading-relaxed max-w-xl">
                            Register for upcoming AI Building events at the museum. Design complex agents, compete for top honors, and earn exclusive digital badges.
                        </p>
                    </div>
                </div>
            </section>

            {/* Catalog */}
            <section className="pb-32 mx-auto max-w-7xl px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {isLoading ? (
                        Array(6).fill(0).map((_, i) => (
                            <div key={i} className="h-[450px] rounded-3xl bg-white/5 animate-pulse border border-white/5" />
                        ))
                    ) : challenges.length === 0 ? (
                        <div className="col-span-full py-20 text-center">
                            <p className="text-muted-foreground uppercase tracking-widest font-bold">No challenges currently scheduled.</p>
                        </div>
                    ) : (
                        challenges.map(c => (
                            <Link
                                href={`/challenges/${c.id}`}
                                key={c.id}
                                className="group relative flex flex-col rounded-3xl border border-white/5 bg-secondary/10 hover:bg-secondary/20 transition-all duration-500 hover:-translate-y-2 overflow-hidden hover:border-primary/30"
                            >
                                {/* Banner */}
                                <div className="h-48 overflow-hidden relative">
                                    {c.banner_image_url ? (
                                        <img src={c.banner_image_url} alt={c.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                    ) : (
                                        <div className="w-full h-full bg-primary/5 flex items-center justify-center">
                                            <Rocket className="h-12 w-12 text-primary/20" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f111c] to-transparent" />
                                    <Badge className={cn(
                                        "absolute top-4 left-4 text-[10px] px-2 py-0.5 border-0 font-black tracking-tighter",
                                        c.complexity_level === "Beginner" ? "bg-emerald-500/80 text-white" :
                                            c.complexity_level === "Intermediate" ? "bg-amber-500/80 text-white" : "bg-rose-500/80 text-white"
                                    )}>
                                        {c.complexity_level.toUpperCase()}
                                    </Badge>
                                </div>

                                <div className="p-8 pt-2 flex flex-col gap-4 flex-1">
                                    <h3 className="text-2xl font-black tracking-tight uppercase group-hover:text-primary transition-colors">{c.title}</h3>
                                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed font-medium">
                                        {c.description}
                                    </p>

                                    <div className="mt-auto pt-6 flex flex-col gap-3 border-t border-white/5">
                                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3.5 w-3.5 text-primary" />
                                                <span>{c.start_time ? new Date(c.start_time).toLocaleDateString([], { month: 'long', day: 'numeric' }) : "TBD"}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Users className="h-3.5 w-3.5 text-primary" />
                                                <span>{c.registration_count}/{c.max_participants} JOINED</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <MapPin className="h-3.5 w-3.5 text-primary" />
                                                <span>{c.location}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", c.is_registration_open ? "bg-emerald-400" : "bg-muted")} />
                                                <span className={c.is_registration_open ? "text-emerald-400" : "text-muted-foreground"}>
                                                    {c.is_registration_open ? "OPEN" : "CLOSED"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between group/btn">
                                        <span className="text-[10px] font-black uppercase text-primary tracking-[0.2em] group-hover/btn:translate-x-1 transition-transform">View Details</span>
                                        <div className="h-8 w-8 rounded-full border border-primary/20 flex items-center justify-center group-hover/btn:bg-primary/20 transition-all">
                                            <ArrowRight className="h-4 w-4 text-primary" />
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </section>
        </div>
    )
}
