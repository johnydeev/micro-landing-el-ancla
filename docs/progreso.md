# Progreso del proyecto — micro-landing-el-ancla

Actualizado al 20/09/2026 (sesión 21).

---

## Estado general

Cartelería de precios en Next.js 16 + React 19. Un solo deploy sirve N
comercios, cada uno en `/<slug>`: muestra una pantalla que rota entre
**tabla de precios** y **carteles de oferta**, leyendo los datos en vivo
desde la planilla de Google Sheets del comercio (CSV publicado) y las
imágenes desde un catálogo universal en Cloudinary. Pensada para correrse en
un Fire TV dentro del local. Primer cliente: Granja El Ancla
(`/granja-elancla`, también servido en `/`).

Sin DB ni auth: la única fuente de verdad es la planilla de cada cliente. La
configuración del comercio (nombre, paleta, textos, GIDs) vive en
`tenants/<slug>.ts`; la URL de su CSV, en la env `TENANT_<SLUG>_CSV_URL`.
Desde sesión 19 **no hay cache del lado de la app**: la página es
`force-dynamic` y los tres `fetch` usan `cache: 'no-store'`, así que cada
carga trae los precios del momento. Es lo que hace que apretar "actualizar"
en el Fire TV muestre la corrección al toque.
Desde sesión 10 no hay polling ni `router.refresh()` client-side: los
datos llegan solo por props del Server Component, y el único refresh es
un `window.location.reload()` completo cada 30 min (`RELOAD_INTERVAL_MS`),
que de paso resetea cualquier acumulación de memoria/estado del browser
— pensado para correr días sin reiniciar en un Fire TV.

---

## Arquitectura actual

```
app/
  page.tsx                  "/" renderiza el tenant DEFAULT_TENANT (no
                            redirige: la TV de El Ancla apunta a "/" y el
                            SW no cachea un 307). force-dynamic.
  layout.tsx                Root layout: fuente Geist, reset CSS, metadata
                            genérica. Sin manifest ni viewport (son por
                            tenant).
  icon.png / apple-icon.png Favicon genérico (convención de Next).
  error.tsx                 Boundary de "/": copia del de [tenant], resuelve
                            el tenant con NEXT_PUBLIC_DEFAULT_TENANT.
  [tenant]/
    layout.tsx              Resuelve el tenant (getTenantOr404) → 404 si el
                            slug no existe. generateMetadata (title,
                            manifest) y generateViewport (themeColor).
    page.tsx                Pantalla principal. getPantallaData(tenant).
    loading.tsx             Genérico ("Cargando…"): Next no le pasa params.
                            NO existe en app/: ahí rompe el 404 (ver ADR).
    error.tsx               Client; tenant vía useParams + registro.
    vistaCartel/page.tsx    Rutas de desarrollo (?index=N), sin rotación.
    vistaLista/page.tsx
    manifest.webmanifest/route.ts
                            Manifest PWA por tenant: nombre, colores,
                            start_url=/<slug>, íconos desde Cloudinary.
  api/[tenant]/
    productos|ofertas|config/route.ts
                            API pública por tenant. Ver docs/api.md.
tenants/
  index.ts                  Registro TENANTS + getTenant(slug).
  granja-elancla.ts         Config de El Ancla (ex config/negocio.ts).
  registro.test.ts          Slug = clave, slug URL-safe, plantilla default
                            existe.
templates/
  index.ts                  CATALOGO_CARTELES tipado contra los ids.
  tabla/Clasica.tsx         Único diseño de tabla. Sin colores fijos.
  cartel/Clasico.tsx        Cartel de hoy (ex CartelOferta). Foto desde
                            Cloudinary, badge desde tenant.textos.
components/
  PantallaRotativa.tsx      Client. Recibe tenant + data. Inyecta la paleta
                            como CSS vars en .screen; elige
                            CATALOGO_CARTELES[oferta.plantilla ?? default].
                            Rotación con useReducer, reload cada 30 min,
                            heartbeat al SW cada 20s. modoFijo para dev.
  Header.tsx / Footer.tsx   Reciben tenant. Logo desde Cloudinary. `memo`.
  HealthIndicator.tsx       Punto online/offline. `memo`.
  DimOverlay.tsx            Atenuado por horario. `memo`.
  ServiceWorkerRegistrar.tsx
scripts/
  alta.mts                  `npm run alta`: alta de cliente interactiva
                            (gids desde /pubhtml, logo a Cloudinary,
                            tenants/<slug>.ts, env en Vercel).
lib/
  alta.ts                   Helpers puros del alta (testeados).
  sheets.ts                 Parser CSV + lectores por tenant + columna
                            "plantilla". server-only.
  plantillas.ts             PLANTILLAS_CARTEL, slugificarPlantilla,
                            normalizarPlantilla. Sin React (testeable).
  cloudinary.ts             urlOferta / urlLogo / urlIcono. Solo strings.
  tenant-env.ts             envKeyCsv, csvUrlDe.
  tenant-route.ts           getTenantOr404, getDefaultTenantOr404.
  precio.ts                 formatPrecio (formato AR).
  *.test.ts                 node --test, type stripping, imports relativos
                            con extensión .ts.
types/
  index.ts                  Producto, ListaPrecios, Oferta (+plantilla),
                            ConfigNegocio.
  tenant.ts                 Tenant.
public/
  sw.js                     Service Worker v7: network-first + watchdog.
                            Cachea same-origin y res.cloudinary.com.
.github/workflows/
  ci.yml                    tsc + lint + test + build en cada push/PR.
```

