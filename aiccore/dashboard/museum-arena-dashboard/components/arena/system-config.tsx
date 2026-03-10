"use client"

import { useState, useEffect } from "react"
import {
    Settings,
    Plus,
    Trash2,
    Activity,
    Shield,
    Award,
    Zap,
    CheckCircle2,
    XCircle,
    BarChart3,
    RefreshCw,
    Users,
    Clock,
    Lock,
    Unlock,
    Edit3,
    Save,
    X,
    Calendar,
    MapPin,
    ExternalLink,
    Globe,
    Megaphone,
    Trophy,
    Download,
    FileText,
    Image as ImageIcon
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface Challenge {
    id: string
    title: string
    description: string
    complexity_level: string
    is_active: boolean
    max_participants: number
    duration_minutes: number
    start_time: string | null
    location: string
    is_registration_open: boolean
    registration_count: number
    starter_assets_url?: string
    banner_image_url?: string
}

interface Achievement {
    id: string
    name: string
    description: string
}

interface User {
    id: string
    nickname: string
    username: string
    unlock_code: string
    created_at: string
    honors_count: number
    submissions_count: number
}

export function SystemConfig() {
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [achievements, setAchievements] = useState<Achievement[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [arenaLocked, setArenaLocked] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    // Broadcast State
    const [isBroadcastOpen, setIsBroadcastOpen] = useState(false)
    const [broadcastMessage, setBroadcastMessage] = useState("")

    // New/Edit challenge form
    const [challengeForm, setChallengeForm] = useState({
        title: "",
        description: "",
        complexity: "Beginner",
        maxParticipants: 10,
        duration: 60,
        startTime: "",
        location: "Main Arena",
        isRegistrationOpen: true,
        starterAssetsUrl: "",
        bannerImageUrl: ""
    })

    const [newAchievement, setNewAchievement] = useState({
        name: "",
        description: ""
    })

    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

    const fetchData = async () => {
        try {
            const [cRes, aRes, sRes, uRes] = await Promise.all([
                fetch(`http://${host}:7860/api/v1/aiccore/challenges`),
                fetch(`http://${host}:7860/api/v1/aiccore/achievements`),
                fetch(`http://${host}:7860/api/v1/aiccore/system/status`),
                fetch(`http://${host}:7860/api/v1/aiccore/users`)
            ])
            if (cRes.ok) setChallenges(await cRes.json())
            if (aRes.ok) setAchievements(await aRes.json())
            if (uRes.ok) setUsers(await uRes.json())
            if (sRes.ok) {
                const status = await sRes.json()
                setArenaLocked(status.locked)
            }
        } catch (err) {
            console.error("Fetch error", err)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleToggleLock = async () => {
        const res = await fetch(`http://${host}:7860/api/v1/aiccore/system/lock`, { method: "POST" })
        if (res.ok) {
            const data = await res.json()
            setArenaLocked(data.locked)
        }
    }

    const handleBroadcast = async () => {
        if (!broadcastMessage) return
        const res = await fetch(`http://${host}:7860/api/v1/aiccore/broadcast`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: broadcastMessage })
        })
        if (res.ok) {
            setIsBroadcastOpen(false)
            setBroadcastMessage("")
        }
    }

    const handleFinalize = async () => {
        if (!confirm("This will lock all stations and trigger the Award Ceremony! Proceed?")) return
        const res = await fetch(`http://${host}:7860/api/v1/aiccore/system/finalize`, { method: "POST" })
        if (res.ok) {
            setArenaLocked(true)
            fetchData()
        }
    }

    const handleExport = () => {
        window.location.href = `http://${host}:7860/api/v1/aiccore/system/export`
    }

    const handleSaveChallenge = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const url = editingId
                ? `http://${host}:7860/api/v1/aiccore/challenges/${editingId}`
                : `http://${host}:7860/api/v1/aiccore/challenges`

            const res = await fetch(url, {
                method: editingId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: challengeForm.title,
                    description: challengeForm.description,
                    complexity_level: challengeForm.complexity,
                    max_participants: challengeForm.maxParticipants,
                    duration_minutes: challengeForm.duration,
                    start_time: challengeForm.startTime || null,
                    location: challengeForm.location,
                    is_registration_open: challengeForm.isRegistrationOpen,
                    starter_assets_url: challengeForm.starterAssetsUrl,
                    banner_image_url: challengeForm.bannerImageUrl
                })
            })

            if (res.ok) {
                resetForm()
                fetchData()
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append("file", file)

        try {
            const res = await fetch(`http://${host}:7860/api/v1/aiccore/upload`, {
                method: "POST",
                body: formData
            })
            if (res.ok) {
                const data = await res.json()
                setChallengeForm(prev => ({ ...prev, bannerImageUrl: `http://${host}:7860${data.url}` }))
            }
        } catch (err) {
            console.error("Upload failed", err)
        }
    }

    const handleAssetsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append("file", file)

        try {
            const res = await fetch(`http://${host}:7860/api/v1/aiccore/upload`, {
                method: "POST",
                body: formData
            })
            if (res.ok) {
                const data = await res.json()
                setChallengeForm(prev => ({ ...prev, starterAssetsUrl: `http://${host}:7860${data.url}` }))
            }
        } catch (err) {
            console.error("Assets upload failed", err)
        }
    }

    const resetForm = () => {
        setChallengeForm({
            title: "",
            description: "",
            complexity: "Beginner",
            maxParticipants: 10,
            duration: 60,
            startTime: "",
            location: "Main Building Station",
            isRegistrationOpen: true,
            starterAssetsUrl: "",
            bannerImageUrl: ""
        })
        setEditingId(null)
    }

    const startEdit = (c: Challenge) => {
        setEditingId(c.id)

        // Fix for datetime-local input: force local format YYYY-MM-DDTHH:mm
        let formattedTime = ""
        if (c.start_time) {
            const d = new Date(c.start_time)
            const year = d.getFullYear()
            const month = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            const hours = String(d.getHours()).padStart(2, '0')
            const mins = String(d.getMinutes()).padStart(2, '0')
            formattedTime = `${year}-${month}-${day}T${hours}:${mins}`
        }

        setChallengeForm({
            title: c.title,
            description: c.description,
            complexity: c.complexity_level,
            maxParticipants: c.max_participants || 10,
            duration: c.duration_minutes || 60,
            startTime: formattedTime,
            location: c.location || "Main Building Station",
            isRegistrationOpen: c.is_registration_open,
            starterAssetsUrl: c.starter_assets_url || "",
            bannerImageUrl: c.banner_image_url || ""
        })
    }

    const handleToggleChallenge = async (id: string) => {
        await fetch(`http://${host}:7860/api/v1/aiccore/challenges/${id}/toggle`, { method: "POST" })
        fetchData()
    }

    const handleToggleRegistration = async (id: string) => {
        await fetch(`http://${host}:7860/api/v1/aiccore/challenges/${id}/toggle-registration`, { method: "POST" })
        fetchData()
    }

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 overflow-x-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* System Master Control */}
                <Card className="glass border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-primary" />
                            System Master Control
                        </CardTitle>
                        <CardDescription>Live deployment controls and broadcast relays</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {/* Lock Toggle */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-background/40 border border-white/5">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold uppercase tracking-tighter">System Lock</span>
                                <span className="text-[10px] text-muted-foreground">{arenaLocked ? "Manual Lockdown" : "Ready"}</span>
                            </div>
                            <Button
                                variant={arenaLocked ? "destructive" : "secondary"}
                                size="sm"
                                onClick={handleToggleLock}
                                className="h-8 px-3"
                            >
                                {arenaLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            </Button>
                        </div>

                        {/* Broadcast Button */}
                        <Button
                            variant="outline"
                            className="w-full justify-start gap-3 bg-sky-500/10 border-sky-500/20 text-sky-400 hover:bg-sky-500/20"
                            onClick={() => setIsBroadcastOpen(true)}
                        >
                            <Megaphone className="h-4 w-4" />
                            Live Broadcast Message
                        </Button>

                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" size="sm" className="gap-2 bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20" onClick={handleFinalize}>
                                <Trophy className="h-3.5 w-3.5" /> Finalize
                            </Button>
                            <Button variant="outline" size="sm" className="gap-2 border-white/10 hover:bg-white/5" onClick={handleExport}>
                                <Download className="h-3.5 w-3.5" /> Export CSV
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Event Creation Form */}
                <Card className="glass lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {editingId ? <Edit3 className="h-5 w-5 text-amber-400" /> : <Plus className="h-5 w-5 text-primary" />}
                            {editingId ? "Modify Planned Deployment" : "Schedule New Mission Deployment"}
                        </CardTitle>
                        <CardDescription>Configure mission directives, target assets, and registration parameters</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSaveChallenge} className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs">Event Title</Label>
                                    <Input
                                        placeholder="e.g. Mystery Story AI Challenge"
                                        value={challengeForm.title}
                                        onChange={e => setChallengeForm({ ...challengeForm, title: e.target.value })}
                                        className="bg-background/50 border-white/10 h-9"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Complexity</Label>
                                    <Select
                                        value={challengeForm.complexity}
                                        onValueChange={(val) => setChallengeForm({ ...challengeForm, complexity: val })}
                                    >
                                        <SelectTrigger className="bg-background/50 border-white/10 h-9">
                                            <SelectValue placeholder="Level" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Beginner">Beginner</SelectItem>
                                            <SelectItem value="Intermediate">Intermediate</SelectItem>
                                            <SelectItem value="Expert">Expert</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5 flex flex-col">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Start Time</Label>
                                    <Input
                                        type="datetime-local"
                                        value={challengeForm.startTime}
                                        onChange={e => {
                                            console.log("Setting Time:", e.target.value)
                                            setChallengeForm({ ...challengeForm, startTime: e.target.value })
                                        }}
                                        className="bg-background/50 border-white/10 h-9 text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5 flex flex-col">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mission Guidelines (PDF/Doc)</Label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <FileText className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                            <Input
                                                placeholder="Link to Assets"
                                                value={challengeForm.starterAssetsUrl}
                                                onChange={e => setChallengeForm({ ...challengeForm, starterAssetsUrl: e.target.value })}
                                                className="bg-background/50 border-white/10 h-9 pl-8 text-[10px]"
                                            />
                                        </div>
                                        <div className="relative">
                                            <Input
                                                type="file"
                                                className="hidden"
                                                id="assets-upload"
                                                onChange={handleAssetsUpload}
                                            />
                                            <Label
                                                htmlFor="assets-upload"
                                                className="h-9 px-3 flex items-center justify-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer text-[10px] uppercase font-bold"
                                            >
                                                Upload
                                            </Label>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-1.5 flex flex-col">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Banner Image</Label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <ImageIcon className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                            <Input
                                                placeholder="CDN link / URL"
                                                value={challengeForm.bannerImageUrl}
                                                onChange={e => setChallengeForm({ ...challengeForm, bannerImageUrl: e.target.value })}
                                                className="bg-background/50 border-white/10 h-9 pl-8 text-[10px]"
                                            />
                                        </div>
                                        <div className="relative">
                                            <Input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                id="banner-upload"
                                                onChange={handleImageUpload}
                                            />
                                            <Label
                                                htmlFor="banner-upload"
                                                className="h-9 px-3 flex items-center justify-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer text-[10px] uppercase font-bold"
                                            >
                                                Upload
                                            </Label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mission Directive (Description)</Label>
                                <Input
                                    placeholder="Develop an agent that explains complex math problems using simple analogies..."
                                    value={challengeForm.description}
                                    onChange={e => setChallengeForm({ ...challengeForm, description: e.target.value })}
                                    className="bg-background/50 border-white/10 h-9 text-xs"
                                    required
                                />
                            </div>

                            <div className="flex items-center justify-between border-t border-white/5 pt-4">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="registration-toggle"
                                        checked={challengeForm.isRegistrationOpen}
                                        onCheckedChange={(val) => setChallengeForm({ ...challengeForm, isRegistrationOpen: val })}
                                    />
                                    <Label htmlFor="registration-toggle" className="text-[10px] uppercase font-bold cursor-pointer">Open Public Registration</Label>
                                </div>
                                <div className="flex gap-2">
                                    {editingId && (
                                        <Button variant="outline" size="sm" onClick={resetForm} className="h-8">Cancel</Button>
                                    )}
                                    <Button disabled={isSubmitting} size="sm" type="submit" className="h-9 px-8 font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                                        {editingId ? "Update Deployment" : "Activate Mission"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Event Schedule Registry */}
                <Card className="glass lg:col-span-3">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Public Mission Catalog</CardTitle>
                            <CardDescription>Preview of mission availability for builder units</CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                            {challenges.length} EVENTS
                        </Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {challenges.map(c => (
                                <div key={c.id} className={cn(
                                    "flex flex-col rounded-2xl border transition-all relative group overflow-hidden",
                                    c.is_active ? "bg-background/60 border-primary/30 shadow-xl" : "bg-black/20 border-white/5 opacity-60"
                                )}>
                                    {/* Banner Preview */}
                                    <div className="h-28 w-full bg-secondary/50 relative overflow-hidden flex items-center justify-center">
                                        {c.banner_image_url ? (
                                            <img src={c.banner_image_url} alt={c.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex flex-col items-center opacity-20">
                                                <ImageIcon className="h-8 w-8" />
                                                <span className="text-[10px] font-bold uppercase mt-2">No Banner Image</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-60" />
                                        <div className="absolute top-3 right-3 flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 bg-black/40 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => startEdit(c)}>
                                                <Edit3 className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className={cn("h-7 w-7 bg-black/40 backdrop-blur-md", c.is_active ? "text-emerald-400" : "text-muted-foreground")} onClick={() => handleToggleChallenge(c.id)}>
                                                {c.is_active ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="p-4 flex flex-col gap-3">
                                        <div className="flex flex-col gap-1">
                                            <h3 className="font-black text-base tracking-tight leading-none">{c.title}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge className={cn(
                                                    "text-[9px] px-1.5 py-0 h-4 border-0 font-bold uppercase",
                                                    c.complexity_level === "Beginner" ? "bg-emerald-500/20 text-emerald-400" :
                                                        c.complexity_level === "Intermediate" ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400"
                                                )}>{c.complexity_level}</Badge>
                                                <span className="text-[10px] text-muted-foreground font-mono">{c.location}</span>
                                            </div>
                                        </div>

                                        <p className="text-[11px] text-muted-foreground/80 line-clamp-2 leading-relaxed min-h-[32px]">{c.description}</p>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex flex-col p-2 rounded-lg bg-white/5 border border-white/5">
                                                <span className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1"><Users className="h-2 w-2" /> Registered</span>
                                                <span className="text-xs font-mono font-bold">{c.registration_count || 0} / {c.max_participants || 10}</span>
                                            </div>
                                            {c.starter_assets_url && (
                                                <div className="flex items-center justify-center p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-emerald-400">
                                                    <FileText className="h-3.5 w-3.5" />
                                                    <span className="text-[9px] font-black uppercase ml-1.5">Assets Ready</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto">
                                            <div className="flex items-center gap-2">
                                                <div className={cn("h-2 w-2 rounded-full animate-pulse", c.is_registration_open ? "bg-emerald-500" : "bg-muted")} />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">{c.is_registration_open ? "REG OPEN" : "CLOSED"}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="ghost" size="sm" className="h-auto p-0 text-[10px] text-primary uppercase font-bold hover:scale-105 transition-transform" onClick={() => handleToggleRegistration(c.id)}>
                                                    {c.is_registration_open ? "Disable" : "Enable"}
                                                </Button>
                                                <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-primary gap-1">
                                                    Details <ExternalLink className="h-2.5 w-2.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Builder Unit Registry */}
                <Card className="glass lg:col-span-3">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5 text-sky-400" />
                                Builder Unit Registry
                            </CardTitle>
                            <CardDescription>Master list of all registered participants and their performance metrics</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Badge variant="outline" className="bg-sky-500/5 text-sky-400 border-sky-500/20 uppercase font-black px-3 py-1">
                                {users.length} Total Units
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white/5 border-b border-white/5 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                                    <tr>
                                        <th className="px-6 py-4">Participant</th>
                                        <th className="px-6 py-4">Access Code</th>
                                        <th className="px-6 py-4">Submissions</th>
                                        <th className="px-6 py-4">Honors</th>
                                        <th className="px-6 py-4 text-right">Registered</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs">
                                    {users.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic">
                                                No builder units registered in the system yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        users.map(u => (
                                            <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-foreground text-sm">{u.nickname}</span>
                                                        <span className="text-[10px] text-muted-foreground font-mono opacity-60">@{u.username}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <code className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-black">{u.unlock_code}</code>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="h-3 w-3 text-emerald-400" />
                                                        <span className="font-mono font-bold">{u.submissions_count}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <Award className="h-3 w-3 text-amber-500" />
                                                        <span className="font-mono font-bold">{u.honors_count}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right text-muted-foreground font-mono text-[10px]">
                                                    {new Date(u.created_at).toLocaleDateString()} {new Date(u.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Broadcast Modal */}
            <Dialog open={isBroadcastOpen} onOpenChange={setIsBroadcastOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Megaphone className="h-5 w-5 text-sky-400" />
                            Global System Broadcast
                        </DialogTitle>
                        <DialogDescription>
                            This message will appear as a popup on every station instantly.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label className="text-xs">Message Prompt</Label>
                        <Input
                            value={broadcastMessage}
                            onChange={e => setBroadcastMessage(e.target.value)}
                            placeholder="e.g. 5 Minutes Left! Finish and Submit your agents!"
                            className="mt-2 bg-background/50 border-white/10"
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsBroadcastOpen(false)}>Cancel</Button>
                        <Button onClick={handleBroadcast} className="bg-sky-500 text-white hover:bg-sky-600">Send Now</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
