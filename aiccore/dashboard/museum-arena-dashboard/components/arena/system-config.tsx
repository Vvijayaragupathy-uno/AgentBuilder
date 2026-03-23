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
import { Textarea } from "@/components/ui/textarea"
import { cn, fetchWithCredentials, getApiBase, localDatetimeLocalToUtcIso } from "@/lib/utils"
import { ChallengeDetail } from "./challenge-detail"

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
    instructions_text?: string | null
    instructions_document_url?: string | null
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

/** `datetime-local` value in local timezone */
function formatDatetimeLocal(d: Date): string {
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const da = String(d.getDate()).padStart(2, "0")
    const h = String(d.getHours()).padStart(2, "0")
    const mi = String(d.getMinutes()).padStart(2, "0")
    return `${y}-${mo}-${da}T${h}:${mi}`
}

function parseDatetimeLocal(s: string): Date | null {
    if (!s?.trim()) return null
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
}

/** Allowed build window on the admin form: 1 minute up to 24 hours (backend stores any positive int). */
const MISSION_DURATION_MIN = 1
const MISSION_DURATION_MAX = 24 * 60 // 1440

function clampMissionMinutes(mins: number): number {
    return Math.min(MISSION_DURATION_MAX, Math.max(MISSION_DURATION_MIN, Math.round(mins)))
}

/** Minutes from start → end, or null if invalid */
function minutesBetweenStartEnd(start: string, end: string): number | null {
    const s = parseDatetimeLocal(start)
    const e = parseDatetimeLocal(end)
    if (!s || !e || e.getTime() <= s.getTime()) return null
    return clampMissionMinutes((e.getTime() - s.getTime()) / 60000)
}

function endFromStartAndDuration(start: string, duration: number): string {
    const s = parseDatetimeLocal(start)
    if (!s) return ""
    const mins = clampMissionMinutes(duration)
    return formatDatetimeLocal(new Date(s.getTime() + mins * 60000))
}

