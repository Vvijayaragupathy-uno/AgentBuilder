"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import {
    Calendar, MapPin, Users, ArrowLeft, Shield, CheckCircle2,
    Rocket, Sparkles, Clock, AlertCircle, FileText, ImageIcon
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
}

export default function ChallengeDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const [challenge, setChallenge] = useState<Challenge | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isRegistering, setIsRegistering] = useState(false)
    const [registered, setRegistered] = useState(false)

    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

    useEffect(() => {
        const fetchChallenge = async () => {
            try {
                const apiBase = getApiBase()
                const res = await fetch(`${apiBase}/api/v1/aiccore/challenges`)
                if (res.ok) {
                    const all = await res.json()
                    const found = all.find((c: any) => c.id === params.id)
                    setChallenge(found || null)
                }
            } catch (err) {
                console.error(err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchChallenge()
    }, [params.id])

    const handleRegister = async () => {
        // Redirect to a registration flow that includes creating an account
        router.push(`/register?challenge_id=${challenge?.id}`)
    }

    if (isLoading) return <div className="h-screen w-screen bg-[#0f111c] flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>

    if (!challenge) return (
        <div className="h-screen w-screen bg-[#0f111c] flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl font-black uppercase italic mb-4">Mission Not Found</h1>
            <p className="text-muted-foreground mb-8">This mission directive ID does not exist or has been retired.</p>
            <Link href="/challenges"><Button className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Catalog</Button></Link>
        </div>
    )

    return (
        <div className="min-h-screen bg-[#0f111c] text-white overflow-x-hidden">
            {/* Nav */}
            <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-black/40 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 h-16">
                    <Link href="/challenges" className="flex items-center gap-2 group text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-white transition-all">
                        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                        Back to Challenges
                    </Link>
                    <div className="flex gap-4">
                        <Button onClick={handleRegister} className="h-9 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                            Register for Event
                        </Button>
                    </div>
                </div>
            </nav>

            {/* Header / Banner */}
            <header className="relative pt-32 pb-12 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none opacity-20">
                    <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/20 blur-[150px] rounded-full"></div>
                </div>

                <div className="mx-auto max-w-7xl px-6 relative flex flex-col lg:flex-row gap-12 items-end">
                    <div className="flex-1">
                        <Badge className={cn(
                            "mb-6 text-[10px] font-black tracking-[0.2em] px-3 py-1 border-0 uppercase italic",
                            challenge.complexity_level === "Beginner" ? "bg-emerald-500 text-white" :
                                challenge.complexity_level === "Intermediate" ? "bg-amber-500 text-white" : "bg-rose-500 text-white"
                        )}>
                            Mission Complexity: {challenge.complexity_level}
                        </Badge>
                        <h1 className="text-5xl md:text-8xl font-black tracking-tighter uppercase italic leading-[0.85] mb-8 animate-in fade-in slide-in-from-left-8 duration-700">
                            {challenge.title.split(' ').map((word, i) => (
                                <span key={i} className={i % 2 === 1 ? "text-primary italic" : ""}>{word} </span>
                            ))}
                        </h1>
                        <div className="flex flex-wrap gap-6 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-primary" />
                                <span>{challenge.start_time ? new Date(challenge.start_time).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "TBD"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-primary" />
                                <span>{challenge.location}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-primary" />
                                <span>{challenge.duration_minutes} Minutes</span>
                            </div>
                        </div>
                    </div>

                    {/* Visual Card */}
                    <div className="w-full lg:w-96 shrink-0">
                        <Card className="glass overflow-hidden border-white/5 relative group">
                            {challenge.banner_image_url ? (
                                <img src={challenge.banner_image_url} alt={challenge.title} className="w-full h-80 object-cover" />
                            ) : (
                                <div className="w-full h-80 bg-primary/5 flex items-center justify-center">
                                    <Rocket className="h-20 w-20 text-primary/10 animate-pulse" />
                                </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black to-transparent">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Contestant Cap</span>
                                        <span className="text-xl font-black tracking-tighter">{challenge.registration_count} / {challenge.max_participants}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={cn("h-2 w-2 rounded-full", challenge.is_registration_open ? "bg-emerald-400" : "bg-muted")} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{challenge.is_registration_open ? "Active" : "Closed"}</span>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="mx-auto max-w-7xl px-6 py-20 pb-40">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
                    <div className="lg:col-span-2 space-y-12">
                        <div className="space-y-6">
                            <h2 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-3">
                                <FileText className="h-6 w-6 text-primary" />
                                Deployment Directive
                            </h2>
                            <div className="text-lg text-muted-foreground/80 leading-relaxed font-medium whitespace-pre-wrap">
                                {challenge.description}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-3">
                                <Sparkles className="h-6 w-6 text-primary" />
                                Why Join?
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    { t: "Expert Mentorship", d: "Work alongside our AI engineering team and learn advanced prompt engineering." },
                                    { t: "Live Dashboard", d: "See your agent compete in real-time on our 20-foot mosaic display network." },
                                    { t: "Platform Honors", d: "Earn digital badges and physical trophies for exceptional agent creative design." },
                                    { t: "Future Ready", d: "Build a portfolio of AI agents that solve complex real-world museum mysteries." }
                                ].map((item, i) => (
                                    <div key={i} className="p-6 rounded-2xl bg-secondary/20 border border-white/5 group hover:border-primary/30 transition-all">
                                        <h4 className="font-bold text-white mb-2 group-hover:text-primary transition-colors">{item.t}</h4>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{item.d}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <Card className="bg-primary/5 border-primary/20 backdrop-blur-xl">
                            <CardContent className="p-8">
                                <h3 className="text-xl font-black uppercase tracking-tighter mb-4">Registration</h3>
                                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed mb-6">
                                    Securing your slot will generate a unique builder handle and a station unlock code for the museum.
                                </p>
                                <Button
                                    onClick={handleRegister}
                                    className="w-full h-14 font-black uppercase tracking-[0.15em] shadow-xl shadow-primary/20"
                                    disabled={!challenge.is_registration_open}
                                >
                                    {challenge.is_registration_open ? "Join Challenge" : "Registration Closed"}
                                </Button>
                                <p className="text-[10px] text-center mt-4 text-muted-foreground italic">
                                    * Limited to {challenge.max_participants} builders per session.
                                </p>
                            </CardContent>
                        </Card>

                        <div className="p-6 rounded-2xl border border-white/5 bg-secondary/10">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Location & Venue</h4>
                            <div className="flex items-center gap-3 mb-2">
                                <MapPin className="h-4 w-4 text-primary" />
                                <span className="font-bold">{challenge.location}</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Our state-of-the-art Builder Lab is located on the 3rd floor, next to the Robotics Innovation Hub.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
