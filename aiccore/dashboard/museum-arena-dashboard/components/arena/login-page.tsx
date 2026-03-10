"use client"

import { useState } from "react"
import { Shield, Lock, ArrowRight, Activity, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"

interface LoginPageProps {
    onLogin: (password: string) => Promise<void>
}

export function LoginPage({ onLogin }: LoginPageProps) {
    const [password, setPassword] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)
        try {
            await onLogin(password)
        } catch (err: any) {
            setError(err.message || "Invalid credentials")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-zinc-950 to-black overflow-hidden relative">
            {/* Background decoration */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 blur-[120px] rounded-full animate-pulse-slow"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 blur-[120px] rounded-full animate-delay-1000 animate-pulse-slow"></div>
            </div>

            <div className="z-10 w-full max-w-[420px] animate-in fade-in zoom-in duration-500">
                {/* Brand Header */}
                <div className="flex flex-col items-center gap-6 mb-10">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 shadow-2xl shadow-primary/20 scale-110">
                        <Shield className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex flex-col items-center text-center">
                        <h1 className="text-3xl font-black tracking-tighter text-white sm:text-4xl text-glow-primary">
                            AICCORE
                        </h1>
                        <p className="text-xs font-mono font-medium tracking-[0.3em] text-muted-foreground/60 uppercase mt-1">
                            Agent Builder Platform
                        </p>
                    </div>
                </div>

                <Card className="border-border/50 bg-black/40 backdrop-blur-xl shadow-2xl ring-1 ring-white/5 overflow-hidden">
                    <CardHeader className="pb-4 space-y-1">
                        <CardTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                            <Lock className="h-4 w-4 text-primary" />
                            Command Center Access
                        </CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                            Enter the administrator passcode to enter the Builder Panel.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <div className="relative group">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                                        <Terminal className="h-4 w-4" />
                                    </div>
                                    <Input
                                        type="password"
                                        placeholder="Enter security key..."
                                        className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-primary/20 transition-all rounded-xl font-mono tracking-widest"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                {error && (
                                    <p className="text-[10px] font-medium text-destructive/80 pl-1 uppercase tracking-wider animate-in slide-in-from-top-1 duration-200">
                                        Authentication error: {error}
                                    </p>
                                )}
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm tracking-wide gap-2 transition-all group overflow-hidden relative"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <Activity className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        Initialize Control Deck
                                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="pt-2 pb-6 flex justify-center">
                        <div className="flex items-center gap-1.5 opacity-40">
                            <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                                System Online • Port 7860
                            </span>
                        </div>
                    </CardFooter>
                </Card>

                {/* Footer info */}
                <p className="mt-8 text-center text-[10px] text-muted-foreground/40 font-mono uppercase tracking-[0.2em]">
                    Restricted Access Area • Unauthorized access is logged
                </p>
            </div>

            {/* Styles for custom glow */}
            <style jsx global>{`
        .text-glow-primary {
          text-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
        }
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.1); opacity: 0.3; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 8s ease-in-out infinite;
        }
        .animate-delay-1000 {
          animation-delay: 2s;
        }
      `}</style>
        </div>
    )
}
