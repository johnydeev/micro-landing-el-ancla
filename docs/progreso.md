# Progreso del proyecto — micro-landing-el-ancla

Actualizado al 23/06/2026 (sesión 11).

---

## Estado general

Micro-landing en Next.js 16 + React 19 para Granja El Ancla. Muestra
una pantalla que rota entre **tabla de precios** y **carteles de
superoferta**, leyendo los datos en vivo desde Google Sheets (CSV
publicado). Pensada para correrse en un display dentro del local.

Sin DB ni auth: la única fuente de verdad es la planilla del cliente.
El servidor cachea los CSVs 60 s vía `fetch({ next: { revalidate: 60 } })`
y el cliente dispara `router.refresh()` periódicamente para volver a
renderizar con datos frescos.

---

## Arquitectura actual

```
app/
  page.tsx                  Server Component. Fetch paralelo de
                            listas/ofertas/config y pasa todo por props.
                            export const revalidate = 60.
  layout.tsx                Root layout, fuente Geist, metadata.
                            Sin clases Tailwind en <body>: el reset vive
                            en globals.css.
  loading.tsx               Pantalla de carga con branding del local
                            (Server Component).
  error.tsx                 Boundary de errores con datos de contacto
                            fijos + boton "Reintentar" (Client
                            Component, por contrato de Next).
  api/
    productos/route.ts      GET listas de precios (API publica). Ver
                            docs/api.md.
    ofertas/route.ts        GET ofertas activas (API publica).
    config/route.ts         GET config remota (API publica).
components/
  PantallaRotativa.tsx      Client Component. Recibe data por props.
                            Maneja rotación tabla<->cartel con
                            setInterval + setters funcionales.
                            Dispara router.refresh() cada
                            minutosActualizacion para revalidar el
                            Server Component.
  Header.tsx                Logo + nombre + eslogan.
  Footer.tsx                WhatsApp / Instagram / horarios. Acepta
                            config remota con fallback a config local.
  LogoSVG.tsx               Logo SVG.
config/
  negocio.ts                Defaults locales: colores, tipografía,
                            duraciones, contactos. Usado como fallback
                            si la planilla no define la clave.
lib/
  sheets.ts                 Parser CSV + lectores tipados de listas,
                            ofertas y config. server-only.
types/
  index.ts                  Producto, ListaPrecios, Oferta,
                            ConfigNegocio.
```

### Flujo de datos

1. El cliente edita su planilla de Google Sheets (productos, ofertas,
   config) y publica las pestañas como CSV.
2. El Server Component `app/page.tsx` hace tres `fetch` en paralelo a
   los CSVs, cacheados 60 s por la cache de `fetch` de Next.
3. Los datos llegan al cliente como props del primer render (sin
   round-trip extra).
4. `PantallaRotativa` rota entre la tabla y los carteles según los
   tiempos `segundosTabla` / `segundosCartel` (configurables remotos).
5. Cada `minutosActualizacion` el cliente dispara `router.refresh()`,
   que re-ejecuta el Server Component. Si la cache del `fetch` ya
   expiró, se re-consulta Sheets.

---

## Completado ✅

