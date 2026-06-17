'use client'

import { useEffect } from 'react'

/*
 * Registra el Service Worker (public/sw.js) la primera vez que la pagina
 * se carga en el cliente. Solo en produccion: en dev el SW es un dolor
 * porque cachea codigo viejo y obliga a hard-reload constante.
 *
 * Una vez registrado, el SW persiste entre reloads y boots del Stick TV.
 * Solo se desinstala explicitamente desde devtools o si se cambia
 * `CACHE_VERSION` en sw.js y el SW viejo tira error en la activacion.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // No mostramos al usuario — el SW es enhancement, no critico.
      // Si falla, la app sigue funcionando como antes (sin offline support).
      console.error('[sw] registration failed:', err)
    })
  }, [])

  return null
}