Ya no existen: `config/`, `scripts/`, `.githooks/`, `public/ofertas/`,
`public/logo.png`, `public/icons/`, `app/manifest.json`, el workflow de
imágenes. Todo lo de imágenes vive en Cloudinary (sesión 21).

### Flujo de datos

1. El cliente edita su planilla de Google Sheets (productos, ofertas,
   config) y publica las pestañas como CSV. En ofertas, `slug imagen` es un
   id del catálogo universal de Cloudinary y `plantilla` (opcional) el id
   de un diseño de cartel; ambos con desplegable.
2. `app/[tenant]/page.tsx` resuelve el tenant por el path y hace tres
   `fetch` en paralelo a los CSVs (URL de `TENANT_<SLUG>_CSV_URL`, GIDs de
   `tenant.sheets`), sin cache (`no-store` + parámetro `_cb`). Cada request
   vuelve a leer la planilla.
3. Los datos llegan al cliente como props del primer render (sin
   round-trip extra), junto con el `tenant`.
4. `PantallaRotativa` rota entre la tabla y los carteles según los
   tiempos `segundosTabla` / `segundosCartel` (configurables remotos, con
   fallback a `tenant.defaults`). Para cada oferta usa
   `CATALOGO_CARTELES[oferta.plantilla ?? tenant.plantillaCartelDefault]`;
   la foto es `urlOferta(slug)` en Cloudinary (`f_auto,q_auto,w_1200`,
   placeholder si el slug no existe).
5. Cada `RELOAD_INTERVAL_MS` (30 min) el cliente hace un
   `window.location.reload()` completo, que vuelve a ejecutar el Server
   Component desde cero (datos frescos, siempre) y de paso resetea
   cualquier acumulación de memoria/estado del browser. Un reload manual
   desde el control del Fire TV hace exactamente lo mismo.

---

## Completado ✅

