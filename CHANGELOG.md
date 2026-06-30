# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/).
Versionado semántico cuando se publique a producción.

## [Unreleased]

### Sesión 14 — 2026-06-24 (Escala de tamaño: rango 55%-120%)

**Context**: el cliente pidió que el máximo de la escala de tamaño
llegara a 120% (antes 100%), para que algunas imágenes puedan exceder
su contenedor y tener más presencia.

**Changed**
- **`components/PantallaRotativa.tsx`**: `TAMANO_OFERTA_A_ESCALA`
  remapeado a rango 55%-120% con paso lineal ~7,22%:
  `1=55%, 2=62%, 3=69%, 4=77%, 5=84%, 6=91%, 7=98%, 8=106%, 9=113%,
  10=120%`. El default (nivel 6) pasó de 80% a 91%.
- **`lib/sheets.ts`** y **`types/index.ts`**: comentarios
  actualizados al nuevo rango. El parser (valores válidos 1-10) no
  cambió funcionalmente.
- **`docs/api.md`**: mapeo nuevo + nota sobre valores >100%.

**Trade-off**
- Niveles 8-10 superan el 100%: la imagen excede el wrapper y puede
  solaparse con el título o el círculo de precio del cartel.
  Intencional (pedido del cliente). Documentado en
  `docs/decisiones.md`; usar valores altos solo en imágenes que lo
  toleren.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0).
- `npm run build`: éxito.

---

### Sesión 13 — 2026-06-24 (Escala de tamaño de oferta ampliada a 1-10)

**Context**: el cliente reportó que la columna "Tamaño" no tomaba
valores y sospechaba de la ñ. Verificación contra el CSV real: la ñ
funciona perfecto; el problema era que cargó valores fuera de la
escala 1-5 (varios 10, un 7, un 6) que el parser descartaba al
default. El cliente eligió ampliar la escala en vez de corregir la
planilla.

**Changed**
- **`lib/sheets.ts`**: `TAMANO_OFERTA_MAX` 5 → 10,
  `TAMANO_OFERTA_DEFAULT` 3 → 6 (mantiene neutral en 80%).
- **`components/PantallaRotativa.tsx`**: `TAMANO_OFERTA_A_ESCALA`
  redefinido a 10 niveles, mapeo lineal 55%→100% con paso de 5%.
  Default extraído a `TAMANO_OFERTA_ESCALA_DEFAULT` (= nivel 6 = 80%).
- **`types/index.ts`**: comentario de `Oferta.tamano` actualizado
  a escala 1-10.
- **`docs/api.md`**: doc del campo `tamano` actualizada (1-10,
  default 6, mapeo).

**Mapeo nuevo**: 1=55%, 2=60%, 3=65%, 4=70%, 5=75%, 6=80% (default),
7=85%, 8=90%, 9=95%, 10=100%.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0).
- `npm run build`: éxito.
- Verificado contra los valores reales del cliente: 4→70%, 3→65%,
  6→80%, 7→85%, 10→100%. Ninguno cae ya al default.

---

### Sesión 12 — 2026-06-24 (Feature: atenuado de pantalla por horario)

**Added**
- **`components/DimOverlay.tsx`**: velo negro (`opacity` 0.94)
  superpuesto al `.screen` durante un rango horario configurable,
  transparente fuera de él, con transición suave de 2s. Re-evalúa la
  hora cada 30s vía `useSyncExternalStore`. Soporta rangos que cruzan
  medianoche. Si las claves faltan o el formato es inválido, no
  atenúa (fail-safe).
- **`types/index.ts`**: claves `atenuarDesde` y `atenuarHasta`
  (strings `"HH"` o `"HH:MM"`, formato 24hs) en `ConfigNegocio`.
- **`lib/sheets.ts`**: parsers y aliases para las dos claves nuevas
  (`atenuar desde`, `inicio atenuado`, `atenuar hasta`, `fin
  atenuado`, etc.).
- **`docs/api.md`**: documentación de las claves de atenuado en la
  pestaña CONFIG.

