/*
 * Service Worker — micro-landing-el-ancla
 *
 * Objetivo unico: evitar que el navegador del Stick TV reemplace la pantalla
 * por ERR_INTERNET_DISCONNECTED cuando la wifi del local se cae.
 *
 * Estrategia: network-first con fallback a cache.
 *   - Online: pedimos a la red, cacheamos la respuesta, devolvemos al cliente.
 *   - Offline: si la red falla, devolvemos la copia cacheada (datos stale
 *     pero pantalla viva). Si no hay cache para ese request especifico,
 *     intentamos devolver el "/" cacheado como ultimo recurso.
 *
 * Solo intercepta GET same-origin. POST/PUT/etc. y requests a otros origenes
 * pasan sin interferencia.
 *
 * Versionado del cache: el CACHE_VERSION debe bumpearse cada vez que cambia
 * algo que rompa compatibilidad con caches viejas. Al activar la nueva
 * version, el SW borra todas las caches que no coincidan.
 */

const CACHE_VERSION = 'micro-landing-v1'

self.addEventListener('install', () => {
  // Skip waiting para que un SW nuevo desplace al viejo en cuanto se descarga,
  // sin esperar que se cierren todas las pestanas (en el Stick TV no hay
  // multiples pestanas, asi que la espera seria infinita).
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpiar caches viejas.
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      )
      // claim() hace que el SW recien activado tome control de las pestanas
      // que ya estaban abiertas sin esperar a la proxima navegacion.
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request

  // Solo GET — POST y compania no se cachean (no aplican aca, pero por las dudas).
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Solo same-origin — no nos metemos con fonts externas, beacons de
  // analytics, etc. (en este proyecto basicamente no hay, pero
  // defensivo). Vercel sirve _next/* desde el mismo origen.
  if (url.origin !== self.location.origin) return

  event.respondWith(handleFetch(req))
})

async function handleFetch(req) {
  const cache = await caches.open(CACHE_VERSION)

  try {
    const response = await fetch(req)
    // Cacheamos solo respuestas OK. Errores HTTP (404, 500) no se guardan
    // porque "cachear un error" empeora la situacion.
    if (response.ok) {
      // .clone() porque la response es un stream y solo se puede leer una vez:
      // una copia va al cache, la otra al cliente.
      cache.put(req, response.clone())
    }
    return response
  } catch (networkError) {
    // La red fallo (typicamente porque la wifi del local se cayo).
    // Intentamos devolver la version cacheada.
    const cached = await cache.match(req)
    if (cached) return cached

    // Ultimo recurso para navegaciones: devolver la home cacheada.
    // Asi una navegacion fresca a una URL no cacheada igual muestra algo.
    if (req.mode === 'navigate') {
      const homepage = await cache.match('/')
      if (homepage) return homepage
    }

    // No hay nada que servir. Propagamos el error (el browser veria
    // ERR_INTERNET_DISCONNECTED). Esto solo deberia pasar en el primer
    // load con red caida — situacion fuera del alcance del SW.
    throw networkError
  }
}
