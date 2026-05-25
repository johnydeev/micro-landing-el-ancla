# Progreso del proyecto — micro-landing-el-ancla

Actualizado al 25/05/2026 (sesión 2).

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

Priorizadas según el orden acordado: bloque actual está cerrado
(sesión 2 cubrió 7+4+9); siguen 1+2+3 y por último 5+6+8.

### Próximo bloque (Sesión 3 propuesta) — Estilos
- **Estilos inline en `CartelOferta`**: decenas de `style={{...}}` que
  pertenecen al `.module.css`. Mover a clases CSS. Pasar colores de
  `negocioConfig` como CSS variables desde el contenedor padre. Ver
  `components/PantallaRotativa.tsx` líneas ~150-280.
- **CSS muerto en `page.module.css`**: `.headCell`, `.priceHead`,
  `.rowEven`/`.rowOdd` casi vacíos. Limpiar.
- _(El item #3 de "imágenes con `next/image`" se descartó como
  decisión de proyecto. Ver `docs/decisiones.md` — "Mantener `<img>`
  en vez de `next/image`")_.

### Bloque de cierre (Sesión 4 propuesta) — Tipos y contrato
- **Tipado en `getConfig`** (`lib/sheets.ts:281-285`): el cast
  `(config[clave] as number) = num` esconde el tipo. Reemplazar por un
  mapper `Record<keyof ConfigNegocio, parser>` con `satisfies` para
  que TS exija un parser por clave nueva.
- **Re-slugify de `oferta.imagen`** (`components/PantallaRotativa.tsx`
  líneas ~178-181): la columna ya se llama "slug imagen". Decidir
  contrato: confiar en lo cargado, o dejarlo y loguear `console.warn`
  cuando difiere del slugificado, para detectar cargas mal hechas.
- **Estado de carga visible distinguible del "vacío legítimo"**: hoy
  si los fetch devuelven `[]` la pantalla muestra "Sin productos
  disponibles" sin contexto. Con `loading.tsx` + `error.tsx` ya
  cubrimos los bordes; queda decidir qué mostrar si Sheets devuelve
  arrays vacíos genuinos (planilla en mantenimiento, por ejemplo).

### Resuelto (referencia)
- ✅ `loading.tsx` + `error.tsx` (sesión 2)
- ✅ `formatPrecio` formato AR (sesión 2)
- ✅ Tailwind v4 en `layout.tsx` — reset centralizado en `globals.css` (sesión 2)
- ✅ Endpoints `/api/*` documentados en `docs/api.md` (sesión 2)
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