- **Sesión 11 (23/06/2026) — Watchdog vía Service Worker (recovery del freeze)**:
  - **Contexto**: el freeze persistió después de sesión 10. Cliente
    confirmó tres datos críticos: pasó después de más de 1 hora (el
    reload preventivo del main thread NO se ejecutó), HealthIndicator
    estaba en verde (no era problema de red), control remoto no
    respondía (main thread completamente muerto). Único recovery
    disponible: power-cycle de la TV.
  - **Diagnóstico arquitectónico**: cualquier mecanismo que corre en
    el main thread del browser (`setInterval`, `location.reload`,
    listeners) es inútil si ese thread está muerto. Las únicas
    formas de recuperar son el Service Worker (otro thread) o algo
    a nivel sistema operativo (app kiosko, descartada).
  - **`public/sw.js`**: implementado watchdog completo.
    - `Map<clientId, timestamp>` para tracker el último heartbeat de
      cada cliente.
    - Listener de mensajes que registra heartbeats y programa un
      `setTimeout` dentro de `event.waitUntil` para mantener al SW
      vivo `HEARTBEAT_TIMEOUT_MS + grace` (65s) después de cada
      heartbeat.
    - `checkDeadClients()`: si un cliente lleva más de 60s sin
      heartbeat, dispara `client.navigate(client.url)` desde el SW
      → reload forzado que funciona aunque el main thread esté
      muerto.
    - Limpieza automática de timestamps de clientes que ya no
      existen (cerraron pestaña, navegaron a otro origen).
  - **`PantallaRotativa.tsx`**: nuevo `useEffect` que envía
    heartbeat al SW cada 20 segundos vía
    `navigator.serviceWorker.controller.postMessage({type:
    'heartbeat'})`. Primera llamada inmediata para que el SW arranque
    su timer cuanto antes.
  - **`RELOAD_INTERVAL_MS` bajado de 60 → 30 minutos**: reduce la
    ventana de exposición al freeze. Sigue siendo prevención, no
    recovery, pero suma.
  - **`public/sw.js`**: `CACHE_VERSION` bumpeado a `'micro-landing-v5'`
    para que los Sticks descarguen el nuevo bundle con el código del
    heartbeat.
  - **Plan B documentado**: si el watchdog SW + reload de 30min no
    resuelve el freeze, llegamos al techo de JS-only. El siguiente
    paso lógico sería **Fully Kiosk Browser** en el Stick (descartado
    en sesión 6 pero reabierto si hace falta). Razones documentadas
    en `docs/decisiones.md`.
  - **Cómo testear sin esperar un freeze real**: documentado en
    `decisiones.md`. Chrome desktop → `while(true){}` en console →
    esperar 65-70s → la página debería reloadearse sola.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next build`
    ✓.

- **Sesión 10 (23/06/2026) — Eliminar polling, reload horario, HealthIndicator**:
  - **Contexto**: el freeze del Stick TV persistía después de las
    sesiones 7-9 (~2 veces en 4 horas). Datos del cliente cambiaron
    el diagnóstico: freeza también en tablas de texto (no solo
    carteles con imagen), sin corte de red, periodicidad ~2hs.
    Sugiere acumulación de memoria/listeners/estado de React, no las
    causas que ya habíamos atacado.
  - **`PantallaRotativa.tsx` reescrita**:
    - Eliminado el polling de `/api/*` completamente. Los datos
      vienen ahora **solo de props** del Server Component. De
      ~4.320 fetches/día a ~25/día (12 reloads × 3 endpoints vía
      SSR). **Reducción del 99.4%**.
    - **Reload completo cada 1 hora** vía `window.location.reload()`.
      Doble propósito: refrescar datos (re-ejecuta el SSR) y
      resetear cualquier acumulación del browser (memoria,
      listeners, estado de React).
    - **Refactor del rotation state a `useReducer`**: ya no hay
      `setCartelIndex(0)` y `setModo('cartel')` *dentro* del updater
      de `setListaIndex`. Un solo dispatch atómico por tick, sin
      anti-patrones de React.
  - **`components/HealthIndicator.tsx` nuevo**: indicador chico
    arriba a la derecha del `.screen`. Usa `useSyncExternalStore`
    (patrón moderno de React 18+) para suscribirse a los eventos
    `online`/`offline` del browser. Verde si online, rojo si offline,
    gris durante SSR. ~10-14px, opacidad 0.6 — discreto para el
    público, visible para el operador.
  - **`app/page.module.css`**: `.screen` pasó a `position: relative`
    para crear el contexto donde el HealthIndicator se posiciona
    `absolute`.
  - **`public/sw.js`**: `CACHE_VERSION` bumpeado a `'micro-landing-v4'`
    para forzar invalidación del JS viejo (el de la sesión 8 con
    polling) y descargar el bundle nuevo.
  - **Webhook descartado** (era propuesta del cliente). Razones
    técnicas en `docs/decisiones.md`: el Stick no es alcanzable
    desde internet, Vercel free tier no soporta long-lived
    connections. Para updates urgentes el operador power-cycla la
    TV; caso contrario espera el próximo reload horario.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next build`
    ✓.

- **Sesión 9 (23/06/2026) — Restauración del trabajo perdido por
  merge mal-resuelto + optimización de imagen nueva**:
  - **Contexto**: una sesión Claude paralela el 19/06 había
    optimizado las 17 imágenes de `public/ofertas/` (33.3 MB →
    4.4 MB) bajo la hipótesis de que el freeze residual del Stick
    TV — el que persistía después de la sesión 8 — era por
    presión de memoria/GPU al decodificar PNGs pesados cada 3
    segundos. El PR (#1) se mergeó a `master` remoto el 22/06.
  - **Problema descubierto al revisar commits**: un `git pull`
    local del 22/06 generó un merge automático (`967b117`) que
    revirtió completamente el trabajo del PR — tanto las imágenes
    optimizadas como el ADR completo en `docs/decisiones.md`.
    Estado de HEAD tras el merge: imágenes pesadas otra vez (~33
    MB), ADR ausente. Sobrevivió solo el commit en la historia.
  - **Implicación operativa**: si la hipótesis de memoria es
    correcta, el cliente seguía expuesto al freeze residual con
    deploy del trabajo de sesión 8.
  - **Restauración aplicada**:
    - 15 imágenes de `public/ofertas/` restauradas desde el commit
      `5aa638f` (`git checkout 5aa638f -- ...`).
    - `vacio.png` (337 KB) y `vacio2.png` (borrado) respetados como
      los dejó johnydeev entre el 20 y 22/06 — sus cambios eran
      intencionales y posteriores al PR.
    - **`lechon.png` nueva** (agregada el 20/06 sin optimizar, 1.33
      MB) recomprimida con el mismo pipeline de sharp del 19/06:
      181 KB resultantes (-86 %).
    - **Total final**: 4.08 MB en 19 archivos.
    - **ADR completo restaurado** en `docs/decisiones.md` con nota
      de procedencia que explica el episodio del merge para
      trazabilidad futura.
  - **Lección registrada para el futuro**: cuando se hagan merges
    locales con cambios en archivos binarios y un PR remoto que
    también los toca, revisar explícitamente que el merge no haya
    revertido los binarios. `git diff HEAD~1 HEAD -- '*.png'` con
    `--stat` es la forma rápida de chequear.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next
    build` ✓.

- **Sesión 8 (18/06/2026) — Hotfix definitivo: sacar `router.refresh()`,
  pasar a fetch + useState**:
  - **El v2 (sesión 7) no resolvió el bug** completamente. El
    cliente reportó al día siguiente que la rotación volvió a
    congelarse en una vista del ciclo (esta vez una tabla) y el
    control remoto seguía sin responder. Confirmado que la página se
    recargaba limpia cada mañana (la TV se apaga al fin de la
    jornada), o sea no era cache vieja — el v2 estaba activo y aún
    así el bug ocurría.
  - **Diagnóstico ampliado**: `router.refresh()` es caja negra. No
    devuelve promesa, no se puede catchear, y el manejo de errores
    interno de Next ante fallas de red no es confiable en este
    Stick TV. Sin importar cómo manejara el SW las RSC requests,
    Next reaccionaba mal al `NetworkError` y bloqueaba el main
    thread.
  - **Cambio arquitectónico**: `PantallaRotativa.tsx` reescrito
    para usar `useState` + `fetch` directo a los endpoints
    `/api/productos`, `/api/ofertas`, `/api/config` (que ya
    existían desde la sesión 1). Removidos `useRouter` y
    `startTransition`.
  - **Datos iniciales**: siguen viniendo del Server Component por
    props (primer paint instantáneo). Después, polling cada
    `minutosActualizacion` actualiza estado local.
  - **Manejo de errores defensivo**: `Promise.all` con
    `.catch(() => null)` por endpoint + `try/catch` global +
    validación de shape (`Array.isArray`, `typeof === 'object'`)
    antes de hacer setState. Si algo falla, no se actualiza —
    rotación sigue con datos viejos, cero impacto.
  - **`navigator.onLine === false` skip**: si el browser sabe que
    no hay red, ni intenta el fetch.
  - **`window.online` listener**: cuando vuelve la red, dispara
    `fetchAll()` inmediato sin esperar al próximo tick.
  - **SW bumpeado a v3**: garantiza que los Sticks descarguen
    el JS nuevo (sin `router.refresh()`) y no sigan corriendo
    código viejo cacheado.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0),
    `next build` ✓.

- **Sesión 7 (18/06/2026) — Hotfix: SW v2 distingue RSC requests**:
  - **Reporte del cliente post-deploy de SW v1**: el SW evitó la
    pantalla blanca, pero introdujo un bug nuevo. Cuando la wifi
    caía, la rotación se congelaba en una oferta y los inputs del
    control remoto del Stick TV dejaban de responder. Requería
    reinicio físico.
  - **Causa raíz identificada**: el SW v1 servía HTML como último
    recurso para CUALQUIER request, incluyendo los RSC fetches que
    dispara `router.refresh()`. Next esperaba un payload RSC
    binario; al recibir HTML el parser de React se rompía y
    bloqueaba el main thread del browser.
  - **`public/sw.js`** — versión bumpeada a `v2`. Nueva función
    `esRscRequest(req, url)` que detecta RSC fetches por:
    1. Query param `?_rsc=...`
    2. Header `RSC: 1`
    3. Header `Next-Router-State-Tree`
  - **Estrategia diferenciada**: navegación HTML sigue con el
    fallback a `/` cacheado; RSC sin cache propio **falla limpio**
    (Next maneja el error y mantiene los datos en memoria, sin
    romper el cliente).
  - **`PantallaRotativa.tsx`**: guard `if (navigator.onLine ===
    false) return` antes del `router.refresh()` del intervalo. Si
    sabemos que estamos offline, ni intentamos el refresh.
  - **Versionado del cache**: el bump a `v2` invalida cualquier
    cache contaminada con HTML donde debería haber RSC, que pudiera
    haber quedado de v1.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0),
    `next build` ✓.

- **Sesión 6 (25/05/2026) — Resiliencia a wifi inestable: Service Worker + recovery**:
  - **`public/sw.js`** nuevo: Service Worker con estrategia
    network-first y fallback a cache. Intercepta todos los GET
    same-origin. Cuando la wifi del local se cae, sirve la última
    versión cacheada en vez de dejar que el navegador del Stick TV
    muestre `ERR_INTERNET_DISCONNECTED`.
  - **`components/ServiceWorkerRegistrar.tsx`** nuevo: Client
    Component minúsculo que registra el SW. Solo en producción para
    evitar pesadillas de cache en dev. Montado desde `layout.tsx`.
  - **`next.config.ts`**: nuevo `headers()` que sirve `/sw.js` con
    `Cache-Control: max-age=0, must-revalidate` + `Service-Worker-
    Allowed: /`. Sin esto, Vercel cachearía el SW con TTL largo y
    quedaríamos atascados con un SW viejo en producción.
  - **`app/error.tsx`**: agregado `setInterval` que llama a `reset()`
    cada 10s. Si caemos al boundary nuestro, se recupera solo (no
    requiere control remoto).
  - **`PantallaRotativa.tsx`**: agregado listener `window.online` →
    `router.refresh()`. Cuando vuelve la wifi sin matar la app,
    sincroniza data al toque en vez de esperar al próximo tick del
    intervalo.
  - **Caso real reportado en producción que motivó esta sesión**:
    Stick TV con Android TV genérico mostraba pantalla blanca con
    `ERR_INTERNET_DISCONNECTED` cuando la wifi del local fluctuaba.
    Requería refresh manual con el control remoto.
  - **Limitación conocida y documentada**: el SW se instala
    *después* del primer load exitoso. Si el Stick arranca con la
    wifi caída, el SW no existe todavía y Chrome muestra su error.
    Caso muy raro (el Stick suele encenderse con red OK).
  - **Kill switch documentado**: en `docs/decisiones.md` hay un
    snippet listo para desactivar el SW en producción si causara
    problemas. Solo aplicar si hace falta.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next build`
    ✓ headers de `/sw.js` confirmados en
    `.next/routes-manifest.json`.

- **Sesión 5 (25/05/2026) — Feature: tamaño de imagen por-oferta + tweak de tabla**:
  - **Nueva columna opcional `tamaño` en la pestaña de ofertas del
    Sheets**. Escala 1-5 mapeada a porcentajes del wrapper de imagen
    (60/70/80/90/100 %). Default `3` = 80 % = comportamiento previo.
    Backwards compatible: si la columna no existe o el valor es
    inválido, todas las ofertas usan `3`.
  - **`types/index.ts`**: `Oferta.tamano: number` agregado, requerido
    (default aplicado en el parser, no en la UI).
  - **`lib/sheets.ts`**: nuevo tipo `OfertasTableHeader { offset,
    tieneTamano }`. `findOfertasTableOffsets` detecta el header de
    la 5ta columna (acepta `tamaño`, `tamano`, `escala`, `size`,
    etc., normalizado sin acentos). `parseTamanoOferta` valida y
    clampea al rango 1-5. `mapRowToOfertas` lee la columna solo si
    el header está presente.
  - **`PantallaRotativa.tsx`**: mapa `TAMANO_OFERTA_A_ESCALA` y
    aplicación vía CSS variable inline `--cartel-image-scale` en el
    `<img>`. Consistente con el patrón de `screenVars` (sesión 3).
  - **`page.module.css`**: `.cartelImage` ahora usa
    `var(--cartel-image-scale, 80%)` para `height` y `width`.
  - **Tweak menor del mismo día**: `.descriptionCell` pasó a
    `width: 65%; padding-left: 6vw; white-space: nowrap` (antes
    50/50 implícito + 14vw) para que descripciones largas como
    "Falda parrillera x 2 KG" no hagan salto de línea. `.priceCell`
    pasó a `width: 35%`.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next build`
    ✓ ruta `/` estática con revalidación 1m.

- **Sesión 4 (25/05/2026) — Tipos y contrato: cierre del análisis**:
  - **Mapper tipado en `getConfig`** (`lib/sheets.ts`): reemplazado
    `CONFIG_KEYS_NUMERICOS: Set<string>` + casts `as number`/`as
    string` por `CONFIG_PARSERS` con `satisfies { [K in keyof
    Required<ConfigNegocio>]: ConfigParser<K> }`. Si alguien agrega
    una clave nueva a `ConfigNegocio` sin actualizar `CONFIG_PARSERS`,
    **el build rompe en compilación**. Probado en vivo agregando una
    clave booleana — TS error confirmado y revertido.
  - **Re-slugify de `oferta.imagen` con warning en dev**
    (`components/PantallaRotativa.tsx`, `CartelOferta`): se mantiene
    el slugify defensivo pero ahora hay `console.warn` cuando el
    original difiere del slugificado, gateado por
    `process.env.NODE_ENV !== 'production'`. Detecta cargas mal hechas
    en desarrollo sin ensuciar la consola en producción.
  - **Empty state amable** (`PantallaRotativa.tsx` + nueva clase
    `.emptyStateContact` en `page.module.css`): el `Sin productos
    disponibles` pasó a `Estamos actualizando la lista de precios.
    Consultá por <whatsapp>`. El número se toma del config remoto con
    fallback al local.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next build`
    ✓ ruta `/` estática con revalidación 1m.
  - **Análisis técnico cerrado**: todos los items del análisis
    inicial están resueltos o documentados como decisión consciente
    de no hacer.

- **Sesión 3 (25/05/2026) — Estilos: inline → CSS module + CSS vars**:
  - **`app/page.module.css` reescrito**: ahora consume colores como
    `var(--c-primario)`, `var(--c-secundario)`, etc. Agregadas
    secciones comentadas (Tabla / Cartel / Animaciones) y todas las
    clases nuevas del cartel (`.cartel`, `.cartelDiagonal`,
    `.cartelBadge`, `.cartelTitleWrap`, `.cartelTitle`,
    `.cartelImageWrap`, `.cartelImage`, `.cartelPrice`,
    `.cartelPriceText`).
  - **CSS muerto eliminado**: `.headCell`, `.priceHead`, `.rowEven`,
    `.rowOdd`. La alternancia de filas usa una sola clase `.row` con
    `:nth-child(odd/even)`.
  - **`border-bottom: 1px solid #e5e7eb`** movido a `.cellBase`
    (antes estaba inline en cada `<td>`).
  - **`PantallaRotativa.tsx` reescrito**: el contenedor `.screen`
    inyecta las CSS variables; el resto del JSX usa solo `className`.
    `CartelOferta` pasó de ~135 líneas con ~10 bloques `style={{...}}`
    a ~35 líneas con `className` puro. Total del archivo: 303 → 199
    líneas (-34 %).
  - **0 bloques `style={{...}}` literales** en todo el componente.
    El único `style=` que queda es `style={screenVars}`, que pasa las
    custom properties y es justamente lo que habilita el patrón.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next build`
    ✓ ruta `/` estática con revalidación 1m.

- **Sesión 2 (25/05/2026) — UX de borde + tolerancia de formato + decisiones documentadas**:
  - **`app/loading.tsx`** creado: pantalla de carga con branding (logo
    en color primario + "Cargando ofertas…" + spinner). Mismo layout
    16:9 que el resto, transición visualmente continua.
  - **`app/error.tsx`** creado (Client Component, por contrato de
    Next): muestra nombre del local + mensaje al público + datos de
    contacto desde `config/negocio.ts` (WhatsApp, Instagram, horarios)
    + botón "Reintentar" cableado al `reset()` del boundary. Loguea el
    error a consola (Vercel lo recoge en producción).
  - **`formatPrecio` ahora tolera formato AR**: si el cliente carga
    `"1.500,50"` en Sheets, lo normaliza a `"1500.50"` antes de
    `Number()`. Antes daba `$1,5` (`Number("1.500") === 1.5`). Tabla
    de comportamiento documentada en `docs/decisiones.md`.
  - **`app/layout.tsx`**: removidas clases Tailwind (`m-0 p-0
    overflow-hidden`) del `<body>`. Eran redundantes con el reset de
    `app/globals.css` y dependían de la API de Tailwind v4 (puede
    cambiar). El reset queda centralizado en CSS.
  - **`eslint.config.mjs`**: desactivada la regla
    `@next/next/no-img-element` con comentario explicativo. El
    proyecto **no usa `next/image`** por costo en capa gratuita de
    Vercel — decisión documentada en `docs/decisiones.md`.
  - **`docs/api.md`** creado: documentación de los tres endpoints
    `/api/*` (shape de respuesta, errores, casos de uso esperados).
    Quedan vivos como API pública del proyecto (no los consume la
    pantalla principal, pero pueden reusarse desde otra pantalla o
    widget externo).
  - Validación: `tsc --noEmit` y `next lint` sin errores ni warnings.
    `next build` correcto, ruta `/` sigue prerenderizada estática.

- **Sesión 1 (25/05/2026) — Server Component + cleanup**:
  - Convertido `app/page.tsx` de `'use client'` a Server Component
    asíncrono. Ahora consume `lib/sheets.ts` directamente y elimina
    una capa de fetch (cliente -> /api/* -> Sheets).
  - Creado `components/PantallaRotativa.tsx` (Client Component) que
    encapsula la rotación tabla/cartel y el polling de refresh.
  - Eliminado `components/AutoRefresh.tsx`: su `router.refresh()` era
    redundante con el `setInterval` que tenía `page.tsx`. Ahora hay un
    único intervalo, que sí tiene sentido porque la página es RSC.
  - Removido `slugifyNombre` (código muerto).
  - `formatPrecio` usa `Number.isNaN` en vez de `isNaN`.
  - `lib/sheets.ts`: regex de "Combining Diacritical Marks"
    reescrita como `new RegExp('[\\u0300-\\u036f]', 'g')` con
    comentario explicativo. Antes dependía de caracteres invisibles
    que algunos editores rompían.
  - Rotación: `useEffect` ahora usa `setInterval` con setters
    funcionales; deps reducidas a
    `[modo, listas.length, ofertas.length, segundosCartel, segundosTabla]`.
  - Build limpio (`next build`): ruta `/` quedó **prerenderizada
    estática con revalidación 1m** (antes era dinámica por ser
    cliente con fetch). Lint sin errores; solo quedan 2 warnings
    conocidos de `<img>` (ver pendientes).

---

## Pendientes 📋

**Sesiones 1, 2, 3 y 4 cerradas — análisis técnico completo.**

No quedan items del análisis inicial sin resolver. El proyecto está
listo para vender en su estado actual.

### Ideas opcionales para iteraciones futuras

Estas no salen del análisis original — son extensiones posibles si
aparece un caso de uso real:

- **Proteger la estructura de columnas del Sheets** (alta
  prioridad cuando haya muchos clientes). Sheets es muy sensible:
  un `Tab` extra, un paste mal hecho, o arrastrar el cursor por
  error pueden desplazar una columna entera sin que el cliente lo
  note, rompiendo el parser que exige headers contiguos.
  - Caso real ya visto (25/05/2026): se insertó una celda vacía
    entre `Precio` y `Unidad` en dos tablas del listado de
    productos. Las tablas dejaron de renderizar. Detectado y
    arreglado a mano, pero es exactamente el tipo de error que un
    cliente final no sabe diagnosticar.
  - Solución: aplicar **rangos protegidos** sobre la pestaña de
    productos y la de ofertas. Hoy el proyecto usa el modelo
    "publicar CSV" sin credenciales, así que la protección habría
    que aplicarla manualmente en cada planilla. Para automatizarlo
    hace falta migrar a la **Sheets API con service account**
    (más infra, más costo de setup por cliente). Por eso queda para
    cuando el volumen de clientes lo justifique.
  - Alternativa intermedia: dar al cliente un **template con
    rangos ya protegidos** que tenga que copiar tal cual. Cero
    código nuestro, pero exige disciplina en el onboarding.
  - Otra alternativa intermedia: hacer el parser **tolerante a una
    celda vacía** entre `Precio` y `Unidad` (cambio chico en
    `findProductosTableOffsets`). Pros: nunca rompe por este error.
    Contras: enmascara otros errores de estructura.
- **Theming dinámico**: las CSS variables ya están en `.screen`, así
  que basta con aceptar un prop `paleta` en `PantallaRotativa` y
  derivar `screenVars` desde ahí. Util si se vende a múltiples
  locales con paletas distintas, o si el cliente quiere variantes
  por evento (fiestas patrias, navidad).
- **Logging remoto** del warning de slug mal cargado. Hoy solo se ve
  en dev; con Sentry o LogTail se podría detectar el patrón en
  producción.
- **Pestaña CONFIG con `modoMantenimiento: boolean`** para pantalla
  dedicada. El mapper tipado (sesión 4) ya soporta agregar la clave
  sin riesgo.
- **CI/CD**: hoy no hay workflow de GitHub Actions. Si el cliente lo
  pide, agregar `tsc --noEmit` + `next lint` + `next build` en cada
  PR.

### Resuelto (referencia completa)
- ✅ Refactor a Server Component + `AutoRefresh` consolidado (sesión 1)
- ✅ Regex de diacríticos con `new RegExp` + escapes Unicode (sesión 1)
- ✅ `slugifyNombre` muerto, `isNaN` → `Number.isNaN` (sesión 1)
- ✅ `loading.tsx` + `error.tsx` con branding (sesión 2)
- ✅ `formatPrecio` formato AR (sesión 2)
- ✅ Reset CSS centralizado en `globals.css` (sesión 2)
- ✅ Endpoints `/api/*` documentados en `docs/api.md` (sesión 2)
- ✅ Estilos inline → CSS module + CSS vars (sesión 3)
- ✅ CSS muerto eliminado (sesión 3)
- ✅ Mapper tipado en `getConfig` con `satisfies` (sesión 4)
- ✅ Warning en dev por slug mal cargado (sesión 4)
- ✅ Empty state amable con datos de contacto (sesión 4)
- ❌ `next/image` — **descartado** por costo en capa gratuita (sesión 2)

---

## Notas operativas

- **Variables de entorno requeridas** (`.env.local` y en Vercel):
  - `GOOGLE_SHEETS_CSV_URL`: URL del CSV publicado de la pestaña de
    productos.
  - `GOOGLE_SHEETS_GID_OFERTAS`: `gid` de la pestaña de ofertas.
  - `GOOGLE_SHEETS_GID_CONFIG`: `gid` de la pestaña de config remota.
- Si falta `GOOGLE_SHEETS_CSV_URL` los lectores devuelven array
  vacío y loguean a `console.error`; la página igual renderiza.
- El proyecto usa **Next.js 16** (no es el Next.js anterior — ver
  `AGENTS.md`). Antes de tocar APIs de Next, leer
  `node_modules/next/dist/docs/`.
