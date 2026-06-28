import './globals.css'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'ShelfWise — Kitchen Inventory & Waste Reduction',
  description: 'Smart inventory management for restaurants, cafes & institutional kitchens. Track expiries, reduce waste.',
  manifest: '/manifest.json',
  applicationName: 'ShelfWise',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ShelfWise',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  formatDetection: { telephone: false },
}

export const viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ShelfWise" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
