import './globals.css'
import { Toaster } from 'sonner'

// CRITICAL (Aug 2026): force every HTML response to render dynamically.
// Without this, Next statically prerenders the shell and serves it with
// "s-maxage=31536000, stale-while-revalidate" — phones/CDNs then keep the
// OLD app for up to a YEAR after a redeploy (users saw stale UIs that no
// force-close would fix). Dynamic rendering sends no-store headers instead.
export const dynamic = 'force-dynamic'

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
      { url: '/favicon-32-v3.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192-v3.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512-v3.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon-v3.png', sizes: '180x180', type: 'image/png' },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved theme BEFORE first paint (no flash) — works on every
            route (/login, /admin, main app). Values: light | dark | system. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sw_theme')||'light';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ShelfWise" />
        <link rel="apple-touch-icon" href="/apple-touch-icon-v3.png" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
