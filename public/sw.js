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

// v4: sesion 10. Cambio arquitectonico — se elimino el polling de /api/*
// y se agrego reload completo cada 1 hora + HealthIndicator. Bumpeamos
// CACHE_VERSION para que los Sticks invaliden el cache viejo (que aun
// referenciaba el JS de la sesion 8) y descarguen el nuevo bundle con
// la arquitectura sin polling.
//
// v3: el cliente ya no usa router.refresh (sesion 8 — pasamos a fetch a
// /api/* + useState). Eso significa que ya no hay RSC requests periodicos
// que pudieran romper el browser cuando falla la red, asi que la
// distincion RSC/HTML del v2 quedo academica. Igual la mantenemos por las
// dudas (navegacion directa a la URL podria seguir generando RSC).
//
// v2: trata los RSC requests (router.refresh) por separado. Antes, cuando
// fallaba la red y no habia RSC cacheado, devolviamos el HTML de `/` como
// fallback — pero Next esperaba un payload RSC binario, no HTML. Eso
// rompia el parser de React en el cliente y dejaba el main thread del
// browser bloqueado: la rotacion se freezaba en una oferta y los inputs
// del control remoto no respondian. Ahora un RSC sin cache propio falla
// limpio y Next lo maneja internamente sin romper nada.
const CACHE_VERSION = 'micro-landing-v4'

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

  event.respondWith(handleFetch(req, url))
})

/*
 * Distingue requests RSC (los que dispara router.refresh y la navegacion
 * client-side de Next) de navegaciones HTML normales.
 *
 * - URL con `?_rsc=...`: Next agrega ese query param en todos los RSC
 *   fetches client-side.
 * - Header `RSC: 1` o `Next-Router-State-Tree`: presentes en RSC fetches.
 *
 * Importa diferenciar porque RSC y HTML tienen content-types distintos
 * y el cliente Next rompe si recibe HTML donde esperaba un payload RSC.
 */
function esRscRequest(req, url) {
  if (url.searchParams.has('_rsc')) return true
  if (req.headers.get('RSC')) return true
  if (req.headers.get('Next-Router-State-Tree')) return true
  return false
}

async function handleFetch(req, url) {
  const cache = await caches.open(CACHE_VERSION)
  const isRsc = esRscRequest(req, url)

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
    // Intentamos devolver la version cacheada del mismo request.
    const cached = await cache.match(req)
    if (cached) return cached

    // RSC sin cache propio: dejar que falle. NUNCA devolver HTML aca —
    // si Next recibe HTML donde esperaba RSC, rompe el parser de React
    // y bloquea el main thread del browser (rotacion congelada + inputs
    // muertos). Mejor que el refresh falle silenciosamente: Next maneja
    // ese error internamente y simplemente no actualiza la data.
    if (isRsc) {
      throw networkError
    }

    // Para navegaciones HTML reales (full page load), el / cacheado es
    // un buen ultimo recurso. Solo se llega aca si la URL pedida nunca
    // se cacheo antes — situacion rara en una pantalla 16:9 con una sola ruta.
    if (req.mode === 'navigate') {
      const homepage = await cache.match('/')
      if (homepage) return homepage
    }

    // No hay nada que servir. Propagamos el error original.
    throw networkError
  }
}
