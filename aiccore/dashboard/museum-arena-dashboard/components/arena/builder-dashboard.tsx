"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { BuilderHeader } from "./builder-header"
import { BuilderSidebar } from "./builder-sidebar"
import { MobileTabs } from "./mobile-tabs"
import { Leaderboard } from "./leaderboard"
import { ReviewPanel } from "./review-panel"
import { MosaicDisplay } from "./mosaic-display"
import { UserRegistry } from "./user-registry"
import { SystemConfig } from "./system-config"
import { StationStatus } from "./station-status"
import { LoginPage } from "./login-page"
import { LiveChallenges } from "./live-challenges"
import { ChallengesCatalog } from "./challenges-catalog"
import { ChallengeDetail } from "./challenge-detail"
import { cn, getApiBase } from "@/lib/utils"

const TAB_LABELS: Record<string, string> = {
  live:        "Leaderboard",
  challenges:  "Challenges",
  mosaic:      "Display",
  contestants: "Participants",
  review:      "Submissions",
  stations:    "Stations",
  settings:    "Settings",
  login:       "Admin Login",
}

const VALID_TABS = new Set(["live", "challenges", "mosaic", "contestants", "review", "stations", "settings"])

function BuilderDashboardInner() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const initialTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : "live"

  const [activeTab, setActiveTab] = useState(initialTab)
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null)
  const [stationCount, setStationCount] = useState(8)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showAdminLogin, setShowAdminLogin] = useState(false)

  useEffect(() => {
    const isAuth = document.cookie.includes("aiccore_admin=true")
    setIsAuthenticated(isAuth)
  }, [])

  // Real-time updates for admin
  useEffect(() => {
    if (!isAuthenticated) return
    const wsUrl = getApiBase().replace(/^http/, "ws") + "/api/v1/aiccore/ws"
    const ws = new WebSocket(wsUrl)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (["REGISTRY_UPDATE", "LEADERBOARD_UPDATE", "SUBMISSION_UPDATE"].includes(msg.type)) {
          setRefreshKey(k => k + 1)
        }
      } catch {}
    }
    return () => ws.close()
  }, [isAuthenticated])

  const handleLogin = async (password: string) => {
    const res = await fetch(`${getApiBase()}/api/v1/aiccore/auth/admin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      setIsAuthenticated(true)
      setShowAdminLogin(false)
      setActiveTab("contestants") // land on first admin tab
    } else {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || "Incorrect password")
    }
  }

  const handleLogout = () => {
    document.cookie = "aiccore_admin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/"
    setIsAuthenticated(false)
    setActiveTab("live")
  }

  const handleAdminButtonClick = () => {
    if (isAuthenticated) return
    setShowAdminLogin(true)
    setActiveTab("live") // keep public tab active underneath
  }

  if (isAuthenticated === null) {
    return (
      <div className="h-screen w-screen bg-background bg-dot-grid flex flex-col items-center justify-center gap-4">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.2em]">
          Initializing
        </span>
      </div>
    )
  }

  const currentLabel = showAdminLogin
    ? "Admin Login"
    : activeTab === "challenges" && selectedChallengeId
      ? "Challenge Detail"
      : TAB_LABELS[activeTab] ?? activeTab

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <BuilderHeader
        stationCount={stationCount}
        onLogout={handleLogout}
        isAuthenticated={!!isAuthenticated}
      />
      <MobileTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex flex-1 overflow-hidden">
        <BuilderSidebar
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab); setShowAdminLogin(false); setSelectedChallengeId(null) }}
          isAuthenticated={!!isAuthenticated}
          onAdminLogin={handleAdminButtonClick}
          onAdminLogout={handleLogout}
        />

        <main className="flex-1 overflow-auto bg-background bg-dot-grid">
          <div className="p-6">
            {/* Page title row */}
            <div className="mb-6 pb-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h1 className="text-sm font-bold text-foreground tracking-widest uppercase">{currentLabel}</h1>
                <span className="text-border text-xs">·</span>
                <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-widest">AICCORE Arena</span>
              </div>
              {isAuthenticated && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 ring-1 ring-primary/20 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  Admin
                </span>
              )}
            </div>

            {/* Content */}
            <div
              className="animate-tab-enter"
              key={activeTab + (showAdminLogin ? "-login" : "")}
            >
              {showAdminLogin ? (
                <LoginPage onLogin={handleLogin} />
              ) : activeTab === "mosaic" ? (
                <div className="h-[calc(100vh-180px)]">
                  <MosaicDisplay />
                </div>
              ) : (
                <div className="pb-10">
                  {activeTab === "live" ? (
                    <div className="flex flex-col gap-8">
                      <LiveChallenges
                        onViewAll={() => setActiveTab("challenges")}
                        onSelectChallenge={(id) => { setSelectedChallengeId(id); setActiveTab("challenges") }}
                      />
                      <Leaderboard onDataUpdate={setStationCount} refreshKey={refreshKey} />
                    </div>
                  ) : activeTab === "challenges" ? (
                    selectedChallengeId
                      ? <ChallengeDetail challengeId={selectedChallengeId} onBack={() => setSelectedChallengeId(null)} />
                      : <ChallengesCatalog onSelectChallenge={setSelectedChallengeId} />
                  )
                    : activeTab === "contestants" ? <UserRegistry refreshKey={refreshKey} />
                      : activeTab === "settings" ? <SystemConfig />
                        : activeTab === "stations" ? <StationStatus />
                          : <ReviewPanel />}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export function BuilderDashboard() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen bg-background bg-dot-grid flex flex-col items-center justify-center gap-4">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.2em]">Loading</span>
      </div>
    }>
      <BuilderDashboardInner />
    </Suspense>
  )
}
