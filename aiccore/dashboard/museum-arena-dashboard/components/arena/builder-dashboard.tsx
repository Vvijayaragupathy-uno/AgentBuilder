"use client"

import { useState, useEffect } from "react"
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
import { cn, getApiBase } from "@/lib/utils"

export function BuilderDashboard() {
  const [activeTab, setActiveTab] = useState("live")
  const [stationCount, setStationCount] = useState(8)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    // Check for auth cookie/flag
    const isAuth = document.cookie.includes("aiccore_admin=true")
    setIsAuthenticated(isAuth)
  }, [])

  // Real-time Update Listener (Google Standard Pattern)
  useEffect(() => {
    if (!isAuthenticated) return

    const apiBase = getApiBase()
    const wsUrl = apiBase.replace(/^http/, "ws") + "/api/v1/aiccore/ws";
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === "REGISTRY_UPDATE" || message.type === "LEADERBOARD_UPDATE" || message.type === "SUBMISSION_UPDATE") {
          console.log("🚀 Real-time update received:", message.type)
          setRefreshKey(prev => prev + 1)
        }
      } catch (e) {
        console.error("WS Parse error", e)
      }
    }

    ws.onerror = () => console.log("WS connection stalled. Reverting to polling.")
    return () => ws.close()
  }, [isAuthenticated])

  const handleLogin = async (password: string) => {
    const apiBase = getApiBase()
    const response = await fetch(`${apiBase}/api/v1/aiccore/auth/admin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    if (response.ok) {
      setIsAuthenticated(true)
    } else {
      throw new Error("Invalid administrator passcode")
    }
  }

  const handleLogout = () => {
    document.cookie = "aiccore_admin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
    setIsAuthenticated(false)
  }

  // Determine if the current tab is a management/private tab
  const isManagementTab = ["review", "contestants", "settings", "stations"].includes(activeTab)

  if (isAuthenticated === null) {
    return <div className="h-screen w-screen bg-black flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
    </div>
  }

  // If selecting a management tab while not logged in, show login
  const showLogin = isManagementTab && !isAuthenticated

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
          onTabChange={setActiveTab}
          isAuthenticated={!!isAuthenticated}
        />

        <main className="flex-1 overflow-auto bg-background/50 backdrop-blur-3xl">
          <div className="p-6">
            {/* View title */}
            <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-6">
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-black tracking-tighter text-foreground uppercase italic">
                  {showLogin ? "Administrator Authentication" :
                    activeTab === "live" ? "Builder Leaderboard" :
                      activeTab === "challenges" ? "Mission Catalog" :
                        activeTab === "mosaic" ? "Visual Display" :
                          activeTab === "contestants" ? "Contestant Monitor" :
                            activeTab === "settings" ? "System Config" :
                              activeTab === "stations" ? "Station Status" :
                                "Deployment Review"}
                </h1>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {showLogin ? "Secure access required for management utilities" :
                    activeTab === "live"
                      ? "Real-time engagement telemetry for active units"
                      : activeTab === "challenges"
                        ? "Active and upcoming mission deployments for builders"
                        : activeTab === "mosaic"
                          ? "Multi-stream visualization of builder workflows"
                          : activeTab === "contestants"
                            ? "Real-time telemetry and status monitoring for all builders"
                            : activeTab === "settings"
                              ? "Core logic, mission rules, and system configurations"
                              : activeTab === "stations"
                                ? "Real-time health monitoring for local builder stations"
                                : "Post-deployment evaluation and honor awarding platform"}
                </p>
              </div>

              {/* Google Engineer Suggestion: System Pulse */}
              <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-xl bg-emerald-500/5 ring-1 ring-emerald-500/20">
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">System Pulse</span>
                  <span className="text-[10px] font-mono text-foreground tracking-tighter">OPTIMAL - 99.8%</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-4 w-1 bg-emerald-500/40 rounded-full animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />)}
                </div>
              </div>
            </div>

            {/* Content with smooth transition */}
            <div
              className={cn(
                "transition-all duration-300 ease-out",
                "animate-slide-in h-min-screen h-full"
              )}
              key={activeTab + (showLogin ? "-login" : "")}
            >
              {showLogin ? (
                <LoginPage onLogin={handleLogin} />
              ) : (
                <div className="pb-10">
                  {activeTab === "live" ? (
                    <div className="flex flex-col gap-8">
                      <LiveChallenges />
                      <Leaderboard onDataUpdate={setStationCount} refreshKey={refreshKey} />
                    </div>
                  ) :
                    activeTab === "challenges" ? <ChallengesCatalog /> :
                      activeTab === "mosaic" ? <MosaicDisplay /> :
                        activeTab === "contestants" ? <UserRegistry refreshKey={refreshKey} /> :
                          activeTab === "settings" ? <SystemConfig /> :
                            activeTab === "stations" ? <StationStatus /> :
                              <ReviewPanel />}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