- **Sesión 21 (20/09/2026) — Multitenant por path + imágenes en Cloudinary**:
  - Brainstorming → spec → plan (todo en `docs/superpowers/`). Decisiones:
    un deploy con N comercios por path (no SaaS), registro tipado en
    `tenants/`, URLs de CSV en env, catálogo de plantillas con paleta por
    comercio, columna `plantilla` en la planilla elegible por oferta, rubro
    genérico, **todas las imágenes en Cloudinary** con catálogo universal.
  - Rutas `app/[tenant]/…` y `app/api/[tenant]/…`; `/` renderiza
    `DEFAULT_TENANT` sin redirect (el SW no cachea 307; la TV apunta a `/`).
  - `templates/` (tabla y cartel extraídos de `PantallaRotativa`, sin
    cambios visuales), `lib/plantillas|cloudinary|tenant-env|tenant-route|precio`.
  - `lib/sheets.ts` por tenant; parseo de `plantilla` con posición libre.
  - Manifest PWA por tenant con íconos derivados del logo en Cloudinary.
  - SW v7: cachea `res.cloudinary.com`; `<img crossorigin="anonymous">`.
  - **Eliminado**: pipeline de imágenes completo (script, test, hook,
    workflow, `sharp`), `public/ofertas|logo|icons`, `app/manifest.json`,
    `config/negocio.ts`, `app/loading.tsx` de la raíz.
  - **Hallazgo en validación**: con `loading.tsx` en la raíz, un slug
    desconocido respondía 200 (Suspense streamea antes del `notFound()`).
    Sin él, 404. Se sacó; `/` muestra ~0,6 s en blanco al recargar.
  - Tests: 16/16 en 4 archivos `.ts` (type stripping; verificado en Node
    22 y 25). `tsc` ✓, lint ✓, build ✓ (rutas dinámicas nuevas, sin
    `/manifest.json`), build con env vacías ✓. HTTP contra `npm start`:
    200/200/404/404, JSON, manifest, `crossorigin` en las `<img>`.
  - **Pendiente**: subir las 22 imágenes + logo + placeholder a Cloudinary
    (Tarea 0 del plan), check visual/offline, y el **cutover** (Tarea 14:
    env en Vercel, dominio nuevo, push fuera de horario, rollback = Instant
    Rollback de Vercel).
  - Docs: CHANGELOG, dos ADRs, README reescrito, `api.md`.
  - **`npm run alta`** (`scripts/alta.mts` + `lib/alta.ts`, 10 tests): alta
    de cliente desde la terminal. Resuelve gids desde `/pubhtml`, sube logo,
    escribe y registra el tenant, crea la env en Vercel. Probado con un
    tenant de prueba end-to-end. `"type": "module"` en `package.json`.

- **Sesión 20 (19/09/2026) — El workflow de imágenes corría y fallaba**:
  - La sospecha de sesiones 18-19 (permiso `Read and write` sin setear) era
    falsa. La API pública de GitHub mostró 3 corridas en `failure`, todas en
    el paso de tests. **Causa**: `node --test "scripts/**/*.test.mjs"` — Node
    20 no expande globs. Reproducido con `npx -p node@20`. En local pasaba
    por correr Node 25.
  - **Fix**: `"test": "node --test"` sin argumentos (6/6 en Node 20 y 25) y
    `node-version: 22` en el workflow (20 está EOL).
  - `picada-cerdo.png` 2948 KB → 283 KB en local.
  - README y `.env.local.example`: sacadas `GOOGLE_SHEET_ID` y
    `GOOGLE_SHEETS_API_KEY` (código no las usa).
  - **`.env.local.example` nunca estuvo en el repo**: `.env*` del `.gitignore`
    lo tapaba. Agregado `!.env.local.example`; `.env.local` sigue ignorado.
  - **`.githooks/pre-commit`** + `prepare` en `package.json`: comprime los
    PNG staged antes del commit para que el bot no tenga que commitear y el
    clon local no quede un commit atrás. `optimize-images.mjs` ahora acepta
    rutas como argumentos.
  - Prueba completa del workflow: `pechito.png` 804 KB → 231 KB, commit del
    bot `475b759`, sin loop.
  - **`.github/workflows/ci.yml`**: `tsc` + `lint` + `test` + `build` en
    cada push/PR. Cierra el pendiente de sesión 4. Verificado que el build
    pasa sin las variables de Sheets.
  - Workflow de imágenes: **primera corrida verde** (`6c53452`, 7/7).
  - **`minutosActualizacion` eliminada** de `types`, `CONFIG_PARSERS`,
    `CONFIG_ALIASES`, `config/negocio.ts`, `docs/api.md` y README. Muerta
    desde sesión 10. Si la fila sigue en el Sheets, `normalizarClave`
    devuelve `null` y se ignora.
  - **Descartado el fallback `localStorage`** (last-known-good ante fallo
    de Google): decisión explícita del cliente — prefiere pantalla vacía a
    un precio potencialmente desactualizado. Consistente con el README.
  - Validación: `npm test` 6/6 en ambas versiones de Node.