export function SystemConfig() {
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [achievements, setAchievements] = useState<Achievement[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [arenaLocked, setArenaLocked] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [isClearing, setIsClearing] = useState(false)
    const [clearResult, setClearResult] = useState<string | null>(null)
    // Broadcast State
    const [isBroadcastOpen, setIsBroadcastOpen] = useState(false)
    const [broadcastMessage, setBroadcastMessage] = useState("")
    const [catalogDetailChallengeId, setCatalogDetailChallengeId] = useState<string | null>(null)

    // New/Edit challenge form
    const [challengeForm, setChallengeForm] = useState({
        title: "",
        description: "",
        complexity: "Beginner",
        maxParticipants: 10,
        duration: 60,
        startTime: "",
        endTime: "",
        location: "Main Arena",
        isRegistrationOpen: true,
        starterAssetsUrl: "",
        bannerImageUrl: "",
        instructionsText: "",
        instructionsDocumentUrl: "",
    })

    const [newAchievement, setNewAchievement] = useState({
        name: "",
        description: ""
    })

    const fetchData = async () => {
        try {
            const apiBase = getApiBase()
            const [cRes, aRes, sRes, uRes] = await Promise.all([
                fetchWithCredentials(`${apiBase}/api/v1/aiccore/challenges`),
                fetchWithCredentials(`${apiBase}/api/v1/aiccore/achievements`),
                fetchWithCredentials(`${apiBase}/api/v1/aiccore/system/status`),
                fetchWithCredentials(`${apiBase}/api/v1/aiccore/users`)
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
        const apiBase = getApiBase()
        const res = await fetchWithCredentials(`${apiBase}/api/v1/aiccore/system/lock`, { method: "POST" })
        if (res.ok) {
            const data = await res.json()
            setArenaLocked(data.locked)
        }
    }

    const handleBroadcast = async () => {
        if (!broadcastMessage) return
        const apiBase = getApiBase()
        const res = await fetchWithCredentials(`${apiBase}/api/v1/aiccore/broadcast`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: broadcastMessage })
        })
        if (res.ok) {
            setIsBroadcastOpen(false)
            setBroadcastMessage("")
        }
    }

    const handleClearSessions = async () => {
        if (!confirm("This will clear ALL active sessions from the mosaic display. Old Langflow workflows will be removed. Proceed?")) return
        setIsClearing(true)
        setClearResult(null)
        try {
            const apiBase = getApiBase()
            const res = await fetchWithCredentials(`${apiBase}/api/v1/aiccore/sessions/clear`, { method: "POST" })
            if (res.ok) {
                const data = await res.json()
                setClearResult(`Cleared ${data.sessions_cleared} session${data.sessions_cleared !== 1 ? "s" : ""}`)
                setTimeout(() => setClearResult(null), 4000)
            }
        } finally {
            setIsClearing(false)
        }
    }

    const handleFinalize = async () => {
        if (!confirm("This will lock all stations and trigger the Award Ceremony! Proceed?")) return
        const apiBase = getApiBase()
        const res = await fetchWithCredentials(`${apiBase}/api/v1/aiccore/system/finalize`, { method: "POST" })
        if (res.ok) {
            setArenaLocked(true)
            fetchData()
        }
    }

    const handleExport = () => {
        const apiBase = getApiBase()
        window.location.href = `${apiBase}/api/v1/aiccore/system/export`
    }

    /** Keep `duration_minutes` aligned with mission start/end when both are set; otherwise extend end from start + duration. */
    const applyMissionDurationMinutes = (mins: number) => {
        const duration = clampMissionMinutes(mins)
        setChallengeForm((prev) => ({
            ...prev,
            duration,
            endTime: prev.startTime ? endFromStartAndDuration(prev.startTime, duration) : prev.endTime,
        }))
    }

    const onMissionStartChange = (startTime: string) => {
        setChallengeForm((prev) => {
            if (!startTime) {
                return { ...prev, startTime: "", endTime: "" }
            }
            if (prev.endTime) {
                const m = minutesBetweenStartEnd(startTime, prev.endTime)
                if (m != null) {
                    return { ...prev, startTime, duration: m }
                }
                const endTime = endFromStartAndDuration(startTime, prev.duration)
                return { ...prev, startTime, endTime }
            }
            return {
                ...prev,
                startTime,
                endTime: endFromStartAndDuration(startTime, prev.duration),
            }
        })
    }

    const onMissionEndChange = (endTime: string) => {
        setChallengeForm((prev) => {
            if (!endTime) {
                return { ...prev, endTime: "" }
            }
            if (!prev.startTime) {
                return { ...prev, endTime }
            }
            const m = minutesBetweenStartEnd(prev.startTime, endTime)
            if (m == null) {
                return { ...prev, endTime }
            }
            return { ...prev, endTime, duration: m }
        })
    }

    const missionScheduleInvalid =
        Boolean(challengeForm.startTime) &&
        Boolean(challengeForm.endTime) &&
        minutesBetweenStartEnd(challengeForm.startTime, challengeForm.endTime) === null

    const handleSaveChallenge = async (e: React.FormEvent) => {
        e.preventDefault()
        if (
            challengeForm.startTime &&
            challengeForm.endTime &&
            minutesBetweenStartEnd(challengeForm.startTime, challengeForm.endTime) === null
        ) {
            return
        }
        setIsSubmitting(true)
        try {
            const apiBase = getApiBase()
            const url = editingId
                ? `${apiBase}/api/v1/aiccore/challenges/${editingId}`
                : `${apiBase}/api/v1/aiccore/challenges`

            const res = await fetch(url, {
                credentials: "include",
                method: editingId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: challengeForm.title,
                    description: challengeForm.description,
                    complexity_level: challengeForm.complexity,
                    max_participants: challengeForm.maxParticipants,
                    duration_minutes: challengeForm.duration,
                    start_time: localDatetimeLocalToUtcIso(challengeForm.startTime),
                    location: challengeForm.location,
                    is_registration_open: challengeForm.isRegistrationOpen,
                    starter_assets_url: challengeForm.starterAssetsUrl || null,
                    banner_image_url: challengeForm.bannerImageUrl || null,
                    instructions_text: challengeForm.instructionsText.trim() || null,
                    instructions_document_url: challengeForm.instructionsDocumentUrl.trim() || null,
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
            const apiBase = getApiBase()
            const res = await fetchWithCredentials(`${apiBase}/api/v1/aiccore/upload`, {
                method: "POST",
                body: formData
            })
            if (res.ok) {
                const data = await res.json()
                setChallengeForm(prev => ({ ...prev, bannerImageUrl: `${apiBase}${data.url}` }))
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
            const apiBase = getApiBase()
            const res = await fetchWithCredentials(`${apiBase}/api/v1/aiccore/upload`, {
                method: "POST",
                body: formData
            })
            if (res.ok) {
                const data = await res.json()
                setChallengeForm(prev => ({ ...prev, starterAssetsUrl: `${apiBase}${data.url}` }))
            }
        } catch (err) {
            console.error("Assets upload failed", err)
        }
    }

    const handleInstructionsDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append("file", file)

        try {
            const apiBase = getApiBase()
            const res = await fetchWithCredentials(`${apiBase}/api/v1/aiccore/upload`, {
                method: "POST",
                body: formData
            })
            if (res.ok) {
                const data = await res.json()
                setChallengeForm(prev => ({
                    ...prev,
                    instructionsDocumentUrl: `${apiBase}${data.url}`,
                }))
            }
        } catch (err) {
            console.error("Instructions document upload failed", err)
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
            endTime: "",
            location: "Main Arena",
            isRegistrationOpen: true,
            starterAssetsUrl: "",
            bannerImageUrl: "",
            instructionsText: "",
            instructionsDocumentUrl: "",
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

        let formattedEnd = ""
        if (formattedTime && (c.duration_minutes || 0) > 0) {
            formattedEnd = endFromStartAndDuration(formattedTime, c.duration_minutes || 60)
        }

        setChallengeForm({
            title: c.title,
            description: c.description,
            complexity: c.complexity_level,
            maxParticipants: c.max_participants || 10,
            duration: c.duration_minutes || 60,
            startTime: formattedTime,
            endTime: formattedEnd,
            location: c.location || "Main Building Station",
            isRegistrationOpen: c.is_registration_open,
            starterAssetsUrl: c.starter_assets_url || "",
            bannerImageUrl: c.banner_image_url || "",
            instructionsText: c.instructions_text || "",
            instructionsDocumentUrl: c.instructions_document_url || "",
        })
    }

    const handleToggleChallenge = async (id: string) => {
        try {
            const apiBase = getApiBase()
            const res = await fetchWithCredentials(`${apiBase}/api/v1/aiccore/challenges/${id}/toggle`, { method: "POST" })
            if (res.ok) fetchData()
        } catch (err) {
            console.error("Failed to toggle challenge", err)
        }
    }

    const handleToggleRegistration = async (id: string) => {
        try {
            const apiBase = getApiBase()
            const res = await fetchWithCredentials(`${apiBase}/api/v1/aiccore/challenges/${id}/toggle-registration`, { method: "POST" })
            if (res.ok) fetchData()
        } catch (err) {
            console.error("Failed to toggle registration", err)
        }
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

                        {/* Clear Sessions */}
                        <div className="flex flex-col gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={isClearing}
                                onClick={handleClearSessions}
                                className="w-full gap-2 bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                            >
                                <RefreshCw className={cn("h-3.5 w-3.5", isClearing && "animate-spin")} />
                                {isClearing ? "Clearing…" : "Clear All Sessions"}
                            </Button>
                            {clearResult && (
                                <p className="text-[10px] text-center text-emerald-400 font-bold">
                                    ✓ {clearResult}
                                </p>
                            )}
                            <p className="text-[9px] text-muted-foreground/50 text-center leading-tight">
                                Removes stale Langflow workflows from the mosaic display
                            </p>
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

                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    <Clock className="h-3.5 w-3.5 text-primary" />
                                    Mission build window
                                </div>
                                <p className="text-[9px] text-muted-foreground leading-relaxed">
                                    <strong className="text-foreground/80">Build duration</strong> (saved as <code className="text-[8px]">duration_minutes</code>) is the timer builders see once the mission is live.
                                    Set <strong>start</strong> and <strong>end</strong> and the duration updates to match that window; or set start + minutes and end fills in automatically.
                                    Allowed range here: <strong>{MISSION_DURATION_MIN}–{MISSION_DURATION_MAX} min</strong> (up to 24 hours).
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="space-y-1.5 flex flex-col">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mission start (your timezone)</Label>
                                        <Input
                                            type="datetime-local"
                                            value={challengeForm.startTime}
                                            onChange={(e) => onMissionStartChange(e.target.value)}
                                            className="bg-background/50 border-white/10 h-9 text-xs"
                                        />
                                        <span className="text-[8px] text-muted-foreground/90 leading-tight">
                                            Saved as UTC so all devices show the same moment. If times looked wrong before, re-save the mission after this update.
                                        </span>
                                    </div>
                                    <div className="space-y-1.5 flex flex-col">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mission end</Label>
                                        <Input
                                            type="datetime-local"
                                            value={challengeForm.endTime}
                                            onChange={(e) => onMissionEndChange(e.target.value)}
                                            className="bg-background/50 border-white/10 h-9 text-xs"
                                        />
                                        <span className="text-[8px] text-muted-foreground/80">Optional until set; drives duration when start is set</span>
                                    </div>
                                    <div className="space-y-1.5 flex flex-col">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Build duration (minutes)</Label>
                                        <div className="flex gap-2 flex-wrap items-center">
                                            <Input
                                                type="number"
                                                min={MISSION_DURATION_MIN}
                                                max={MISSION_DURATION_MAX}
                                                value={challengeForm.duration}
                                                onChange={(e) => {
                                                    const raw = Number(e.target.value)
                                                    if (Number.isNaN(raw)) return
                                                    applyMissionDurationMinutes(raw)
                                                }}
                                                className="bg-background/50 border-white/10 h-9 text-xs w-24"
                                            />
                                            <div className="flex gap-1 flex-wrap">
                                                {([30, 45, 60, 90] as const).map((m) => (
                                                    <Button
                                                        key={m}
                                                        type="button"
                                                        variant={challengeForm.duration === m ? "default" : "outline"}
                                                        size="sm"
                                                        className="h-8 px-2 text-[10px] font-bold"
                                                        onClick={() => applyMissionDurationMinutes(m)}
                                                    >
                                                        {m}m
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 flex flex-col">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Max participants</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={500}
                                            value={challengeForm.maxParticipants}
                                            onChange={(e) =>
                                                setChallengeForm({
                                                    ...challengeForm,
                                                    maxParticipants: Math.min(500, Math.max(1, Number(e.target.value) || 10)),
                                                })
                                            }
                                            className="bg-background/50 border-white/10 h-9 text-xs"
                                        />
                                    </div>
                                </div>
                                {missionScheduleInvalid && (
                                    <p className="text-[9px] font-bold text-amber-500/90">
                                        Mission end must be after mission start — duration not updated until fixed.
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5 flex flex-col">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Starter kit / assets URL</Label>
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

                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                                    Instructions (TV slide + builder)
                                </Label>
                                <Textarea
                                    placeholder="Bullet goals, constraints, judging criteria — appears on the attract-loop spotlight and in the builder instructions panel."
                                    value={challengeForm.instructionsText}
                                    onChange={e =>
                                        setChallengeForm({ ...challengeForm, instructionsText: e.target.value })
                                    }
                                    className="bg-background/50 border-white/10 min-h-[88px] text-xs resize-y"
                                />
                            </div>

                            <div className="space-y-1.5 flex flex-col">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                                    Instructions handout (PDF / DOC / DOCX)
                                </Label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <FileText className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                            placeholder="URL after upload or external link"
                                            value={challengeForm.instructionsDocumentUrl}
                                            onChange={e =>
                                                setChallengeForm({
                                                    ...challengeForm,
                                                    instructionsDocumentUrl: e.target.value,
                                                })
                                            }
                                            className="bg-background/50 border-white/10 h-9 pl-8 text-[10px]"
                                        />
                                    </div>
                                    <div className="relative">
                                        <Input
                                            type="file"
                                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                            className="hidden"
                                            id="instructions-doc-upload"
                                            onChange={handleInstructionsDocUpload}
                                        />
                                        <Label
                                            htmlFor="instructions-doc-upload"
                                            className="h-9 px-3 flex items-center justify-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer text-[10px] uppercase font-bold"
                                        >
                                            Upload
                                        </Label>
                                    </div>
                                </div>
                                <p className="text-[9px] text-muted-foreground leading-relaxed">
                                    Shown on the TV challenge slide and embedded in the builder &ldquo;Challenge instructions&rdquo; panel (preferred over starter kit for long PDF briefs).
                                </p>
                            </div>

                            <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="registration-toggle"
                                        checked={challengeForm.isRegistrationOpen}
                                        onCheckedChange={(val) => setChallengeForm({ ...challengeForm, isRegistrationOpen: val })}
                                    />
                                    <Label htmlFor="registration-toggle" className="text-[10px] uppercase font-bold cursor-pointer">Open Public Registration</Label>
                                </div>
                                <p className="text-[9px] text-muted-foreground max-w-xl leading-relaxed pl-1">
                                    No automatic timer: registration stays open until you turn this off (or use per-mission controls in the catalog).
                                    Contestant <strong>unlock PINs</strong> are separate — they expire <strong>15 minutes</strong> after issue if unused (see Arena Registry).
                                </p>
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
                                                <Button
                                                    type="button"
                                                    variant="link"
                                                    size="sm"
                                                    className="h-auto p-0 text-[10px] text-primary gap-1"
                                                    onClick={() => setCatalogDetailChallengeId(c.id)}
                                                >
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

            {/* Mission catalog — full detail preview (same as builder challenge view) */}
            <Dialog
                open={!!catalogDetailChallengeId}
                onOpenChange={(open) => {
                    if (!open) setCatalogDetailChallengeId(null)
                }}
            >
                <DialogContent className="max-w-4xl w-[min(100vw-2rem,56rem)] max-h-[min(90vh,900px)] overflow-y-auto border-border/60 bg-background/95 backdrop-blur-xl">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Mission details</DialogTitle>
                        <DialogDescription>Preview how builders see this challenge</DialogDescription>
                    </DialogHeader>
                    {catalogDetailChallengeId ? (
                        <ChallengeDetail
                            challengeId={catalogDetailChallengeId}
                            onBack={() => setCatalogDetailChallengeId(null)}
                        />
                    ) : null}
                </DialogContent>
            </Dialog>

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