**Changed**
- **`PantallaRotativa.tsx`**: monta `<DimOverlay>` con
  `configRemota.atenuarDesde` / `.atenuarHasta`.

**Note sobre ahorro de energía**
- El overlay oscurece la imagen pero NO apaga el backlight en TVs
  LED/LCD → el ahorro de energía real es casi nulo en esas pantallas
  (sí ahorra en OLED). Para ahorro garantizado habría que cortar
  corriente, pero el cliente pidió explícitamente no apagar la
  pantalla. Detalle y alternativas en `docs/decisiones.md`.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0).
- `npm run build`: éxito.
- Lógica de rango horario testeada con casos sintéticos (rango
  13-16, cruce de medianoche 23-6, formato con minutos, valores
  inválidos).

---

### Sesión 11 — 2026-06-23 (Watchdog vía Service Worker)

**Context**: el freeze persistió después del deploy de sesión 10.
Cliente confirmó que el freeze pasa después de >1 hora (el reload
preventivo del main thread NO se ejecuta porque el thread ya está
muerto), con HealthIndicator en verde (no es problema de red) y
control remoto sin respuesta (main thread completamente muerto).
Única recuperación actual: power-cycle físico de la TV.

**Diagnostic insight**: cualquier mecanismo en el main thread es
inútil si el thread está muerto. Las únicas vías de recovery son
el Service Worker (corre en otro thread) o algo a nivel sistema
operativo (app kiosko, descartada). Implementamos la vía SW.

**Added**
- **`public/sw.js`**: implementado **watchdog completo**:
  - `Map<clientId, timestamp>` para registrar último heartbeat de
    cada cliente activo.
  - Listener `message` que procesa heartbeats y programa un check
    de clientes muertos vía `event.waitUntil(setTimeout(...))` —
    mantiene al SW vivo 65s después de cada heartbeat.
  - `checkDeadClients()`: si un cliente lleva más de
    `HEARTBEAT_TIMEOUT_MS` (60s) sin heartbeat, fuerza
    `client.navigate(client.url)` — reload desde el SW que
    funciona aunque el main thread esté muerto.
  - Limpieza automática del Map para clientes que ya no existen.
- **`PantallaRotativa.tsx`**: nuevo `useEffect` que envía
  `postMessage({ type: 'heartbeat' })` al SW cada
  `HEARTBEAT_INTERVAL_MS` (20s). Primera llamada inmediata.

**Changed**
- **`RELOAD_INTERVAL_MS`** en `PantallaRotativa.tsx`: 60 min → 30 min.
  Reduce ventana de exposición al freeze como capa adicional de
  prevención. Sigue corriendo en main thread, no es recovery, pero
  complementa al watchdog SW.
- **`public/sw.js`**: `CACHE_VERSION` bumpeado a
  `'micro-landing-v5'` para que los Sticks descarguen el JS nuevo
  con el código del heartbeat.

**Honest limitation**
- El SW también puede ser dormido por el browser cuando está idle.
  Mitigamos con el `waitUntil` que mantiene al SW vivo 65s después
  de cada heartbeat. Mientras el main thread está sano, el SW está
  siempre fresco. Cuando muere, el último heartbeat sigue
  manteniendo al SW vivo el tiempo suficiente para detectar la
  ausencia del próximo y disparar el navigate.
- No es 100% garantizado, pero cubre la gran mayoría de escenarios
  reales.

**Plan B documented**
- Si esto no resuelve, llegamos al techo de soluciones JS-only.
  Siguiente paso lógico: **Fully Kiosk Browser** (la opción del
  Stick descartada en sesión 6). Razones para reabrirla
  documentadas en `docs/decisiones.md`.

**Testing**
- Procedimiento para testear el watchdog sin esperar un freeze
  real documentado en `docs/decisiones.md`: Chrome desktop →
  `while(true){}` en console → esperar 65-70s → la página debería
  reloadearse sola.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0).
- `npm run build`: éxito.

