"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Calendar, MapPin, Clock, ArrowLeft, Rocket, FileText, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
    is_active: boolean
    is_finalized: boolean
    registration_count: number
    banner_image_url?: string
}

interface ChallengeDetailProps {
    challengeId: string
    onBack: () => void
}

export function ChallengeDetail({ challengeId, onBack }: ChallengeDetailProps) {
    const router = useRouter()
    const [challenge, setChallenge] = useState<Challenge | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchChallenge = async () => {
            try {
                const apiBase = getApiBase()
                const res = await fetch(`${apiBase}/api/v1/aiccore/challenges`)
                if (res.ok) {
                    const all = await res.json()
                    setChallenge(all.find((c: Challenge) => c.id === challengeId) ?? null)
                }
            } catch (err) {
                console.error(err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchChallenge()
    }, [challengeId])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
        )
    }

    if (!challenge) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
                <p className="text-sm font-bold text-muted-foreground">Challenge not found.</p>
                <Button variant="ghost" onClick={onBack} className="gap-2 text-xs uppercase tracking-widest">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Challenges
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Back + Register row */}
            <div className="flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors group"
                >
                    <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
                    Back to Challenges
                </button>
                <Button
                    onClick={() => router.push(`/register?challenge_id=${challenge.id}`)}
                    disabled={!challenge.is_registration_open}
                    className="h-8 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                >
                    {challenge.is_registration_open ? "Register" : "Registration Closed"}
                </Button>
            </div>

            {/* Hero area */}
            <div className="flex flex-col lg:flex-row gap-8 items-start">
                <div className="flex-1 space-y-4">
                    <Badge className={cn(
                        "text-[9px] font-black tracking-wider px-2.5 py-0.5 border-0 uppercase",
                        challenge.complexity_level === "Beginner" ? "bg-emerald-500 text-white" :
                            challenge.complexity_level === "Intermediate" ? "bg-amber-500 text-white" : "bg-rose-500 text-white"
                    )}>
                        {challenge.complexity_level}
                    </Badge>
                    <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase leading-[0.9]">
                        {challenge.title}
                    </h1>
                    <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-wider text-muted-foreground pt-1">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-primary" />
                            <span>{challenge.start_time ? new Date(challenge.start_time).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "TBD"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            <span>{challenge.location}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            <span>{challenge.duration_minutes} min</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-primary" />
                            <span>{challenge.registration_count}/{challenge.max_participants} registered</span>
                        </div>
                    </div>
                </div>

                {/* Banner image */}
                <div className="w-full lg:w-72 shrink-0">
                    <div className="relative rounded-2xl overflow-hidden ring-1 ring-border">
                        {challenge.banner_image_url ? (
                            <img src={challenge.banner_image_url} alt={challenge.title} className="w-full h-44 object-cover" />
                        ) : (
                            <div className="w-full h-44 bg-primary/5 flex items-center justify-center">
                                <Rocket className="h-14 w-14 text-primary/10 animate-pulse" />
                            </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
                            <div className={cn("h-1.5 w-1.5 rounded-full", challenge.is_registration_open ? "animate-pulse bg-emerald-400" : "bg-muted")} />
                            <span className="text-[9px] font-bold uppercase tracking-widest text-white/70">
                                {challenge.is_registration_open ? "Registration Open" : "Closed"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: description + why join */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="space-y-3">
                        <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                            <FileText className="h-4 w-4 text-primary" />
                            About
                        </h2>
                        <p className="text-sm text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">
                            {challenge.description}
                        </p>
                    </div>

                </div>

                {/* Right: registration card + location */}
                <div className="space-y-4">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="p-6">
                            <h3 className="text-sm font-black uppercase tracking-widest mb-3">Registration</h3>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-relaxed mb-5">
                                Registering generates your unique builder handle and a station unlock code.
                            </p>
                            <Button
                                onClick={() => router.push(`/register?challenge_id=${challenge.id}`)}
                                className="w-full h-11 font-black uppercase tracking-wider shadow-xl shadow-primary/20"
                                disabled={!challenge.is_registration_open}
                            >
                                {challenge.is_registration_open ? "Join Challenge" : "Registration Closed"}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => router.push(`/builder?challenge_id=${challenge.id}`)}
                                disabled={challenge.is_finalized || (!challenge.is_active && !challenge.is_registration_open)}
                                className="mt-3 w-full h-8 text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 hover:bg-primary/5 disabled:opacity-50"
                            >
                                Already registered? Open builder
                            </Button>
                            <p className="text-[9px] text-center mt-3 text-muted-foreground/60">
                                Limited to {challenge.max_participants} builders per session
                            </p>
                        </CardContent>
                    </Card>

                    <div className="p-4 rounded-xl glass border border-white/5 space-y-2">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Location</h4>
                        <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            <span className="text-sm font-bold">{challenge.location}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
