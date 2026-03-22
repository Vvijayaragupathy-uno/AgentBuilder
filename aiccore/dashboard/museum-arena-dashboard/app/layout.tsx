import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'AICCORE Makerspace',
  description: 'Live command center for the AICCORE Makerspace — arena dashboard, stations, and agent builder.',
}

export const viewport: Viewport = {
  themeColor: '#0f111c',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  )
}
