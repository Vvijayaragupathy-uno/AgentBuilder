/** Shared Langflow walkthrough — TV attract playlist + builder “Tutorial” link. */
export const LANGFLOW_TEACH_VIDEO_ID = "Fc9g96XJ4tI"

export const LANGFLOW_TEACH_WATCH_URL = `https://www.youtube.com/watch?v=${LANGFLOW_TEACH_VIDEO_ID}`

/** Buffer for iframe start/end so YouTube doesn’t cut clips early. */
export const LANGFLOW_SEGMENT_PAD_MS = 2_500

/** Chapter boundaries inside the single source video (one carousel slide on TV). */
export const LANGFLOW_TEACH_SEGMENTS = [
  { startSec: 0, endSec: 24, blurb: "Welcome — what Langflow is for" },
  { startSec: 24, endSec: 48, blurb: "Canvas & components" },
  { startSec: 48, endSec: 72, blurb: "Connecting your flow" },
  { startSec: 72, endSec: 96, blurb: "Running & iterating" },
  { startSec: 96, endSec: 120, blurb: "Wrapping up" },
] as const

export function langflowSegmentDurationMs(seg: { startSec: number; endSec: number }) {
  return (seg.endSec - seg.startSec) * 1000 + LANGFLOW_SEGMENT_PAD_MS
}

/** One TV carousel step: full playlist length (~2 min + pads). */
export function langflowTeachPlaylistTotalMs() {
  return LANGFLOW_TEACH_SEGMENTS.reduce((a, s) => a + langflowSegmentDurationMs(s), 0)
}