- **Sesión 19 (30/08/2026) — Precios frescos en cada reload (fin del ISR)**:
  - **Pregunta del cliente**: si corrige un precio en el Sheets y aprieta
    actualizar en el Fire TV, ¿lo toma? **No lo tomaba.** El `revalidate =
    60` de la página es stale-while-revalidate: el request que caía después
    de expirar devolvía la página vieja y recién ahí regeneraba en
    background. Como la pantalla es el único tráfico del sitio, siempre
    estaba viendo la generación anterior.
  - **`app/page.tsx`** (y las dos rutas de dev): `export const dynamic =
    'force-dynamic'` en lugar de `revalidate = 60`.
  - **`lib/sheets.ts`**: los tres `fetch` pasan a `cache: 'no-store'`
    (`FETCH_SIN_CACHE`) — alcanza también a las tres rutas `/api/*` — y
    `urlSinCache()` agrega `&_cb=<timestamp>` para saltear la cache de
    Google (`Cache-Control: private, max-age=300`, medido con `curl`).
  - **Descartado**: bajar el `revalidate` a 5-10 s (no arregla nada, la
    semántica stale sigue igual) y revalidación on-demand con
    `revalidatePath` (haría falta un webhook de Apps Script viviendo en la
    planilla de cada cliente).
  - **Trade-off**: se pierde la red de contención del ISR. Si Google falla,
    la pantalla muestra el empty state hasta el reload siguiente en vez de
    la última página buena. Mitigación disponible (last-known-good en
    `localStorage`) sin implementar, a la espera de que el caso aparezca.
  - **Límite fuera de nuestro control**: la URL es `/pub?output=csv`, que
    tiene el pipeline de publicación propio de Google. Si sigue habiendo
    demora, migrar a `/export?format=csv&gid=` con la planilla compartida
    por enlace (requiere el ID real de la planilla).
  - Validación: `tsc --noEmit` ✓, `npm run lint` ✓, `npm run build` ✓ (`/`,
    `/vistaCartel`, `/vistaLista` y las 3 `/api/*` figuran como
    `ƒ (Dynamic)`). Contra `npm start`: 3 requests seguidos tardan 1,79 /
    0,61 / 0,60 s (cada uno relee los CSVs) y la respuesta sale con
    `Cache-Control: ... no-store ...`.
  - **Falta la prueba del lado del cliente**: editar un precio en la
    planilla y apretar actualizar en el Fire TV.