---

### Sesión 10 — 2026-06-23 (Polling eliminado + reload horario + HealthIndicator)

**Context**: el freeze del Stick TV seguía apareciendo después de
sesiones 7-9 (~2 veces en 4 hs). El cliente reportó que también pasa
en tablas de texto puro (sin imágenes) y sin corte de red, con
periodicidad de ~2hs. Eso sugiere acumulación gradual de
memoria/estado en el browser del Stick, no las causas que ya
atacamos. Sin posibilidad de profilear remotamente, decidimos atacar
el síntoma con prevención agresiva.

**Removed**
- **Polling client-side de `/api/productos`, `/api/ofertas`,
  `/api/config`** desde `PantallaRotativa.tsx`. De ~4.320
  fetches/día a ~25/día (-99.4%). Los endpoints siguen vivos
  (documentados en `docs/api.md`), solo no los consume la pantalla.
- **`useState` para `listas`/`ofertas`/`configRemota`** — ya no
  hace falta, los datos vienen directo de props del Server Component
  en cada reload.

**Changed**
- **`PantallaRotativa.tsx`**: rotation state refactoreado a
  `useReducer` con `rotationReducer`. Anti-patrón eliminado: ya no
  llamamos a `setCartelIndex`/`setModo` dentro del updater de
  `setListaIndex`. Cada tick es un solo dispatch atómico que el
  reducer convierte en la transición completa.
- **`public/sw.js`**: `CACHE_VERSION` bumpeado a
  `'micro-landing-v4'` para invalidar el cache del JS de sesión 8.

**Added**
- **`window.location.reload()` cada 1 hora** vía `setInterval` en
  un `useEffect` dedicado. Doble propósito: refresh de datos (vía
  re-SSR) y reset preventivo de cualquier acumulación de memoria
  o listeners del browser.
- **`components/HealthIndicator.tsx`** — Client Component minúsculo
  que muestra un dot semi-transparente arriba a la derecha del
  `.screen`:
  - 🟢 verde: online
  - 🔴 rojo: offline
  - ⚪ gris: durante SSR / antes de hidratar
  - Usa `useSyncExternalStore` (patrón moderno R18+) para
    suscribirse a `online`/`offline` events sin polling.
- **`app/page.module.css`**: `.screen` ahora tiene
  `position: relative` para que el HealthIndicator se posicione
  `absolute` relativo al área de pantalla.

**Decided / Discarded**
- **Webhook server → cliente** (propuesta del cliente). Descartado
  por restricciones técnicas: el Stick TV está detrás de NAT (no
  alcanzable desde internet), Vercel free tier no soporta
  WebSocket/SSE long-lived. Para updates urgentes el operador
  power-cycla la TV (15 seg); caso normal espera al próximo reload
  horario.

**Trade-offs**
- Datos pueden tener hasta 1 hora de retraso entre edición en
  Sheets y aparición en pantalla. Aceptable para precios de
  carnicería.
- El reload horario funciona como **prevención** del freeze, no
  como recovery: si el thread ya está muerto cuando llega el
  momento del reload, no se ejecuta. Si esto sigue siendo
  insuficiente, la próxima iteración sería un watchdog vía Service
  Worker.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0). Lint nuevo de React 19
  (`set-state-in-effect`) requirió usar `useSyncExternalStore` en
  vez de `useState + useEffect` en HealthIndicator — quedó
  cumplido.
- `npm run build`: éxito.

**Doc updates**
- `docs/decisiones.md`: ADR completo con problema, decisión,
  trade-offs, alternativa descartada (webhook), e hipótesis sobre
  cuál de los tres frentes ya atacados sería el responsable real
  si el freeze desaparece.

---

### Sesión 9 — 2026-06-23 (Restauración de trabajo perdido por merge)

