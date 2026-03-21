/** Shared Langflow walkthrough — TV attract playlist + builder “Tutorial” link. */
export const LANGFLOW_TEACH_VIDEO_ID = "Fc9g96XJ4tI"

export const LANGFLOW_TEACH_WATCH_URL = `https://www.youtube.com/watch?v=${LANGFLOW_TEACH_VIDEO_ID}`

/** Buffer at end of embed window so YouTube doesn’t cut the clip early. */
export const LANGFLOW_SEGMENT_PAD_MS = 2_500

/** Single continuous clip on the Langflow teach slide (one iframe, no chapter reloads). */
export const LANGFLOW_TEACH_CLIP_START_SEC = 0
export const LANGFLOW_TEACH_CLIP_END_SEC = 120

/** One TV carousel step: full clip length + pad. */
export function langflowTeachSlideDurationMs() {
  return (
    (LANGFLOW_TEACH_CLIP_END_SEC - LANGFLOW_TEACH_CLIP_START_SEC) * 1000 +
    LANGFLOW_SEGMENT_PAD_MS
  )
}
