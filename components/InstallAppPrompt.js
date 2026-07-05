'use client'
// InstallAppPrompt — smart PWA install banner.
// - Android/Chrome: catches `beforeinstallprompt` → one-tap native install
// - iOS Safari: shows step-by-step instructions (Apple blocks programmatic install)
// - Desktop Chrome/Edge: same as Android
// - Hides itself if the app is already installed (standalone display mode)
// - Remembers dismissal in localStorage for 30 days

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { X, Download, Share, Plus, Smartphone } from 'lucide-react'

const DISMISS_KEY = 'shelfwise-install-dismissed-at'
const DISMISS_DAYS = 30

export default function InstallAppPrompt({ compact = false }) {
  const [platform, setPlatform] = useState(null)   // 'android' | 'ios' | 'desktop' | 'installed'
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)
  const [showIosSteps, setShowIosSteps] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Already installed?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS-specific check
      // eslint-disable-next-line
      (window.navigator).standalone === true
    if (isStandalone) { setPlatform('installed'); return }

    // Dismissed recently?
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (dismissedAt && (Date.now() - dismissedAt) < DISMISS_DAYS * 86400000) {
      return
    }

    const ua = navigator.userAgent || ''
    const isIOS = /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS/.test(ua)  // must be Safari to install
    const isAndroid = /Android/i.test(ua)

    // Android / Desktop Chrome: capture the install prompt when browser offers it
    const beforeInstallHandler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setPlatform(isAndroid ? 'android' : 'desktop')
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', beforeInstallHandler)

    // iOS: never fires beforeinstallprompt, so we detect and show right away
    if (isIOS) {
      setPlatform('ios')
      setVisible(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', beforeInstallHandler)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    }
    setDeferredPrompt(null)
  }

  if (!visible || platform === 'installed' || !platform) return null

  // COMPACT variant (top of an app page — small strip)
  if (compact) {
    return (
      <>
        <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-2 flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="h-4 w-4 text-emerald-700 shrink-0" />
            <p className="text-emerald-900 text-xs sm:text-sm truncate">
              <b>Add ShelfWise to home screen</b> — works like an app
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {platform === 'ios'
              ? <Button size="sm" onClick={() => setShowIosSteps(true)} className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700">Show me</Button>
              : <Button size="sm" onClick={handleAndroidInstall} className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700"><Download className="h-3 w-3 mr-1" /> Install</Button>
            }
            <button onClick={dismiss} className="h-7 w-7 flex items-center justify-center rounded text-emerald-800 hover:bg-emerald-100" title="Dismiss for 30 days">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <IosStepsModal open={showIosSteps} onClose={() => setShowIosSteps(false)} />
      </>
    )
  }

  // FULL variant (login page — big friendly card with both platforms)
  return (
    <>
      <div className="mt-4 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900">Install ShelfWise on your phone</p>
            <p className="text-xs text-slate-600 mt-0.5">Works like an app — one-tap from your home screen. No app store needed.</p>
          </div>
          <button onClick={dismiss} className="h-7 w-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 shrink-0" title="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {/* Android / Desktop button (works if the browser has fired the prompt) */}
          {(platform === 'android' || platform === 'desktop') && (
            <Button onClick={handleAndroidInstall} className="w-full bg-emerald-600 hover:bg-emerald-700">
              <Download className="h-4 w-4 mr-2" />
              {platform === 'android' ? 'Install on Android' : 'Install on Desktop'}
            </Button>
          )}
          {/* iOS button — opens step-by-step modal */}
          {platform === 'ios' && (
            <Button onClick={() => setShowIosSteps(true)} className="w-full bg-slate-900 hover:bg-slate-800 col-span-2">
              <Share className="h-4 w-4 mr-2" /> Add to iPhone home screen
            </Button>
          )}
          {/* Show BOTH buttons on desktop so people can share the site with a phone user */}
          {(platform === 'desktop' || platform === 'android') && (
            <Button onClick={() => setShowIosSteps(true)} variant="outline" className="w-full">
              🍎 iPhone steps
            </Button>
          )}
        </div>
      </div>

      <IosStepsModal open={showIosSteps} onClose={() => setShowIosSteps(false)} />
    </>
  )
}

// ---- iOS step-by-step instructions modal ----
function IosStepsModal({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">🍎 Add to iPhone Home Screen</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-slate-600">Apple doesn't allow one-tap installs, but it only takes 3 taps in Safari:</p>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="h-8 w-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">1</div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Tap the <Share className="inline h-4 w-4 text-blue-600" /> <b>Share</b> button</p>
                <p className="text-xs text-slate-600 mt-0.5">Bottom of the screen on iPhone · top of the screen on iPad</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="h-8 w-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">2</div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Scroll down and tap <Plus className="inline h-4 w-4 text-blue-600" /> <b>Add to Home Screen</b></p>
                <p className="text-xs text-slate-600 mt-0.5">It's in the second row of the share menu</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="h-8 w-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0">3</div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Tap <b>Add</b> in the top-right</p>
                <p className="text-xs text-slate-600 mt-0.5">ShelfWise 🍅 will appear on your home screen — tap to open like any app</p>
              </div>
            </div>
          </div>

          <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            💡 <b>Important:</b> This only works in <b>Safari</b>. If you're using Chrome/Firefox on iPhone, tap the ↕ icon → "Open in Safari" first.
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="w-full">Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
