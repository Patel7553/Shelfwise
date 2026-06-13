import './globals.css'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'ShelfWise — Kitchen Inventory & Waste Reduction',
  description: 'Smart inventory management for restaurants, cafes & institutional kitchens. Track expiries, reduce waste.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
