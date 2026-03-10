"use client"

import { useState, useEffect } from "react"
import { Rocket, Clock, Users, ArrowRight, ShieldCheck, Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface Challenge {
    id: string
    title: string
    description: string
    complexity_level: string
    start_time: string | null
    registration_count: number
    max_participants: number
    is_active: boolean
    is_registration_open: boolean
}

export function LiveChallenges() {
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [loading, setLoading] = useState(true)

    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

    const fetchChallenges = async () => {
        try {
            const res = await fetch(`http://${host}:7860/api/v1/aiccore/challenges`)
            if (res.ok) {
                const data = await res.json()
                // Only show active or open challenges for spectator deck
                setChallenges(data.filter((c: Challenge) => c.is_active || c.is_registration_open))
            }
        } catch (e) { } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchChallenges()
        const interval = setInterval(fetchChallenges, 10000)
        return () => clearInterval(interval)
    }, [])

    if (loading && challenges.length === 0) return null

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-primary animate-bounce-slow" />
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Active Missions</h2>
                </div>
                <Link href="/challenges" className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">View Catalog</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto pb-4 custom-scrollbar">
                {challenges.length === 0 && (
                    <Card className="glass border-white/5 opacity-50 col-span-full">
                        <CardContent className="p-8 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Waiting for Command Center to publish missions...
                        </CardContent>
                    </Card>
                )}
                {challenges.map(c => (
                    <Card key={c.id} className={cn(
                        "group relative overflow-hidden transition-all duration-500 hover:-translate-y-1",
                        c.is_active ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20" : "glass border-white/5"
                    )}>
                        {c.is_active && (
                            <div className="absolute top-0 right-0 p-2">
                                <Badge className="bg-emerald-500 text-white border-0 text-[8px] font-black uppercase">Live Mission</Badge>
                            </div>
                        )}
                        <CardContent className="p-5 flex flex-col gap-4">
                            <div className="space-y-1.5 flex flex-col items-start">
                                <Badge variant="outline" className={cn(
                                    "text-[8px] px-1.5 py-0 h-4 border-white/10 font-bold uppercase",
                                    c.complexity_level === "Beginner" ? "text-emerald-400" :
                                        c.complexity_level === "Intermediate" ? "text-amber-400" : "text-rose-400"
                                )}>
                                    {c.complexity_level}
                                </Badge>
                                <h3 className="text-sm font-black tracking-tight leading-snug group-hover:text-primary transition-colors uppercase italic">{c.title}</h3>
                            </div>

                            <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed min-h-[30px]">
                                {c.description}
                            </p>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <div className="flex flex-col gap-1 p-2 rounded-lg bg-black/40 border border-white/5">
                                    <div className="flex items-center gap-1 text-[8px] font-bold text-muted-foreground uppercase">
                                        <Clock className="h-2 w-2" /> Start
                                    </div>
                                    <span className="text-[10px] font-mono font-bold text-foreground">
                                        {c.start_time ? new Date(c.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "TBD"}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 p-2 rounded-lg bg-black/40 border border-white/5">
                                    <div className="flex items-center gap-1 text-[8px] font-bold text-muted-foreground uppercase">
                                        <Users className="h-2 w-2" /> Units
                                    </div>
                                    <span className="text-[10px] font-mono font-bold text-foreground">{c.registration_count}/{c.max_participants}</span>
                                </div>
                            </div>

                            <Link href={`/challenges/${c.id}`} className="mt-1">
                                <Button className="w-full h-9 text-[10px] font-black uppercase tracking-widest gap-2 bg-white/5 border border-white/10 hover:bg-primary hover:text-white transition-all">
                                    Intercept Mission <ArrowRight className="h-3 w-3" />
                                </Button>
                            </Link>

                        </CardContent>
                    </Card>
                ))}
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    height: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(var(--primary), 0.5);
                }
                @keyframes bounce-slow {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
                .animate-bounce-slow {
                    animation: bounce-slow 2s ease-in-out infinite;
                }
            `}</style>
        </div>
    )
}
