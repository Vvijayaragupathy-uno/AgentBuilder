"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
    Shield, Rocket, ArrowLeft, ArrowRight, CheckCircle2,
    Zap, Sparkles, UserPlus, Fingerprint, Lock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import Link from "next/link"

function RegisterContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const challengeId = searchParams.get("challenge_id")

    const [step, setStep] = useState(1)
    const [nickname, setNickname] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successData, setSuccessData] = useState<{ code: string; nickname: string } | null>(null)

    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            // 1. Create/Login User
            const userRes = await fetch(`http://${host}:7860/api/v1/aiccore/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nickname, username, password })
            })

            if (!userRes.ok) {
                const err = await userRes.json()
                throw new Error(err.detail || "Failed to create account")
            }

            const userData = await userRes.json()

            // 2. Register for Challenge if ID exists
            if (challengeId) {
                const regRes = await fetch(`http://${host}:7860/api/v1/aiccore/challenges/${challengeId}/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: userData.id })
                })

                if (!regRes.ok) {
                    const regErr = await regRes.json().catch(() => ({ detail: "Unknown Error" }))
                    console.error("Challenge registration failed:", regErr.detail)
                }
            }

            setSuccessData({ code: userData.unlock_code, nickname: userData.nickname })
            setStep(3)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full max-w-md relative animate-in fade-in zoom-in duration-500">
            <div className="flex flex-col items-center gap-6 text-center mb-8">
                <Link href="/challenges" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-all">
                    <ArrowLeft className="h-3 w-3" />
                    Back to Challenges
                </Link>
                <div className="relative group">
                    <div className="absolute -inset-4 rounded-3xl bg-primary/20 blur-2xl animate-pulse" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-black ring-1 ring-primary/30 shadow-2xl">
                        {step === 3 ? <Sparkles className="h-10 w-10 text-emerald-400" /> : <UserPlus className="h-10 w-10 text-primary" />}
                    </div>
                </div>
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic leading-none">
                        {step === 3 ? "Deployment Ready" : "Join the Platform"}
                    </h1>
                    <p className="text-sm text-muted-foreground font-medium">
                        {step === 3 ? "Secure your unlock code and head to a Builder Station." : "Create your unique profile to start designing AI agents."}
                    </p>
                </div>
            </div>

            {step === 1 && (
                <Card className="glass border-white/5 overflow-hidden">
                    <CardContent className="p-8 pt-10">
                        <form onSubmit={(e) => { e.preventDefault(); setStep(2); }} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1.5 flex flex-col items-start">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground pl-1 tracking-widest">Public Nickname</label>
                                    <Input
                                        placeholder="e.g. PixelMaster"
                                        value={nickname}
                                        onChange={e => setNickname(e.target.value)}
                                        className="h-12 bg-white/5 border-white/5 focus:border-primary/50 text-sm font-bold"
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5 flex flex-col items-start">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground pl-1 tracking-widest">Unique Handle</label>
                                    <Input
                                        placeholder="e.g. user_99"
                                        value={username}
                                        onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, "_"))}
                                        className="h-12 bg-white/5 border-white/5 focus:border-primary/50 text-sm font-mono font-bold"
                                        required
                                    />
                                </div>
                            </div>
                            <Button type="submit" className="w-full h-14 font-black uppercase tracking-widest group">
                                Continue <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            {step === 2 && (
                <Card className="glass border-white/5 overflow-hidden animate-in slide-in-from-right-8 duration-500">
                    <CardContent className="p-8 pt-10">
                        <form onSubmit={handleCreateAccount} className="space-y-6">
                            <div className="space-y-1.5 flex flex-col items-start">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground pl-1 tracking-widest">Security Pin / Pass</label>
                                <Input
                                    type="password"
                                    placeholder="••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="h-14 bg-white/5 border-white/5 focus:border-primary/50 text-2xl font-black tracking-[0.5em] text-center"
                                    required
                                />
                                <p className="text-[9px] text-muted-foreground mt-2 uppercase font-medium">This will be used to recover your handle for future deployments.</p>
                            </div>

                            {error && <p className="text-xs font-bold text-rose-500 uppercase tracking-widest text-center">{error}</p>}

                            <div className="flex flex-col gap-3">
                                <Button disabled={loading} type="submit" className="w-full h-14 font-black uppercase tracking-widest">
                                    {loading ? "Generating Credentials..." : "Initialize Profile"}
                                </Button>
                                <Button variant="ghost" onClick={() => setStep(1)} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Back to Identity</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {step === 3 && successData && (
                <Card className="glass border-emerald-500/20 bg-emerald-500/5 animate-in zoom-in duration-500">
                    <CardContent className="p-10 flex flex-col gap-8 text-center">
                        <div className="space-y-2">
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1 font-black uppercase tracking-widest text-[9px]">
                                Identity Verified: @{username}
                            </Badge>
                            <h2 className="text-xs text-muted-foreground uppercase font-black tracking-[0.2em] pt-4">Your Deployment Code</h2>
                        </div>

                        <div className="relative group">
                            <div className="absolute -inset-4 rounded-3xl bg-emerald-500/20 blur-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
                            <div className="relative h-28 w-full rounded-2xl bg-black border border-emerald-500/30 flex items-center justify-center shadow-2xl">
                                <span className="text-7xl font-black font-mono tracking-[0.3em] text-emerald-400 pl-4">{successData.code}</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 pt-4">
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-left flex items-start gap-4">
                                <Rocket className="h-5 w-5 text-primary mt-1 shrink-0" />
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-bold text-white uppercase tracking-tight">Active Deployment</span>
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">Enter this code at any local Builder Station to start building. Code is valid for 24 hours.</p>
                                </div>
                            </div>
                            <Link href="/builder">
                                <Button variant="outline" className="w-full h-12 uppercase font-black text-[10px] tracking-widest border-emerald-500/20 hover:bg-emerald-500/10">Proceed to Builder</Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

export default function RegisterPage() {
    return (
        <div className="min-h-screen bg-[#0f111c] text-white flex items-center justify-center p-6 selection:bg-primary/30">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[120px] rounded-full animate-pulse-slow"></div>
            </div>

            <Suspense fallback={<div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>}>
                <RegisterContent />
            </Suspense>

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
