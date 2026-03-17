/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
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
