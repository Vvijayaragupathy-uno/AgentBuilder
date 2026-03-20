import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Same-origin proxy path (set with AICCORE_UPSTREAM_URL in next.config rewrites). Fixes cookies / session for embedded Langflow. */
const PROXY_PREFIX = process.env.NEXT_PUBLIC_AICCORE_PROXY_PREFIX || ''

/** Milliseconds to add to Date.now() so UI matches server clock (set from API `server_time`). */
let serverClockSkewMs = 0

export function applyServerTimeFromIso(iso: string | null | undefined) {
  if (!iso) return
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return
  serverClockSkewMs = t - Date.now()
}

/** Use for countdowns / comparisons instead of Date.now() after at least one `applyServerTimeFromIso`. */
export function skewedNow(): number {
  return Date.now() + serverClockSkewMs
}

export function getApiBase() {
  if (typeof window !== 'undefined' && PROXY_PREFIX) {
    return `${window.location.origin}${PROXY_PREFIX.startsWith('/') ? PROXY_PREFIX : `/${PROXY_PREFIX}`}`
  }

  const envUrl = process.env.NEXT_PUBLIC_AICCORE_API_URL
  if (envUrl) {
    // If the dashboard is HTTPS, ensure the API URL is also HTTPS
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && envUrl.startsWith('http:')) {
      return envUrl.replace('http:', 'https:').replace(':7860', '')
    }
    return envUrl
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    // If we're on a public domain (not localhost), we strip the port because Railway handles SSL mapping
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${protocol}//${hostname}`
    }
    return `${protocol}//${hostname}:7860`
  }
  return 'http://localhost:7860'
}

const BUILDER_STATION_STORAGE_KEY = "aiccore_builder_station_id"

/**
 * Stable ID for this browser / laptop. Sent on unlock so each device is a separate
 * "station" for the backend — avoids every laptop sharing `STATION_LOCAL`, which
 * would deactivate the previous builder and show only one tile on the TV mosaic.
 */
export function getOrCreateBuilderStationId(): string {
  if (typeof window === "undefined") {
    return "STATION_SSR"
  }
  try {
    let id = localStorage.getItem(BUILDER_STATION_STORAGE_KEY)
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? `ws-${crypto.randomUUID()}`
          : `ws-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      localStorage.setItem(BUILDER_STATION_STORAGE_KEY, id)
    }
    return id
  } catch {
    return `ws-fallback-${Date.now()}`
  }
}

/**
 * Langflow UI origin for the builder iframe. When using same-origin proxy, this matches getApiBase()
 * so the iframe and API share cookies and the AICCORE session header/cookie path.
 */
export function getLangflowUrl() {
  if (typeof window !== 'undefined' && PROXY_PREFIX) {
    return getApiBase()
  }

  const envUrl = process.env.NEXT_PUBLIC_LANGFLOW_URL
  if (envUrl) {
    return envUrl
  }

  // If API URL is set and no separate Langflow URL, wrapper serves UI + API on same host
  const api = process.env.NEXT_PUBLIC_AICCORE_API_URL
  if (api && !api.startsWith('/')) {
    return api.replace(/\/$/, '')
  }

  // Fallback for local development
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:7860`
    }
  }

  return 'http://localhost:7860'
}
