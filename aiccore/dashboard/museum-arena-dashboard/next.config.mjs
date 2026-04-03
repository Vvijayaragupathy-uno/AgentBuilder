import path from "node:path"
import { fileURLToPath } from "node:url"

/** Directory containing this config — the real Next app root (avoids monorepo lockfile confusion). */
const appDir = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
function normalizeRewriteUpstream(raw) {
  const s = (raw || "").trim()
  if (!s || s.startsWith("/")) return ""
  if (s.startsWith("http://") || s.startsWith("https://")) return s
  // Railway often provides hostname only (e.g. *.up.railway.app)
  return `https://${s}`
}

const upstream = normalizeRewriteUpstream(
  process.env.AICCORE_UPSTREAM_URL ||
    process.env.NEXT_PUBLIC_AICCORE_API_URL ||
    "",
)

const nextConfig = {
  /**
   * Without this, Next may infer `AgentBuilder/` as the workspace root (extra package-lock.json there),
   * which breaks Turbopack/Tailwind content paths and can make `/tv` look unstyled or stale vs source.
   */
  turbopack: {
    root: appDir,
  },
  typescript: {
    // Fix reported TS errors instead of hiding them (run `npm run build` locally).
    ignoreBuildErrors: false,
  },
  /**
   * Same-origin proxy: browser uses /aiccore-api/* → upstream Langflow+AICCORE server.
   * Set NEXT_PUBLIC_AICCORE_PROXY_PREFIX=/aiccore-api on the dashboard + AICCORE_UPSTREAM_URL
   * (server-side) to the real backend URL. Fixes session cookies for embedded Langflow.
   *
   * WebSocket: `wss://your-dashboard/aiccore-api/api/v1/aiccore/ws` is proxied like HTTP.
   * If upgrades fail on your host, point the TV/builder at the backend URL directly (no proxy).
   */
  async rewrites() {
    if (!upstream || upstream.startsWith("/")) return []
    const base = upstream.replace(/\/$/, "")
    return [{ source: "/aiccore-api/:path*", destination: `${base}/:path*` }]
  },
  async redirects() {
    return [
      {
        source: "/challenges",
        destination: "/?tab=challenges",
        permanent: false,
      },
      {
        source: "/challenges/:id",
        destination: "/?tab=challenges",
        permanent: false,
      },
    ]
  },
}

export default nextConfig
