/** @type {import('next').NextConfig} */
const upstream =
  process.env.AICCORE_UPSTREAM_URL ||
  process.env.NEXT_PUBLIC_AICCORE_API_URL ||
  ""

const nextConfig = {
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