- **Sesión 18 (25/08/2026) — Optimización de imágenes automática en CI +
  primera suite de tests**:
  - **Problema**: el pipeline de compresión corría solo en `prebuild`, o sea
    dentro del contenedor efímero de Vercel — la imagen liviana se servía,
    pero el resultado nunca volvía al repo. Cada PNG pesado commiteado
    quedaba pesado en git para siempre.
  - **`.github/workflows/optimize-images.yml`**: primer workflow del
    proyecto. Trigger por `push` a `master` que toque
    `public/ofertas/**.png` o `public/logo.png`, más `workflow_dispatch`.
    Corre `npm test` → `npm run optimize:images` → commit + push de
    `public/` si algo cambió. Los tests van **antes** de optimizar: si el
    pipeline está roto, el job falla sin tocar el repo.
  - **Cron diario descartado** (era el pedido original): las imágenes solo
    cambian cuando alguien commitea una, y ese día el trigger por `push` ya
    lo cubre.
  - **Commit directo del bot a `master`**, sin PR — decisión explícita del
    usuario, registrada como consciente porque va contra la regla de que los
    commits los hace él.
  - **`scripts/optimize-images.test.mjs`**: primera suite de tests del
    proyecto. `node --test` (built-in de Node 18+), cero dependencias
    nuevas. Seis casos, entre ellos el de **idempotencia**, que es la
    segunda defensa contra el loop de commits (la primera es
    `if: github.actor != 'github-actions[bot]'`).
  - **Bug real encontrado por ese test** (`316320 !== 316324`): recomprimir
    un PNG ya comprimido raspa unos bytes en cada pasada. Con el workflow
    commiteando en automático eso serían commit + deploy + recarga de las
    pantallas para ahorrar 4 bytes. Fix: `MIN_AHORRO_BYTES = 1024` — único
    cambio de lógica del script en la sesión.
  - **Refactor para testear**: `optimizar()` exportada y `main()` detrás de
    un guard de entrypoint (sin eso, importar el módulo desde un test
    correría la compresión sobre `public/`).
  - **Sin cambios**: parámetros de compresión, hook `prebuild` (queda como
    segunda línea de defensa), umbral de 500 KB (sigue siendo warning), y
    sigue descartado WebP/AVIF (rompería el contrato `/ofertas/{slug}.png`).
  - **Pendiente, sin verificar**: el workflow nunca se probó end-to-end.
    `cortes-de-cerdo.png` (3,35 MB, sin comprimir) está en `master` sin
    commit del bot detrás — falta confirmar el permiso
    `Read and write permissions` en Settings → Actions.
  - Validación: `npm test` 6/6 ✓ (revalidado el 29/08/2026).
  - Detalle completo en `docs/decisiones.md`, `CHANGELOG.md` y
    `docs/superpowers/specs/2026-08-09-optimizacion-imagenes-programada-design.md`.

- **Sesión 17 (27/07/2026) — Auditoría Fire TV parte 2: PWA + memoización**:
  - Pedido del cliente: transformar el proyecto en pantalla 24/7 de
    signage para Fire TV (anti-freeze, PWA, caching, watchdog, imágenes,
    carrusel, kiosk mode). Auditoría contra el código real mostró que la
    mayoría ya estaba resuelto en sesiones 6-16 — el delta real fueron dos
    frentes.
  - **PWA**: `app/manifest.json` (convención de archivo de Next 16,
    `display: fullscreen`, `orientation: landscape`), `app/icon.png` +
    `app/apple-icon.png` (192×192 / 180×180, auto-detectados por Next),
    `public/icons/icon-192.png` + `icon-512.png` (referenciados desde el
    manifest). Todos generados con `sharp` desde `public/logo.png`.
    `app/layout.tsx`: nuevo `export const viewport` con `themeColor:
    '#E31E24'`.
  - **Memoización**: `Header`, `Footer`, `DimOverlay`, `HealthIndicator`
    envueltos en `React.memo` — evita reconciliación innecesaria de estos
    cuatro subárboles en cada tick de rotación (cada 3-12s, horas
    seguidas). Seguro con `useSyncExternalStore` interno (`DimOverlay`,
    `HealthIndicator`): `memo` no bloquea updates disparados por el propio
    store externo, solo los disparados por el padre con props iguales.
  - **`CartelOferta` sin tocar**: su remount por `key` es intencional
    (dispara la animación de entrada), no un descuido.
  - **Sin cambios**: cleanup de efectos (ya todos correctos), caching de
    assets (`_next/static` ya inmutable, imágenes de ofertas
    deliberadamente sin cache largo porque el cliente las reemplaza),
    `next/image` (sigue descartado por costo, sesión 2), Service Worker
    (watchdog ya cubre el caso real; no se migró a precache tipo
    Workbox — complejidad sin problema real que resuelva hoy).
  - **Pendiente igual que sesión 16**: validar el watchdog contra el
    navegador Silk de un Fire TV físico.
  - Validación: `tsc --noEmit` ✓, `npm run lint` ✓, `npm run build` ✓
    (rutas `/manifest.json`, `/icon.png`, `/apple-icon.png` confirmadas
    como estáticas en el output).
  - **Verificado contra un build de producción** (`npm start`), no en dev:
    `ServiceWorkerRegistrar` está gateado a `NODE_ENV === 'production'`, así
    que en `npm run dev` el SW no se registra y la PWA no se puede validar.
    Medido en producción: SW `activated` y controlando la página, manifest
    200, íconos y `theme-color` en `<head>`, criterios de instalabilidad
    cumplidos. **Prueba de resiliencia**: con el servidor apagado, un reload
    sirvió la pantalla completa desde cache (tabla con datos reales), la
    rotación siguió andando y la consola quedó sin errores.
  - **Hallazgo medido**: el cache del SW arranca casi vacío tras bootear
    (1 entrada tras el primer load, 14 tras el primer reload) porque el SW
    toma control después de que los recursos iniciales ya se descargaron.
    Consecuencia: durante los primeros ~30 min tras encender la TV la
    protección offline es parcial; el reload de 30 min cierra la ventana
    solo. No se cambió nada — el fix (precache del app shell en `install`)
    es justo la complejidad que el ADR de sesión 6 decidió no asumir.
    Registrado como siguiente paso si aparece un reporte real.
  - **`icon-512.png` está escalado hacia arriba** (logo fuente 400×400).
    Cumple instalabilidad pero con algo de pérdida de nitidez; corregirlo
    requiere un logo de ≥512px que hoy no existe en el repo.
  - Detalle completo en `docs/decisiones.md` y `CHANGELOG.md`.

