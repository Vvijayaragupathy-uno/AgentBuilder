"use client"

import { useEffect, useRef, useState } from "react"
import { TV_AUDIO_PATHS } from "@/lib/tv-audio"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "aiccore_tv_sound_enabled"

/**
 * Low looping bed for attract / live / results. Stings are triggered elsewhere.
 * Sound may require a one-time tap in the browser (autoplay policy).
 */
export function TVAmbientAudio({ className }: { className?: string }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [missing, setMissing] = useState(false)
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return true
    return window.sessionStorage.getItem(STORAGE_KEY) !== "0"
  })

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || missing) return
    el.volume = 0.09
    const p = el.play()
    if (p && typeof p.then === "function") {
      p.then(() => setBlocked(false)).catch(() => setBlocked(true))
    }
  }, [enabled, missing])

  if (missing) return null

  return (
    <>
      <audio
        ref={ref}
        src={TV_AUDIO_PATHS.ambient}
        loop
        playsInline
        onError={() => setMissing(true)}
      />
      {!enabled && (
        <button
          type="button"
          onClick={() => {
            setEnabled(true)
            try {
              window.sessionStorage.setItem(STORAGE_KEY, "1")
            } catch {
              /* ignore */
            }
          }}
          className={cn(
            "fixed bottom-5 right-5 z-[120] rounded-xl border border-white/15 bg-black/55 px-3 py-2",
            "text-[10px] font-black uppercase tracking-widest text-white/80 backdrop-blur-md",
            "hover:bg-white/10 hover:text-white",
            className,
          )}
        >
          Sound on
        </button>
      )}
      {enabled && blocked && (
        <button
          type="button"
          onClick={() => {
            void ref.current?.play().then(() => setBlocked(false)).catch(() => {
              /* still blocked */
            })
          }}
          className={cn(
            "fixed bottom-5 right-5 z-[120] rounded-xl border border-white/15 bg-black/55 px-3 py-2",
            "text-[10px] font-black uppercase tracking-widest text-white/80 backdrop-blur-md",
            "hover:bg-white/10 hover:text-white",
            className,
          )}
        >
          Enable TV sound
        </button>
      )}
      {enabled && !blocked && (
        <button
          type="button"
          title="Mute ambient music"
          onClick={() => {
            setEnabled(false)
            ref.current?.pause()
            try {
              window.sessionStorage.setItem(STORAGE_KEY, "0")
            } catch {
              /* ignore */
            }
          }}
          className={cn(
            "fixed bottom-5 right-5 z-[120] h-9 w-9 rounded-full border border-white/10 bg-black/40",
            "text-sm backdrop-blur-md text-white/50 hover:text-white hover:bg-white/10",
            className,
          )}
        >
          🔇
        </button>
      )}
    </>
  )
}
