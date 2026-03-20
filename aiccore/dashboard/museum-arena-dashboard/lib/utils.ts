import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getApiBase() {
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

export function getLangflowUrl() {
  const envUrl = process.env.NEXT_PUBLIC_LANGFLOW_URL
  if (envUrl) {
    return envUrl
  }

  // Fallback for local development
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:5173`
    }
  }

  // Last resort fallback
  return 'http://localhost:5173'
}