- **Sesión 16 (03/07/2026) — Auditoría de rendimiento Fire TV**:
  - Auditoría completa (arquitectura, React, Next.js, imágenes, recovery)
    orientada a estabilidad 24/7 en Fire TV. Hallazgo principal: 4
    imágenes de ofertas agregadas después del pipeline de sesión 9
    quedaron sin optimizar (7.3 MB sin comprimir), reproduciendo la
    hipótesis de freeze por presión de memoria ya documentada.
  - **`scripts/optimize-images.mjs` + `prebuild`**: el pipeline de
    compresión (`sharp`) ahora corre automáticamente en cada build, no
    depende de un paso manual que ya se había olvidado dos veces.
  - Imágenes comprimidas: `rabito-huesito-cuerito.png` 3.2MB→387KB,
    `mondongo.png` 2.0MB→168KB, `pechitox2.png` 1.6MB→330KB, `rabo.png`
    762KB→227KB, `logo.png` 991KB→60KB.
  - `width`/`height` explícitos en `<img>` (cartel + logo).
  - `public/sw.js` simplificado: eliminado `esRscRequest()` (código muerto
    desde sesión 10, cuando se sacó el polling client-side). Bump a `v6`.
  - Guard `modoFijo` en el heartbeat de `PantallaRotativa.tsx`.
  - Corregidos comentarios desactualizados en `app/page.tsx` y este
    documento que todavía mencionaban `router.refresh()`/
    `minutosActualizacion` (removidos en sesión 8/10, pero el comentario
    había quedado).
  - **Pendiente, requiere hardware**: validar el watchdog de sesión 11 en
    el navegador real del Fire TV (Amazon Silk) — el procedimiento de test
    documentado solo se corrió en Chrome de escritorio.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓, `next build` ✓ (incluye
    el `prebuild` corriendo de punta a punta).

