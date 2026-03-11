"use client"

import { useState, useEffect } from "react"
import { Users, RefreshCw, Plus, User as UserIcon, Calendar, Hash, Key, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getApiBase } from "@/lib/utils"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog"

interface User {
    id: string
    username: string
    nickname: string
    unlock_code: string
    unlock_code_generated_at: string | null
    created_at: string
}

export function UserRegistry({ refreshKey }: { refreshKey?: number }) {
    const [users, setUsers] = useState<User[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRegenerating, setIsRegenerating] = useState<string | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [newUsername, setNewUsername] = useState("")
    const [newNickname, setNewNickname] = useState("")

    const fetchUsers = async () => {
        setIsLoading(true)
        try {
            const apiBase = getApiBase()
            const response = await fetch(`${apiBase}/api/v1/aiccore/users`)
            if (response.ok) {
                const data = await response.json()
                setUsers(data)
            }
        } catch (error) {
            console.error("Failed to fetch users:", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchUsers()
    }, [])

    // Listen for refreshKey changes to trigger a re-fetch
    useEffect(() => {
        if (refreshKey !== undefined) {
            fetchUsers()
        }
    }, [refreshKey])

    const handleRegenerate = async (userId: string) => {
        setIsRegenerating(userId)
        try {
            const apiBase = getApiBase()
            const response = await fetch(`${apiBase}/api/v1/aiccore/users/${userId}/regenerate`, {
                method: "POST",
            })
            if (response.ok) {
                await fetchUsers()
            }
        } catch (error) {
            console.error("Failed to regenerate code:", error)
        } finally {
            setIsRegenerating(null)
        }
    }

    const handleCreateUser = async () => {
        if (!newUsername || !newNickname) return

        try {
            const apiBase = getApiBase()
            const response = await fetch(`${apiBase}/api/v1/aiccore/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: newUsername, nickname: newNickname }),
            })
            if (response.ok) {
                setIsDialogOpen(false)
                setNewUsername("")
                setNewNickname("")
                await fetchUsers()
            }
        } catch (error) {
            console.error("Failed to create user:", error)
        }
    }

    const handleDeleteUser = async (userId: string) => {
        if (!confirm("Are you sure you want to remove this contestant? This will also end their active sessions.")) return
        try {
            const apiBase = getApiBase()
            const response = await fetch(`${apiBase}/api/v1/aiccore/users/${userId}`, {
                method: "DELETE",
            })
            if (response.ok) {
                await fetchUsers()
            }
        } catch (error) {
            console.error("Failed to delete user:", error)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Arena Registry</h2>
                        <p className="text-sm text-muted-foreground">Manage contestants and their station unlock codes</p>
                    </div>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 shadow-lg shadow-primary/20">
                            <Plus className="h-4 w-4" /> Add Contestant
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>New Contestant</DialogTitle>
                            <DialogDescription>
                                Register a new student for the arena. A 4-digit unlock code will be generated automatically.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Username (Unique handle)</label>
                                <Input
                                    placeholder="e.g. spider_man_99"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Nickname (Display name)</label>
                                <Input
                                    placeholder="e.g. Peter Parker"
                                    value={newNickname}
                                    onChange={(e) => setNewNickname(e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleCreateUser}>Create Contestant</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-border/50 shadow-sm overflow-hidden glass-card">
                <Table>
                    <TableHeader className="bg-muted/30">
                        <TableRow>
                            <TableHead className="w-[250px]">Contestant</TableHead>
                            <TableHead>Handle</TableHead>
                            <TableHead>Unlock Code</TableHead>
                            <TableHead>Generated At</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.length === 0 && !isLoading && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                    No contestants registered yet.
                                </TableCell>
                            </TableRow>
                        )}
                        {users.map((user) => (
                            <TableRow key={user.id} className="group hover:bg-primary/5 transition-colors">
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary ring-1 ring-border">
                                            <UserIcon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <span>{user.nickname}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <code className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                                        @{user.username}
                                    </code>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        {user.unlock_code ? (
                                            <Badge variant="outline" className="font-mono text-sm tracking-widest bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-2 py-1">
                                                {user.unlock_code}
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="font-mono text-xs opacity-50">EXPIRED</Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {user.unlock_code_generated_at ? new Date(user.unlock_code_generated_at).toLocaleTimeString() : "N/A"}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleRegenerate(user.id)}
                                            disabled={isRegenerating === user.id}
                                            title="Regenerate Unlock Code"
                                        >
                                            <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating === user.id ? 'animate-spin' : ''}`} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                            onClick={() => handleDeleteUser(user.id)}
                                            title="Delete Contestant"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    )
}