**Context**: el 19/06 una sesión Claude paralela optimizó las 17
imágenes de `public/ofertas/` (33.3 MB → 4.4 MB) bajo la hipótesis
de que el freeze residual del Stick TV — el que seguía pasando
después de la sesión 8 — era por presión de memoria/GPU al
decodificar PNGs pesados cada 3 segundos. El PR se mergeó a `master`
remoto. Un `git pull` local del 22/06 generó un merge automático
(`967b117`) que revirtió tanto las imágenes como el ADR completo en
`docs/decisiones.md`. El revisado de commits del 23/06 detectó la
regresión.

**Restored**
- **15 imágenes de `public/ofertas/`** restauradas desde el commit
  `5aa638f` con `git checkout` selectivo:
  `alita`, `bondiola`, `costillar`, `costillitas`, `falda`, `lomo`,
  `osobuco`, `paleta`, `patamuslo`, `patamusloxcaja`,
  `picada-premium`, `ribs`, `roastbeef`, `suprema`, `supremaxcaja`.
  `vacio.png` y `vacio2.png` NO se tocaron — johnydeev las gestionó
  intencionalmente después del PR.
- **ADR completo** "Optimizar peso de imágenes de ofertas
  (sospecha de freeze por memoria/decodificación)" restaurado en
  `docs/decisiones.md` con nota de procedencia que documenta el
  episodio del merge.

**Changed**
- **`lechon.png`** (1.33 MB, agregada el 20/06 sin pasar por el
  pipeline de optimización del PR) recomprimida con `sharp` con la
  misma configuración que usó la sesión paralela:
  `resize({ width: 1200, withoutEnlargement: true })` +
  `png({ compressionLevel: 9, effort: 10 })`. Resultado: 181 KB
  (-86 %).

**Result**
- Total de `public/ofertas/`: **4.08 MB en 19 archivos** (vs. 33.3
  MB que había en HEAD antes de esta sesión).
- Documentación restaurada en `docs/decisiones.md` y `docs/progreso.md`.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0).
- `npm run build`: éxito.

**Note operativa**
- En futuros `git pull` con cambios locales en archivos binarios y
  un PR remoto que también los toca: chequear explícitamente con
  `git diff HEAD~1 HEAD -- '*.png' --stat` que el merge automático
  no haya revertido binarios sin avisar.

---

### Sesión 8 — 2026-06-18 (Hotfix definitivo: sacar router.refresh)

**Context**: el v2 (sesión 7) no resolvió el bug. El cliente reportó
horas después que la rotación volvía a congelarse en una vista del
ciclo (una tabla esta vez) y el control remoto seguía sin responder.
Confirmado: la TV se apaga al fin de jornada y se enciende a la
mañana → la página carga JS limpio cada día → el bug no era de SW
viejo cacheado, era de Next/React manejando mal los errores de
`router.refresh()` ante fallos de red.

**Removed**
- `useRouter` y `startTransition` en `PantallaRotativa.tsx`.
- Los dos `useEffect` que hacían `router.refresh()` (uno periódico,
  otro en `online`).

**Changed**
- **`PantallaRotativa.tsx` reescrito**: datos ahora viven en
  `useState`, inicializados desde props del Server Component. Un
  único `useEffect` maneja:
  - Polling cada `minutosActualizacion` con `fetch` directo a
    `/api/productos`, `/api/ofertas`, `/api/config`.
  - Listener `window.online` para refrescar al volver la red.
  - Skip si `navigator.onLine === false`.
  - `try/catch` global + validación de shape antes de aplicar
    estado. Si algo falla, mantiene los datos viejos.
- **`public/sw.js`** — `CACHE_VERSION` bumpeado a `'micro-landing-v3'`
  para forzar invalidación del cache anterior y que los Sticks
  descarguen el JS sin `router.refresh()`.

**Why**
- `router.refresh()` es caja negra: no devuelve promesa, no se puede
  catchear, el manejo de errores depende de Next interno. Con `fetch`
  directo tenemos control total: error de red → no actualizamos
  estado → pantalla sigue viva con datos viejos.
- Los endpoints `/api/*` ya existían (sesión 1 + sesión 2
  documentados en `docs/api.md`). No hubo que construir nada nuevo.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0).
