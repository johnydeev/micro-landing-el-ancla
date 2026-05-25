# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/).
Versionado semántico cuando se publique a producción.

## [Unreleased]

### Changed
- **Refactor a Server Component (2026-05-25).** `app/page.tsx` pasa de
  `'use client'` con fetch a `/api/*` a Server Component asíncrono que
  consume `lib/sheets.ts` directamente. Elimina un round-trip por
  carga inicial y permite que Next prerenderice la página estáticamente
  con revalidación de 1 minuto.
- **Rotación movida a `components/PantallaRotativa.tsx`** (Client
  Component). Recibe `listas`, `ofertas` y `configRemota` por props.
  El `useEffect` de rotación pasa a usar `setInterval` con setters
  funcionales; dependencias reducidas a
  `[modo, listas.length, ofertas.length, segundosCartel, segundosTabla]`
  para evitar reschedulings espurios.
- **`router.refresh()` consolidado.** El polling de actualización vive
  ahora en un único `useEffect` dentro de `PantallaRotativa`, alineado
  con `minutosActualizacion`. Antes había dos timers (uno en `page.tsx`
  y otro en `AutoRefresh`).
- **`lib/sheets.ts`**: regex de "Combining Diacritical Marks"
  reescrita como `new RegExp('[\\u0300-\\u036f]', 'g')` con nombre y
  comentario explicativos. Antes dependía de caracteres invisibles que
  podían romperse al copiar/pegar o al pasar por herramientas que
  normalizan el archivo.
- **`formatPrecio`** usa `Number.isNaN` en vez del `isNaN` global.

### Removed
- **`components/AutoRefresh.tsx`**. Su `router.refresh()` cada 5 min
  era inerte porque la página era cliente; quedaba pisado por el
  `setInterval` local. La lógica útil (refrescar el RSC) vive ahora en
  `PantallaRotativa`.
- Función muerta `slugifyNombre` en `app/page.tsx`.
- `import` de `AutoRefresh` ya no existe en `app/page.tsx`.

### Added
- Carpeta `docs/` con:
  - `progreso.md`: estado general, arquitectura, completado, pendientes.
  - `decisiones.md`: registro de decisiones técnicas con problema,
    decisión, alternativas descartadas y trade-offs.
- Este `CHANGELOG.md`.
- `export const revalidate = 60` en `app/page.tsx` (alineado con el
  `revalidate: 60` que ya tenía cada `fetch` en `lib/sheets.ts`).

### Validation
- `npx tsc --noEmit`: sin errores.
- `npm run lint`: sin errores. Quedan 2 warnings conocidos por usar
  `<img>` en `Header.tsx` y `PantallaRotativa.tsx` (pendiente:
  migrar a `next/image`).
- `npm run build`: build correcto. Ruta `/` quedó `prerendered as
  static content` con `Revalidate 1m`.
