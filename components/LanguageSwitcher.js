'use client'
// Reusable language switcher — used in Settings dialog and (small variant) on login page.

import { LANGS, useLang, setLang } from '@/lib/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Globe } from 'lucide-react'

export default function LanguageSwitcher({ compact = false, className = '' }) {
  const lang = useLang()

  const handleChange = (code) => {
    setLang(code)
    // Optional: light haptic feedback on mobile
    try { navigator.vibrate?.(10) } catch (_) {}
  }

  if (compact) {
    // Small, icon-first variant for tight spaces (e.g. login page corner)
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <Globe className="h-4 w-4 text-slate-500 shrink-0" />
        <Select value={lang} onValueChange={handleChange}>
          <SelectTrigger className="h-8 min-w-[7.5rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGS.map(l => (
              <SelectItem key={l.code} value={l.code} className="text-sm">
                <span className="mr-1">{l.flag}</span> {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  // Full variant — used inside Settings dialog
  return (
    <div className={className}>
      <Select value={lang} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent>
          {LANGS.map(l => (
            <SelectItem key={l.code} value={l.code}>
              <span className="mr-2">{l.flag}</span> {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