- `npm run build`: éxito.

**Doc updates**
- `docs/decisiones.md`: ADR completo "Sacar `router.refresh()` y
  pasar a fetch + useState" con diagnóstico ampliado, tabla
  comparativa, trade-offs.

---

### Sesión 7 — 2026-06-18 (Hotfix: SW v2 distingue RSC requests)

**Context**: el día siguiente al deploy del SW v1 (sesión 6), el
cliente reportó comportamiento nuevo en el Stick TV cuando se caía la
wifi. La pantalla blanca ya no aparecía (✓ objetivo cumplido), pero la
rotación se congelaba en una oferta y los inputs del control remoto no
respondían. Requería reinicio físico del Stick.

Causa raíz: el SW v1 servía HTML como último recurso para cualquier
request, incluyendo los RSC fetches que dispara `router.refresh()`.
Next esperaba payload RSC binario; al recibir HTML, el parser de
React entraba en estado inconsistente y bloqueaba el main thread del
browser.

**Changed**
- **`public/sw.js`** — versión bumpeada a `'micro-landing-v2'`.
  Estrategias separadas:
  - **Navegación HTML**: red → cache propio → `/` cacheado como
    último recurso (igual que v1).
  - **RSC requests**: red → cache propio → **fallar limpio si no hay
    cache**. NUNCA servir HTML como fallback para RSC.
- **`PantallaRotativa.tsx`** — el `setInterval` del refresh ahora
  hace `if (navigator.onLine === false) return` antes de disparar
  `router.refresh()`. Defensa en profundidad: si sabemos que estamos
  offline, no intentamos. El listener `online` (de la sesión 6) se
  encarga del refresh apenas vuelve la red.

**Added**
- **Función `esRscRequest(req, url)`** en `public/sw.js`. Detecta
  RSC fetches por query param `?_rsc=...`, header `RSC: 1`, o header
  `Next-Router-State-Tree`.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0).
- `npm run build`: éxito. Cache version bumpeado garantiza que el
  v2 deployado invalide el v1 en los Sticks.

**Doc updates**
- `docs/decisiones.md`: ADR nuevo "Service Worker v2: distinguir RSC
  requests para no freezar el browser" con diagnóstico paso a paso,
  decisión, trade-offs, y guía para detectar este tipo de bug en el
  futuro.

---

### Sesión 6 — 2026-05-25 (Resiliencia a wifi inestable: Service Worker)

**Context**: en producción, el Stick TV mostraba pantalla blanca con
`ERR_INTERNET_DISCONNECTED` cuando la wifi del local fluctuaba.
Requería intervención manual con el control remoto.

**Added**
- **`public/sw.js`** — Service Worker con estrategia network-first
  + cache fallback. Intercepta GET same-origin, cachea respuestas
  OK, sirve cache cuando la red falla. El navegador nunca ve un
  fetch fallado, por lo que no muestra su página de error.
- **`components/ServiceWorkerRegistrar.tsx`** — Client Component
  que registra el SW. Solo activo en producción
  (`NODE_ENV === 'production'`). Montado desde `app/layout.tsx`.
- **`next.config.ts → headers()`** — sirve `/sw.js` con
  `Cache-Control: public, max-age=0, must-revalidate` y
  `Service-Worker-Allowed: /` para evitar que Vercel cachee el SW
  con TTL largo y nos deje atascados con una versión vieja.
- **Listener `window.online`** en `PantallaRotativa.tsx` → dispara
  `router.refresh()` cuando vuelve la wifi sin que la app haya
  muerto.
- **Auto-retry en `app/error.tsx`** cada 10 segundos. Si caemos al
  boundary nuestro, se recupera solo sin intervención.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0).
- `npm run build`: éxito. Headers de `/sw.js` confirmados leyendo
  `.next/routes-manifest.json` (`Cache-Control: max-age=0,
  must-revalidate` + `Service-Worker-Allowed: /`).

