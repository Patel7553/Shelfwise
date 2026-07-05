'use client'
// Lightweight in-file i18n for ShelfWise — no external libraries.
// Usage:
//   import { useT, LANGS, setLang, getLang } from '@/lib/i18n'
//   const T = useT()
//   <p>{T('nav_dashboard')}</p>
//
// Language is persisted in localStorage ('shelfwise-lang'), and any
// change dispatches a custom event so every component using useT() re-renders.

import { useEffect, useState } from 'react'

export const LANGS = [
  { code: 'en', label: 'English',   flag: '🇬🇧' },
  { code: 'hi', label: 'हिन्दी',      flag: '🇮🇳' },
  { code: 'gu', label: 'ગુજરાતી',   flag: '🇮🇳' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ',      flag: '🇮🇳' },
  { code: 'es', label: 'Español',   flag: '🇪🇸' },
]

// Master dictionary. Keys are stable IDs — never change them.
// English is the source of truth; other langs fall back to English if missing.
const DICT = {
  // ---------- Navigation ----------
  nav_dashboard:   { en: 'Dashboard',   hi: 'डैशबोर्ड',       gu: 'ડેશબોર્ડ',        pa: 'ਡੈਸ਼ਬੋਰਡ',        es: 'Panel' },
  nav_inventory:   { en: 'Inventory',   hi: 'इन्वेंटरी',      gu: 'ઇન્વેન્ટરી',      pa: 'ਇਨਵੈਂਟਰੀ',       es: 'Inventario' },
  nav_recipes:     { en: 'Recipes',     hi: 'रेसिपी',          gu: 'રેસિપી',          pa: 'ਪਕਵਾਨ',           es: 'Recetas' },
  nav_rota:        { en: 'Rota',        hi: 'रोटा',            gu: 'રોટા',             pa: 'ਰੋਟਾ',              es: 'Turnos' },
  nav_waste:       { en: 'Waste',       hi: 'बर्बादी',         gu: 'બગાડ',             pa: 'ਬਰਬਾਦੀ',          es: 'Desperdicio' },
  nav_compliance:  { en: 'Compliance',  hi: 'अनुपालन',         gu: 'અનુપાલન',         pa: 'ਪਾਲਣਾ',            es: 'Cumplimiento' },
  nav_admin:       { en: 'Admin',       hi: 'एडमिन',           gu: 'એડમિન',           pa: 'ਐਡਮਿਨ',           es: 'Admin' },
  nav_settings:    { en: 'Settings',    hi: 'सेटिंग्स',       gu: 'સેટિંગ્સ',        pa: 'ਸੈਟਿੰਗਾਂ',        es: 'Ajustes' },
  nav_signout:     { en: 'Sign out',    hi: 'साइन आउट',       gu: 'સાઈન આઉટ',       pa: 'ਸਾਈਨ ਆਊਟ',       es: 'Cerrar sesión' },

  // ---------- Common buttons / labels ----------
  lbl_save:      { en: 'Save',      hi: 'सहेजें',       gu: 'સાચવો',        pa: 'ਸੰਭਾਲੋ',        es: 'Guardar' },
  lbl_cancel:    { en: 'Cancel',    hi: 'रद्द करें',    gu: 'રદ કરો',       pa: 'ਰੱਦ ਕਰੋ',       es: 'Cancelar' },
  lbl_delete:    { en: 'Delete',    hi: 'हटाएं',        gu: 'કાઢી નાખો',    pa: 'ਹਟਾਓ',          es: 'Eliminar' },
  lbl_edit:      { en: 'Edit',      hi: 'संपादित करें', gu: 'સંપાદિત કરો',  pa: 'ਸੋਧੋ',            es: 'Editar' },
  lbl_close:     { en: 'Close',     hi: 'बंद करें',     gu: 'બંધ કરો',      pa: 'ਬੰਦ ਕਰੋ',       es: 'Cerrar' },
  lbl_search:    { en: 'Search',    hi: 'खोज',          gu: 'શોધ',          pa: 'ਖੋਜ',            es: 'Buscar' },
  lbl_add:       { en: 'Add',       hi: 'जोड़ें',        gu: 'ઉમેરો',        pa: 'ਸ਼ਾਮਲ ਕਰੋ',      es: 'Añadir' },
  lbl_language:  { en: 'Language',  hi: 'भाषा',          gu: 'ભાષા',         pa: 'ਭਾਸ਼ਾ',          es: 'Idioma' },
  lbl_yes:       { en: 'Yes',       hi: 'हाँ',           gu: 'હા',            pa: 'ਹਾਂ',            es: 'Sí' },
  lbl_no:        { en: 'No',        hi: 'नहीं',          gu: 'ના',            pa: 'ਨਹੀਂ',          es: 'No' },
  lbl_export:    { en: 'Export CSV',hi: 'CSV एक्सपोर्ट', gu: 'CSV એક્સપોર્ટ', pa: 'CSV ਐਕਸਪੋਰਟ',   es: 'Exportar CSV' },
  lbl_print:     { en: 'Print',     hi: 'प्रिंट',        gu: 'પ્રિન્ટ',       pa: 'ਪ੍ਰਿੰਟ',         es: 'Imprimir' },
  lbl_refresh:   { en: 'Refresh',   hi: 'रीफ्रेश',       gu: 'રીફ્રેશ',       pa: 'ਤਾਜ਼ਾ ਕਰੋ',      es: 'Refrescar' },

  // ---------- Status pills ----------
  status_expired:   { en: 'Expired',       hi: 'समय समाप्त',   gu: 'સમય પૂરો',      pa: 'ਮਿਆਦ ਪੁੱਗ ਗਈ',  es: 'Caducado' },
  status_expiring:  { en: 'Expiring Soon', hi: 'जल्द समाप्त',  gu: 'ટૂંક સમયમાં પૂરું', pa: 'ਜਲਦੀ ਖ਼ਤਮ',   es: 'Caduca pronto' },
  status_critical:  { en: 'Critical Stock',hi: 'कम स्टॉक',      gu: 'ઓછો સ્ટોક',      pa: 'ਘੱਟ ਸਟਾਕ',      es: 'Stock crítico' },
  status_ok:        { en: 'OK',            hi: 'ठीक',           gu: 'બરાબર',          pa: 'ਠੀਕ',             es: 'OK' },
  status_all:       { en: 'All',           hi: 'सभी',           gu: 'બધા',            pa: 'ਸਾਰੇ',           es: 'Todos' },

  // ---------- Dashboard actions ----------
  dash_add_item:      { en: 'Add Item',        hi: 'आइटम जोड़ें',   gu: 'આઈટમ ઉમેરો',    pa: 'ਆਈਟਮ ਸ਼ਾਮਲ ਕਰੋ', es: 'Añadir artículo' },
  dash_voice:         { en: 'Voice Scanner',   hi: 'वॉइस स्कैनर',    gu: 'વૉઇસ સ્કેનર',    pa: 'ਵੌਇਸ ਸਕੈਨਰ',      es: 'Escáner de voz' },
  dash_snap:          { en: 'Snap Label',      hi: 'लेबल स्कैन',      gu: 'લેબલ સ્કેન',      pa: 'ਲੇਬਲ ਸਕੈਨ',       es: 'Escanear etiqueta' },
  dash_invoice:       { en: 'Supplier Invoice',hi: 'सप्लायर बिल',    gu: 'સપ્લાયર બિલ',    pa: 'ਸਪਲਾਇਰ ਬਿੱਲ',    es: 'Factura del proveedor' },
  dash_recipes:       { en: 'Recipes',         hi: 'रेसिपी',         gu: 'રેસિપી',         pa: 'ਪਕਵਾਨ',           es: 'Recetas' },
  dash_ai_recipe:     { en: 'AI Recipe',       hi: 'AI रेसिपी',      gu: 'AI રેસિપી',      pa: 'AI ਪਕਵਾਨ',        es: 'Receta con IA' },
  dash_print_log:     { en: 'Print Logbook',   hi: 'लॉगबुक प्रिंट',   gu: 'લોગબુક પ્રિન્ટ',  pa: 'ਲੌਗਬੁੱਕ ਪ੍ਰਿੰਟ',   es: 'Imprimir registro' },

  // ---------- Inventory ----------
  inv_title:          { en: 'Inventory',           hi: 'इन्वेंटरी',       gu: 'ઇન્વેન્ટરી',       pa: 'ਇਨਵੈਂਟਰੀ',       es: 'Inventario' },
  inv_search_ph:      { en: 'Search items…',       hi: 'आइटम खोजें…',    gu: 'આઈટમ શોધો…',    pa: 'ਆਈਟਮ ਖੋਜੋ…',   es: 'Buscar artículos…' },
  inv_category:       { en: 'Category',            hi: 'श्रेणी',          gu: 'શ્રેણી',          pa: 'ਸ਼੍ਰੇਣੀ',           es: 'Categoría' },
  inv_storage:        { en: 'Storage',             hi: 'भंडारण',          gu: 'સંગ્રહ',           pa: 'ਸਟੋਰੇਜ',           es: 'Almacenamiento' },
  inv_expiry:         { en: 'Expiry',              hi: 'समाप्ति',         gu: 'સમાપ્તિ',         pa: 'ਮਿਆਦ',              es: 'Caducidad' },
  inv_quantity:       { en: 'Quantity',            hi: 'मात्रा',          gu: 'જથ્થો',           pa: 'ਮਾਤਰਾ',             es: 'Cantidad' },
  inv_no_items:       { en: 'No items yet',        hi: 'कोई आइटम नहीं',   gu: 'કોઈ આઇટમ નથી',   pa: 'ਕੋਈ ਆਈਟਮ ਨਹੀਂ',  es: 'Sin artículos' },

  // ---------- Settings dialog ----------
  set_title:            { en: 'Settings',           hi: 'सेटिंग्स',         gu: 'સેટિંગ્સ',         pa: 'ਸੈਟਿੰਗਾਂ',         es: 'Ajustes' },
  set_kitchen_name:     { en: 'Kitchen Name',       hi: 'रसोई का नाम',      gu: 'રસોડાનું નામ',    pa: 'ਰਸੋਈ ਦਾ ਨਾਮ',      es: 'Nombre de la cocina' },
  set_language:         { en: 'App Language',       hi: 'ऐप की भाषा',       gu: 'એપ ભાષા',         pa: 'ਐਪ ਦੀ ਭਾਸ਼ਾ',      es: 'Idioma de la app' },
  set_language_desc:    { en: 'Menus, buttons and messages will use this language.',
                          hi: 'मेनू, बटन और संदेश इसी भाषा में दिखेंगे।',
                          gu: 'મેનૂ, બટન અને સંદેશ આ ભાષામાં દેખાશે.',
                          pa: 'ਮੀਨੂ, ਬਟਨ ਅਤੇ ਸੁਨੇਹੇ ਇਸੇ ਭਾਸ਼ਾ ਵਿੱਚ ਹੋਣਗੇ।',
                          es: 'Los menús, botones y mensajes se mostrarán en este idioma.' },
  set_currency:         { en: 'Currency',           hi: 'मुद्रा',            gu: 'ચલણ',              pa: 'ਮੁਦਰਾ',              es: 'Moneda' },
  set_timezone:         { en: 'Timezone',           hi: 'समय क्षेत्र',       gu: 'ટાઈમઝોન',          pa: 'ਟਾਈਮਜ਼ੋਨ',           es: 'Zona horaria' },

  // ---------- Login ----------
  login_welcome:  { en: 'Welcome back',   hi: 'फिर से स्वागत है',   gu: 'ફરી સ્વાગત છે',    pa: 'ਮੁੜ ਸਵਾਗਤ ਹੈ',      es: 'Bienvenido de nuevo' },
  login_subtitle: { en: 'Sign in to your kitchen', hi: 'अपनी रसोई में साइन इन करें', gu: 'તમારા રસોડામાં સાઇન ઇન કરો', pa: 'ਆਪਣੀ ਰਸੋਈ ਵਿੱਚ ਸਾਈਨ ਇਨ ਕਰੋ', es: 'Inicia sesión en tu cocina' },
  login_email:    { en: 'Email',           hi: 'ईमेल',                gu: 'ઈમેલ',              pa: 'ਈਮੇਲ',              es: 'Correo electrónico' },
  login_password: { en: 'Password',        hi: 'पासवर्ड',             gu: 'પાસવર્ડ',           pa: 'ਪਾਸਵਰਡ',           es: 'Contraseña' },
  login_signin:   { en: 'Sign in',         hi: 'साइन इन',             gu: 'સાઇન ઇન',           pa: 'ਸਾਈਨ ਇਨ',          es: 'Iniciar sesión' },
  login_signup:   { en: 'Create account',  hi: 'खाता बनाएं',          gu: 'ખાતું બનાવો',       pa: 'ਖਾਤਾ ਬਣਾਓ',        es: 'Crear cuenta' },
  login_forgot:   { en: 'Forgot password?',hi: 'पासवर्ड भूल गए?',      gu: 'પાસવર્ડ ભૂલી ગયા?', pa: 'ਪਾਸਵਰਡ ਭੁੱਲ ਗਏ?',   es: '¿Olvidaste tu contraseña?' },

  // ---------- Install prompt ----------
  install_title:    { en: 'Install ShelfWise',           hi: 'ShelfWise इंस्टॉल करें',     gu: 'ShelfWise ઇન્સ્ટોલ કરો',   pa: 'ShelfWise ਇੰਸਟਾਲ ਕਰੋ',     es: 'Instalar ShelfWise' },
  install_desc:     { en: 'Works like an app — one-tap from your home screen.',
                       hi: 'ऐप की तरह काम करता है — होम स्क्रीन से एक टैप में खोलें।',
                       gu: 'એપની જેમ કામ કરે છે — હોમ સ્ક્રીનથી એક ટેપમાં ખોલો.',
                       pa: 'ਐਪ ਦੀ ਤਰ੍ਹਾਂ ਕੰਮ ਕਰਦਾ ਹੈ — ਹੋਮ ਸਕ੍ਰੀਨ ਤੋਂ ਇੱਕ ਟੈਪ ਵਿੱਚ ਖੋਲ੍ਹੋ।',
                       es: 'Funciona como una app — un toque desde tu pantalla de inicio.' },
  install_btn_android: { en: 'Install on Android', hi: 'Android पर इंस्टॉल', gu: 'Android પર ઇન્સ્ટોલ', pa: 'Android ਤੇ ਇੰਸਟਾਲ', es: 'Instalar en Android' },
  install_btn_ios:     { en: 'iPhone steps',       hi: 'iPhone तरीका',       gu: 'iPhone રીત',           pa: 'iPhone ਤਰੀਕਾ',      es: 'Guía para iPhone' },
  install_btn_desktop: { en: 'Install on Desktop', hi: 'डेस्कटॉप पर इंस्टॉल', gu: 'ડેસ્કટૉપ પર ઇન્સ્ટોલ', pa: 'ਡੈਸਕਟਾਪ ਤੇ ਇੰਸਟਾਲ', es: 'Instalar en escritorio' },
  install_show_me:     { en: 'Show me',            hi: 'दिखाएँ',              gu: 'બતાવો',                pa: 'ਦਿਖਾਓ',             es: 'Mostrar' },
  install_compact_msg: { en: 'Add ShelfWise to home screen', hi: 'ShelfWise को होम स्क्रीन पर जोड़ें', gu: 'ShelfWise ને હોમ સ્ક્રીન પર ઉમેરો', pa: 'ShelfWise ਨੂੰ ਹੋਮ ਸਕ੍ਰੀਨ ਤੇ ਸ਼ਾਮਲ ਕਰੋ', es: 'Añade ShelfWise a la pantalla de inicio' },
}

const STORAGE_KEY = 'shelfwise-lang'
const EVENT_KEY   = 'shelfwise-lang-change'

export function getLang() {
  if (typeof window === 'undefined') return 'en'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && LANGS.find(l => l.code === v)) return v
  } catch (_) { /* localStorage unavailable */ }
  return 'en'
}

export function setLang(code) {
  if (typeof window === 'undefined') return
  if (!LANGS.find(l => l.code === code)) return
  try {
    localStorage.setItem(STORAGE_KEY, code)
    window.dispatchEvent(new Event(EVENT_KEY))
  } catch (_) { /* localStorage unavailable */ }
}

// Non-hook translate — safe to call anywhere.
export function t(key, lang) {
  const entry = DICT[key]
  if (!entry) return key
  return entry[lang || 'en'] || entry.en || key
}

// React hook — re-renders subscribers when language changes.
export function useLang() {
  const [lang, setLangState] = useState('en')
  useEffect(() => {
    setLangState(getLang())
    const onChange = () => setLangState(getLang())
    window.addEventListener(EVENT_KEY, onChange)
    // Cross-tab sync
    const onStorage = (e) => { if (e.key === STORAGE_KEY) setLangState(getLang()) }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(EVENT_KEY, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return lang
}

// Returns a translator function bound to the current language.
export function useT() {
  const lang = useLang()
  return (key) => t(key, lang)
}
