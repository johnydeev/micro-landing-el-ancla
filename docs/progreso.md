# Progreso del proyecto — micro-landing-el-ancla

Actualizado al 25/05/2026 (sesión 1).

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
  api/
    productos/route.ts      GET listas de precios (opcional, externo).
    ofertas/route.ts        GET ofertas (opcional, externo).
    config/route.ts         GET config remota (opcional, externo).
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

- **Refactor sesión 1 (25/05/2026) — Server Component + cleanup**:
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

Priorizados a partir del análisis inicial. El bloque "alto impacto"
ya está cubierto por el refactor de la sesión 1; quedan los
siguientes:

### Calidad / mantenibilidad
- **Estilos inline en `CartelOferta`**: decenas de `style={{...}}` que
  pertenecen al `.module.css`. Mover a clases CSS.
- **CSS muerto en `page.module.css`**: `.headCell`, `.priceHead`,
  `.rowEven`/`.rowOdd` casi vacíos. Limpiar.
- **`<img>` → `next/image`** en `Header.tsx` y `PantallaRotativa.tsx`
  (logo y ofertas). Optimiza LCP/bandwidth. Lint lo marca como
  warning.
- **`formatPrecio` y formato AR**: si el CSV trae `"1.500"` (formato
  argentino con punto de miles), `Number("1.500")` da `1.5`. Normalizar
  puntos/comas antes de parsear.
- **Tipado en `getConfig`**: el cast `(config[clave] as number) = num`
  esconde el tipo; un mapper explícito por clave sería más seguro.
- **Re-slugify de `oferta.imagen`**: la columna ya se llama "slug
  imagen", el `.replace(/\s+/g, '-')` extra sobra.

### UX / robustez
- Falta `app/loading.tsx` y `app/error.tsx`.
- Estado de carga inicial: actualmente muestra "Sin productos
  disponibles" hasta que llega el primer fetch.
- Validar que `--font-geist-sans` realmente se aplique a los hijos
  (hoy `body` cae directo a Arial como fallback).

### Limpieza opcional
- Decidir si mantener los handlers `/api/productos`, `/api/ofertas`,
  `/api/config`: ya no los usa la página. Quedan disponibles por si el
  cliente quiere consumirlos desde fuera. Si no, borrar para reducir
  superficie.

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