**Doc updates**
- `docs/decisiones.md`: ADR completo "Service Worker para resistir
  caídas de wifi en el Stick TV" con problema, decisión, alternativa
  descartada (Fully Kiosk Browser, rechazada por el cliente),
  limitación honesta (no cubre cold start con red caída), estrategia
  de cache, y **kill switch documentado** para desactivar el SW
  en producción si causara problemas.

**Known limitation**
- El SW se instala *después* del primer load exitoso. Si el Stick
  TV arranca con la wifi caída, el SW no está y Chrome muestra
  ERR_INTERNET_DISCONNECTED. Caso poco frecuente.

---

### Sesión 5 — 2026-05-25 (Feature: tamaño imagen por-oferta + tweak tabla)

**Added**
- **Columna opcional `tamaño` (1-5) en la pestaña de ofertas del Sheets.**
  Permite ajustar el tamaño de la imagen del cartel por oferta sin
  tocar código. Mapeo: `1=60%`, `2=70%`, `3=80%` (default),
  `4=90%`, `5=100%` del wrapper de imagen. Backwards compatible: si
  la columna no existe o el valor es inválido, se usa `3`.
- **Headers aceptados** (normalizados sin acentos): `tamano`,
  `tamano imagen`, `tamano de imagen`, `escala`, `escala imagen`,
  `size`.
- **`types/index.ts`**: campo `tamano: number` en `Oferta`.
- **`lib/sheets.ts`**: nuevo tipo `OfertasTableHeader`, helper
  `parseTamanoOferta`, constantes `TAMANO_OFERTA_HEADERS`,
  `TAMANO_OFERTA_DEFAULT`, `TAMANO_OFERTA_MIN`, `TAMANO_OFERTA_MAX`.
- **`PantallaRotativa.tsx`**: mapa `TAMANO_OFERTA_A_ESCALA` y
  aplicación de la escala vía CSS variable inline
  `--cartel-image-scale` en el `<img>`.

**Changed**
- **`.cartelImage`** ahora usa `var(--cartel-image-scale, 80%)` para
  `height` y `width`. Fallback `80%` preserva el comportamiento
  previo a la feature.
- **Tweak de tabla de precios** (mismo día): `.descriptionCell`
  pasó a `width: 65%; padding-left: 6vw; white-space: nowrap`
  (antes implícito 50/50 + `padding-left: 14vw`) para que
  descripciones largas no rompan la grilla. `.priceCell` a
  `width: 35%`.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0/0).
- `npm run build`: ruta `/` sigue prerenderizada estática con
  revalidación 1 min.

**Doc updates**
- `docs/api.md`: response shape de `/api/ofertas` incluye `tamano`.
  Nueva nota sobre la columna opcional.
- `docs/decisiones.md`: ADR "Tamaño de imagen por-oferta: escala
  discreta 1-5 vía Sheets" con problema, decisión, por qué discreta
  y no porcentaje libre, trade-offs, e instrucciones para el cliente.

---

### Sesión 4 — 2026-05-25 (Tipos y contrato: cierre del análisis)

**Changed**
- **`lib/sheets.ts` — mapper tipado en `getConfig`.** Reemplazado el
  `CONFIG_KEYS_NUMERICOS: Set<string>` + casts `as number`/`as
  string` por `CONFIG_PARSERS` validado con `satisfies { [K in keyof
  Required<ConfigNegocio>]: ConfigParser<K> }`. Helper genérico
  `asignarConfig<K>(...)` aplica el parser correcto y preserva el
  tipo. Si alguien agrega una clave nueva a `ConfigNegocio` sin
  registrar su parser, **el build rompe en compilación**. Probado en
  vivo con `modoMantenimiento?: boolean` — TS reportó el error
  esperado y se revertió.
- **`parseStr`** ahora retorna `undefined` para strings vacíos (no
  contamina el objeto config con claves vacías).
