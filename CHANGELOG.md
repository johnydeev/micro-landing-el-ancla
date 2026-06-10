# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/).
Versionado semántico cuando se publique a producción.

## [Unreleased]

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