- **Sesión 15 (02/07/2026) — Badge de aclaración de oferta + rutas de
  desarrollo**:
  - Nueva columna opcional en la pestaña de Ofertas: aclaración/condición
    corta de la oferta (ej. "Solo efectivo"), **no** una descripción del
    producto. Se muestra en un badge azul marino con borde blanco debajo
    de "SUPER OFERTA". Cada coma en la celda es un salto de línea
    explícito.
  - **`Oferta.descripcion`** (`types/index.ts`), detectada por header
    (alias: `descripcion`, `aclaracion`, `condicion`, `detalle`, `nota`)
    en posición dinámica después de `tamaño` (o de `estado` si `tamaño`
    no está). Opcional y retrocompatible.
  - **`app/vistaCartel/page.tsx`** y **`app/vistaLista/page.tsx`**: rutas
    de desarrollo (`?index=N`) que fijan la pantalla sin rotación, para
    iterar el diseño sin esperar el timer. No las usa el cliente final.
  - **`getPantallaData()`** en `lib/sheets.ts`: helper compartido para los
    3 fetches, reusado por `/`, `/vistaCartel` y `/vistaLista`.
  - Validado contra el Sheets real de producción (3 tablas RES/CERDO/POLLO
    extendidas con columna "Nota" + 2 columnas de separación).
  - Validación: `tsc --noEmit` ✓, `next lint` ✓, `next build` ✓.

- **Sesión 14 (24/06/2026) — Escala de tamaño: rango 55%-120%**:
  - El cliente pidió que el máximo de la escala llegara a 120% (antes
    100%), manteniendo 1=55% y progresión lineal.
  - **`PantallaRotativa.tsx`**: `TAMANO_OFERTA_A_ESCALA` actualizado
    a rango 55%-120%, paso ~7,22%: 1=55%, 2=62%, 3=69%, 4=77%, 5=84%,
    6=91%, 7=98%, 8=106%, 9=113%, 10=120%.
  - Default (nivel 6) pasó de 80% a 91% como consecuencia. No afecta
    en la práctica (todas las ofertas tienen valor explícito).
  - **Comentarios actualizados** en `lib/sheets.ts` y `types/index.ts`.
  - **`docs/api.md`** actualizada con el mapeo nuevo + nota sobre
    valores >100%.
  - **Trade-off documentado**: niveles 8-10 (>100%) hacen que la
    imagen exceda el wrapper y pueda solaparse con título/precio.
    Intencional, pero usar con criterio.
  - Solo cambió el mapeo visual; el parser (rango 1-10) quedó intacto.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next build` ✓.

- **Sesión 13 (24/06/2026) — Ampliar escala de tamaño de oferta a 1-10**:
  - **Diagnóstico**: el cliente reportó que la columna "Tamaño" no
    tomaba valores, sospechando de la ñ. Verificado contra el CSV
    real: la ñ funciona perfecto (las 3 tablas detectan "Tamaño").
    El problema era que había cargado valores fuera de la escala 1-5
    (varios 10, un 7, un 6) que el parser descartaba al default.
  - **Decisión del cliente**: ampliar la escala 1-5 → 1-10 (en vez
    de corregir la planilla).
  - **`lib/sheets.ts`**: `TAMANO_OFERTA_MAX` 5→10,
    `TAMANO_OFERTA_DEFAULT` 3→6.
  - **`PantallaRotativa.tsx`**: `TAMANO_OFERTA_A_ESCALA` redefinido
    a 10 niveles, mapeo lineal 55%→100% (paso de 5%). Default 6=80%.
  - **`types/index.ts`**: comentario de `tamano` actualizado a 1-10.
  - **`docs/api.md`**: doc de `tamano` actualizada.
  - Verificado que todos los valores actuales del cliente (4, 3, 6,
    7, 10) ahora son válidos y mapean a porcentajes correctos.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next build`
    ✓.