- **Empty state de la tabla**: el `Sin productos disponibles` pasó a
  `Estamos actualizando la lista de precios. / Consultá por
  <whatsapp>`. El WhatsApp viene de `configRemota.whatsapp ??
  negocioConfig.whatsapp ?? negocioConfig.telefono`.

**Added**
- **`console.warn` en dev** cuando `oferta.imagen` difiere del
  slug calculado. Gateado por `process.env.NODE_ENV !== 'production'`
  para no ensuciar consola productiva. Detecta cargas mal hechas
  durante desarrollo o staging sin afectar al público final.
- **Clase `.emptyStateContact`** en `app/page.module.css` para el
  subtítulo del empty state. Usa `var(--c-texto-secundario)`.

**Validation**
- `npx tsc --noEmit`: sin errores. Confirmado que el `satisfies` del
  mapper rompe compilación si falta un parser.
- `npm run lint`: limpio (0/0).
- `npm run build`: ruta `/` sigue prerenderizada estática con
  revalidación 1 min.

**Análisis técnico cerrado.** Todos los items del análisis inicial
están resueltos o documentados como decisión consciente de no hacer.
Ver `docs/progreso.md` § Resuelto.

---

### Sesión 3 — 2026-05-25 (Estilos: inline → CSS module + CSS vars)

**Changed**
- **`app/page.module.css` reescrito.** Ahora consume colores de marca
  como CSS custom properties (`var(--c-primario)`,
  `var(--c-secundario)`, `var(--c-fondo)`, `var(--c-texto-primario)`,
  `var(--c-texto-secundario)`, `var(--c-fila-impar)`). Las variables
  se inyectan en el contenedor `.screen` desde `PantallaRotativa.tsx`.
  Archivo dividido en secciones comentadas: Tabla / Cartel /
  Animaciones.
- **Clase única `.row`** con `:nth-child(odd/even)` reemplaza a
  `.rowEven` y `.rowOdd`. Antes esas clases solo aportaban la
  `transition` y el fondo venía inline por `<tr>`.
- **`border-bottom: 1px solid #e5e7eb`** movido a `.cellBase` (antes
  estaba inline en cada `<td>`).
- **`components/PantallaRotativa.tsx`**: pasó de 303 a 199 líneas
  (-34 %). 0 bloques `style={{...}}` literales en el JSX. Único
  `style={}` que sobrevive: `style={screenVars}` en `.screen`, que
  pasa las CSS variables (es lo que habilita el patrón).
- **`CartelOferta`** reescrito: ~135 líneas con ~10 bloques de
  estilos inline pasaron a ~35 líneas con `className` puro. Usa
  clases combinadas para animaciones (`${styles.cartelImage}
  ${styles.pulseImage}`).

**Removed**
- Clases CSS muertas en `app/page.module.css`: **`.headCell`**,
  **`.priceHead`** (definidas pero nunca usadas en el JSX),
  **`.rowEven`**, **`.rowOdd`** (reemplazadas por `.row` +
  `:nth-child`).

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0 errores, 0 warnings).
- `npm run build`: ruta `/` sigue prerenderizada estática con
  revalidación 1 min.

---

### Sesión 2 — 2026-05-25 (UX de borde + formato AR + decisiones)

**Added**
- **`app/loading.tsx`**: pantalla de carga con branding del local
  (color primario + nombre + spinner) mientras se resuelven los
  `fetch` iniciales. Reemplaza la pantalla en blanco anterior.
- **`app/error.tsx`** (Client Component, por contrato de Next):
  boundary de errores con datos de contacto fijos
  (WhatsApp/Instagram/horarios desde `config/negocio.ts`) + botón
  "Reintentar" cableado al `reset()`. Loguea el error a consola para
  diagnóstico.
- **`docs/api.md`**: documentación de los endpoints `/api/productos`,
  `/api/ofertas`, `/api/config`. Quedan vivos como **API pública**
  reusable por una segunda pantalla o widget externo (la pantalla
  principal ya no los consume).

