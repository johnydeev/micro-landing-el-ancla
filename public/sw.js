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

// v6: auditoria de rendimiento Fire TV. Se elimino esRscRequest() y la
// rama de manejo de RSC en handleFetch(). Ese codigo protegia contra
// router.refresh() (sesion 7-8), pero desde sesion 10 la app no hace NINGUN
// fetch client-side: los datos vienen solo por props del Server Component y
// el unico refresh es un reload completo (navegacion real, no RSC). La rama
// RSC era codigo muerto desde entonces. Historial completo de por que
// existia en docs/decisiones.md (ADR "Service Worker v2").
//
// v5/v4: sesion 10. Se elimino el polling de /api/* y se agrego reload
// completo cada 1 hora + HealthIndicator.
const CACHE_VERSION = 'micro-landing-v6'

/*
 * WATCHDOG (sesion 11) — recupera la pantalla cuando el main thread del
 * Stick TV se freeza.
 *
 * El main thread envia un postMessage de tipo 'heartbeat' cada 20s. El SW
 * registra el timestamp del ultimo heartbeat por cliente. Si pasa mas de
 * HEARTBEAT_TIMEOUT_MS sin recibir uno, asumimos que ese cliente esta
 * freezado y disparamos client.navigate(client.url) — un reload forzado
 * que el browser ejecuta a nivel de motor, sin depender del JS del main
 * thread (que esta muerto).
 *
 * Por que esto puede recuperar lo que el location.reload() del main thread
 * no puede: el location.reload() corre EN el main thread; si el thread esta
 * bloqueado, nunca se ejecuta. client.navigate() corre EN el SW (otro thread),
 * el browser lo procesa, y la pestana se reloadea.
 *
 * Limitacion honesta: el SW puede ser dormido por el browser cuando esta
 * idle. Si el main thread muere y el SW tambien se durmio, no hay quien
 * dispare el check. Mitigamos esto con un setTimeout dentro de waitUntil
 * que mantiene al SW vivo por HEARTBEAT_TIMEOUT_MS + gracia despues de
 * cada heartbeat — asi el SW siempre esta vivo el tiempo suficiente para
 * detectar la ausencia de heartbeats subsiguientes.
 */
const HEARTBEAT_TIMEOUT_MS = 60 * 1000
const HEARTBEAT_CHECK_GRACE_MS = 5 * 1000
const lastHeartbeat = new Map()

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'heartbeat') return

  const clientId = event.source?.id
  if (clientId) {
    lastHeartbeat.set(clientId, Date.now())
  }

  // Mantener el SW vivo el tiempo suficiente para detectar si los heartbeats
  // dejan de llegar. Si llega otro heartbeat antes, este setTimeout corre
  // igual y solo encuentra timestamps frescos (no navega a nadie).
  event.waitUntil(
    new Promise((resolve) => {
      setTimeout(() => {
        checkDeadClients().finally(resolve)
      }, HEARTBEAT_TIMEOUT_MS + HEARTBEAT_CHECK_GRACE_MS)
    }),
  )
})

async function checkDeadClients() {
  const now = Date.now()
  const clients = await self.clients.matchAll({ type: 'window' })
  const activeIds = new Set(clients.map((c) => c.id))

  // Limpieza: borrar timestamps de clientes que ya no existen.
  for (const id of lastHeartbeat.keys()) {
    if (!activeIds.has(id)) lastHeartbeat.delete(id)
  }

  // Chequear cada cliente activo.
  for (const client of clients) {
    const lastBeat = lastHeartbeat.get(client.id) ?? now
    const silentFor = now - lastBeat

    if (silentFor > HEARTBEAT_TIMEOUT_MS) {
      console.warn(
        `[sw watchdog] cliente ${client.id} silencioso por ${silentFor}ms — reloading`,
      )
      try {
        await client.navigate(client.url)
        lastHeartbeat.delete(client.id)
      } catch (err) {
        console.error('[sw watchdog] navigate fallo:', err)
      }
    }
  }
}

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
    // Intentamos devolver la version cacheada del mismo request.
    const cached = await cache.match(req)
    if (cached) return cached

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
