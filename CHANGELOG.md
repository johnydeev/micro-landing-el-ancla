# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/).
Versionado semántico cuando se publique a producción.

## [Unreleased]

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