**Changed**
- **`formatPrecio`** ahora tolera formato AR: `"1.500,50"` se
  normaliza a `1500.50` antes de `Number()`. Antes mostraba `$1,5` por
  `Number("1.500") === 1.5`. Convención documentada en
  `docs/decisiones.md` con tabla de casos.
- **`app/layout.tsx`**: removidas clases Tailwind `m-0 p-0
  overflow-hidden` del `<body>`. Eran redundantes con el reset de
  `app/globals.css` y dependían de la API de Tailwind v4. El reset
  queda centralizado en CSS.
- **`eslint.config.mjs`**: desactivada la regla
  `@next/next/no-img-element` con comentario que apunta a la
  decisión. Ver abajo.

**Decided**
- **No usar `next/image`** en el proyecto. El optimizador de
  imágenes de Vercel consume cuota en la capa gratuita; este
  proyecto se vende para correr indefinidamente sin facturación
  sorpresa. Logo y ofertas siguen como `<img>` desde `/public`,
  pre-optimizadas manualmente (TinyPNG/Squoosh) al subir. Trade-offs
  y reglas para mantener la decisión en `docs/decisiones.md`.
- **Mantener `/api/productos`, `/api/ofertas`, `/api/config`** como
  API pública. No los borramos: documentados en `docs/api.md` para
  que terceros (otra pantalla, widget) puedan consumirlos.

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: limpio (0 errores, 0 warnings).
- `npm run build`: ruta `/` sigue prerenderizada estática con
  revalidación 1 min. `loading.tsx` y `error.tsx` no aparecen como
  rutas (son boundaries del segmento).

---

### Sesión 1 — 2026-05-25 (Server Component + cleanup base)

**Changed**
- **Refactor a Server Component.** `app/page.tsx` pasa de `'use
  client'` con fetch a `/api/*` a Server Component asíncrono que
  consume `lib/sheets.ts` directamente. Elimina un round-trip por
  carga inicial y permite que Next prerenderice la página
  estáticamente con revalidación de 1 minuto.
- **Rotación movida a `components/PantallaRotativa.tsx`** (Client
  Component). Recibe `listas`, `ofertas` y `configRemota` por props.
  El `useEffect` de rotación usa `setInterval` con setters
  funcionales; deps reducidas a `[modo, listas.length, ofertas.length,
  segundosCartel, segundosTabla]` para evitar reschedulings espurios.
- **`router.refresh()` consolidado.** El polling de actualización
  vive en un único `useEffect` dentro de `PantallaRotativa`, alineado
  con `minutosActualizacion`. Antes había dos timers (uno en
  `page.tsx` y otro en `AutoRefresh`).
- **`lib/sheets.ts`**: regex de "Combining Diacritical Marks"
  reescrita como `new RegExp('[\\u0300-\\u036f]', 'g')` con nombre y
  comentario explicativos. Antes dependía de caracteres invisibles
  que podían romperse al copiar/pegar.
- **`formatPrecio`** usa `Number.isNaN` en vez del `isNaN` global.

**Removed**
- **`components/AutoRefresh.tsx`**. Su `router.refresh()` cada 5 min
  era inerte porque la página era cliente; quedaba pisado por el
  `setInterval` local. La lógica útil (refrescar el RSC) vive ahora
  en `PantallaRotativa`.
- Función muerta `slugifyNombre` en `app/page.tsx`.

**Added**
- Carpeta `docs/`:
  - `progreso.md`: estado general, arquitectura, completado, pendientes.
  - `decisiones.md`: registro de decisiones técnicas con problema,
    decisión, alternativas y trade-offs.
- Este `CHANGELOG.md`.
- `export const revalidate = 60` en `app/page.tsx` (alineado con el
  `revalidate: 60` que ya tenía cada `fetch` en `lib/sheets.ts`).

**Validation**
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: sin errores. 2 warnings conocidos por `<img>`
  (resueltos en sesión 2 con la decisión de no usar `next/image`).
- `npm run build`: ruta `/` quedó `prerendered as static content`
  con `Revalidate 1m`.
