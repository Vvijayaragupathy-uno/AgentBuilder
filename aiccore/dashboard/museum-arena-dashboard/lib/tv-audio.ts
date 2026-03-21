/**
 * Optional MP3s in dashboard public/tv-audio/ — add your own royalty-cleared loops & stings.
 * If a file is missing, the browser skips it (onError) and the UI still works.
 */
export const TV_AUDIO_PATHS = {
  ambient: "/tv-audio/ambient.mp3",
  submit: "/tv-audio/submit-sting.mp3",
  demoStart: "/tv-audio/demo-start.mp3",
  winner: "/tv-audio/winner-sting.mp3",
} as const

const stingCache = new Map<string, HTMLAudioElement>()

function stingAudio(src: string): HTMLAudioElement {
  let a = stingCache.get(src)
  if (!a) {
    a = new Audio(src)
    a.preload = "auto"
    stingCache.set(src, a)
  }
  return a
}

/** Short one-shot; volume 0..1 */
export function playTVSting(
  key: keyof typeof TV_AUDIO_PATHS,
  volume = 0.35,
): void {
  if (typeof window === "undefined") return
  const src = TV_AUDIO_PATHS[key]
  const a = stingAudio(src)
  a.volume = Math.min(1, Math.max(0, volume))
  a.currentTime = 0
  void a.play().catch(() => {
    /* autoplay policy — ignored */
  })
}
