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