- **Sesión 12 (24/06/2026) — Feature: atenuado de pantalla por horario**:
  - Nueva feature pedida por el cliente: atenuar la pantalla en un
    rango horario configurable (ej. siesta del mediodía 13-16hs) sin
    apagarla, con vuelta automática al brillo normal.
  - **`components/DimOverlay.tsx` nuevo**: velo negro `absolute`
    sobre el `.screen`, opacidad 0.94 dentro del rango, 0 fuera,
    transición de 2s. Usa `useSyncExternalStore` (re-evalúa cada 30s)
    para evitar el lint de React 19. Soporta cruce de medianoche.
    Fail-safe: formato inválido o clave faltante → no atenúa.
  - **`types/index.ts`**: `atenuarDesde` y `atenuarHasta` (strings
    `"HH"` o `"HH:MM"`) en `ConfigNegocio`.
  - **`lib/sheets.ts`**: parsers (`parseStr`) + aliases de las dos
    claves (`atenuar desde`, `inicio atenuado`, `atenuar hasta`,
    `fin atenuado`, etc.).
  - **`PantallaRotativa.tsx`**: monta `<DimOverlay>` con las claves
    de `configRemota`.
  - **Aclaración de alcance documentada**: en TVs LED/LCD el overlay
    oscurece pero NO apaga el backlight → ahorro de energía real casi
    nulo. Solo ahorra en OLED. Para ahorro garantizado habría que
    cortar corriente (enchufe inteligente), pero el cliente NO quiere
    apagar la pantalla. Detalle en `docs/decisiones.md`.
  - Validación: `tsc --noEmit` ✓, `next lint` ✓ (0/0), `next build`
    ✓, lógica de rango horario testeada con casos sintéticos
    (rango normal, cruce de medianoche, formato con minutos,
    valores inválidos).

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

### Abierto

- **Cutover multitenant (sesión 21, Tarea 14 del plan).** Código listo y
  validado en local, **sin pushear**. Antes del push: 22 imágenes + logo +
  `placeholder.png` en Cloudinary, env nuevas en Vercel, dominio nuevo
  agregado sin borrar el viejo. El push, fuera del horario de atención.
  Rollback: Vercel → Instant Rollback.
- **Validar el watchdog en el navegador real del Fire TV** (Amazon Silk).
  Pendiente desde sesión 11; el procedimiento documentado solo se corrió
  en Chrome de escritorio. Requiere el hardware.
- **Latencia del `/pub` de Google — medida el 20/09/2026: ~4-5 min.**
  Se editó una celda (`patamuslo` → `pata-muslo`) y el CSV publicado la
  expuso 208 s después de empezar a pollear (más ~1 min previo). Coincide
  con la republicación periódica de Google. Es el techo real del F5 en la
  TV; nuestro lado ya no cachea nada. Si molesta: migrar a
  `/export?format=csv` con la planilla compartida por enlace (ADR sesión
  19). Sin acción por ahora.

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
- ✅ CI de código: `tsc` + `lint` + `test` + `build` en cada push (sesión 20)
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
- **Imágenes**: viven en Cloudinary, no en el repo. Catálogo universal en
  `catalogo-comun/<slug>`; el `slug` es lo que va en la columna `slug imagen` de
  la planilla. Logo de cada comercio en `logos/<slug>`. Si un slug no
  existe, Cloudinary sirve `placeholder.png` (raíz del cloud). No hay
  nada que comprimir ni commitear.
- **`npm test`**: `node --test` sobre `lib/**/*.test.ts` y
  `tenants/**/*.test.ts` (type stripping, Node ≥ 22.18; imports relativos
  con extensión `.ts`, sin alias `@/` en módulos testeados). `tsc --noEmit`,
  `npm run lint`, `npm test` y `npm run build` corren en CI en cada push;
  igual conviene correrlos en local antes de commitear.
- **Alta de un cliente**: copiar la planilla modelo y publicarla →
  `npm run alta` (hace todo lo demás) → commit + push fuera de horario.
  Detalle en el README. Secretos del alta solo en `.env.local`.
- **Para probar el Service Worker / la PWA hay que usar un build de
  producción**, no `npm run dev`: `ServiceWorkerRegistrar` está gateado a
  `NODE_ENV === 'production'` (a propósito, para no pelear con cache stale
  en desarrollo), así que en dev el SW simplemente no existe. El flujo es
  `npm run build` + `npm start`. Hay una config `prod` en
  `.claude/launch.json` para levantarlo desde Claude Code.
- **`minutosActualizacion`** ya no existe en el código (sesión 20). Si
  la fila sigue en la pestaña CONFIG del Sheets, se ignora como cualquier
  clave desconocida — no hace falta borrarla. El refresh real es el
  reload completo cada 30 min (`RELOAD_INTERVAL_MS` en
  `PantallaRotativa.tsx`).
