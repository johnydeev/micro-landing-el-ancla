# Decisiones técnicas — micro-landing-el-ancla

Registro de decisiones tomadas en el proyecto, con el problema que las
motivó y la alternativa descartada.

---

## 2026-05-25 — Server Component + polling cliente sobre `router.refresh()`

### Problema

La página inicial era `'use client'` y cargaba los datos en un
`useEffect` golpeando `/api/productos`, `/api/ofertas` y `/api/config`.
Cada uno de esos handlers, internamente, leía el CSV de Google Sheets.
La cadena era:

```
browser ──fetch──▶ /api/productos ──fetch──▶ Google Sheets CSV
```

Tres saltos para datos que el servidor podía resolver en uno. Además,
existía un componente `AutoRefresh` que llamaba `router.refresh()` cada
5 minutos en paralelo al `setInterval` interno de la página — pero
como la página era cliente, ese `router.refresh()` no aportaba data
nueva. Polling duplicado y sin efecto.

### Decisión

**1. `app/page.tsx` pasa a ser Server Component asíncrono.** Llama
directo a `getListasPrecios()`, `getOfertas()` y `getConfig()` en
paralelo, y pasa los resultados como props al primer render. La cache
de `fetch` de Next (`{ next: { revalidate: 60 } }` dentro de
`lib/sheets.ts`) se encarga del rate-limit hacia Sheets.

**2. La rotación se aísla en `components/PantallaRotativa.tsx`
(Client Component).** Recibe `listas`, `ofertas` y `configRemota` por
props. Mantiene el estado de rotación (`modo`, `cartelIndex`,
`listaIndex`) y dispara `router.refresh()` cada `minutosActualizacion`
para re-renderizar el Server Component con datos frescos (si la cache
del `fetch` ya expiró, vuelve a Sheets).

**3. `AutoRefresh` se elimina.** Su rol queda absorbido por el
intervalo interno de `PantallaRotativa`, esta vez con efecto real
porque arriba hay un Server Component que sí re-fetchea.

### Alternativas descartadas

- **Mantener cliente + `useEffect` fetch.** Es lo que había. Funciona
  pero deja un round-trip extra en cada visita y obliga a duplicar la
  lógica de polling. Descartado.
- **Server Actions con `refresh()` de `next/cache`.** En Next 16,
  `refresh()` (importado de `next/cache`) solo se permite dentro de
  Server Actions y no desde Client Components ni Route Handlers.
  Habría que envolver el tick del intervalo en una server action sin
  argumentos, lo cual agrega ceremonia sin beneficio sobre
  `router.refresh()` que sí funciona desde el cliente y revalida lo
  mismo. Descartado.
- **`revalidatePath('/')` desde un endpoint propio.** Idem: agrega un
  endpoint solo para invalidar cache. `router.refresh()` ya lo hace
  desde el cliente sin endpoint extra.

### Trade-offs

- `router.refresh()` no invalida la cache del `fetch` server-side por
  sí mismo (lo aclara la doc de `useRouter` en Next 16). Sí dispara un
  nuevo render del Server Component, que reusará la cache si todavía
  no expiró. En este caso conviene: el `revalidate: 60` de
  `lib/sheets.ts` actúa como techo de frecuencia hacia Sheets, y
  `minutosActualizacion` (1 min por default) define cada cuánto el
  cliente intenta. La combinación da "datos frescos como mucho cada
  60 s, intentando refrescar la pantalla cada 1 min", sin martillar
  Sheets.
- La página quedó `prerendered as static content` con `Revalidate 1m`
  en el output del build (antes era dinámica por ser cliente). Mejor
  TTFB en cold-start.

### Notas para mantener

- Si el cliente quiere bajar la frecuencia (ej. cada 10 min), basta
  con cambiar `minutosActualizacion` en su pestaña CONFIG de Sheets.
  No requiere redeploy.
- Si en algún momento se necesita forzar invalidación del cache server
  (ej. botón "actualizar ya" desde una UI admin), se puede agregar una
  Server Action que llame a `revalidatePath('/')`. Hoy no hace falta.

---

## 2026-05-25 — Mantener `<img>` en vez de `next/image`

### Problema

ESLint marcaba warning sobre `<img>` en `components/Header.tsx` (logo) y
`components/PantallaRotativa.tsx` (imagen de oferta) sugiriendo migrar a
`<Image />` de `next/image` para optimizar LCP/bandwidth.

### Decisión

**No migrar a `next/image`. Mantener `<img>` y desactivar la regla
`@next/next/no-img-element` en `eslint.config.mjs`.**

### Por qué

1. **Costo en capa gratuita de Vercel.** El optimizador de imágenes
   incluido en `next/image` consume cuota del plan (Image
   Optimization). Este proyecto se vende como micro-landing barata y
   tiene que correr indefinidamente en el plan gratis sin sorpresas de
   facturación.
2. **Los assets ya están bajo control.** El logo es un PNG fijo y
   chico en `public/logo.png`. Las imágenes de oferta son PNGs que el
   cliente sube a `public/ofertas/` con un slug conocido — pueden
   pre-optimizarse manualmente al subir.
3. **Audiencia única y estable.** La pantalla corre en un display
   dentro del local, con una sola resolución conocida. Las ventajas de
   `next/image` (srcset responsivo, lazy loading off-screen) no
   aplican: la imagen activa siempre está visible.

### Alternativas descartadas

- **Loader propio (`unoptimized: true`).** Saca el costo pero
  obligaría a importar `next/image` y tipar dimensiones explícitas en
  cada uso, sin ganar nada respecto a `<img>`. Descartado.
- **`<img>` con `loading="lazy"` y `decoding="async"`.** Podría
  sumarse si en el futuro hay más de una imagen visible
  simultáneamente. Por ahora innecesario.
- **Migrar solo el logo a `next/image` con `priority`.** Beneficio
  marginal en LCP (el logo carga rápido igual desde `/public`) y el
  costo se prorratea.

### Reglas para mantener esta decisión

- Si alguien agrega un nuevo `<img>`, no hay warning que lo frene
  (regla off). Documentar acá si la decisión cambia.
- Si el proyecto migra a un plan pago de Vercel u otro hosting que no
  cobre por optimización, reabrir la decisión.
- Pre-optimizar PNGs antes de subir (TinyPNG, Squoosh) — sigue siendo
  la mejor herramienta gratis y predecible.

---

## 2026-05-25 — `loading.tsx` y `error.tsx` con branding del local

### Problema

La pantalla se ve en la vidriera de Granja El Ancla. Si Sheets tarda o
falla, la audiencia (público final caminando por la calle) vería:

- Pantalla en blanco mientras se resuelven los tres `fetch` iniciales.
- El error genérico de Next con stack trace si algún `fetch` falla.

Ambos casos son malos: rompen la imagen del local sin necesidad,
porque los datos de contacto (WhatsApp, Instagram, horarios) viven en
`config/negocio.ts` y siempre están disponibles, aún sin Sheets.

### Decisión

**Crear `app/loading.tsx` y `app/error.tsx` con el branding del local
y fallback a datos locales.**

- `loading.tsx` (Server Component): muestra el nombre del local +
  "Cargando ofertas…" + spinner. Mismo layout 16:9 que el resto, para
  que el cambio sea visualmente continuo.
- `error.tsx` (Client Component, por contrato de Next): muestra el
  nombre + "Estamos actualizando los precios. Volvé en unos minutos." +
  WhatsApp / Instagram / horarios desde `config/negocio.ts` + botón
  "Reintentar" cableado a `reset()`. Loguea el error a consola para
  diagnóstico (Vercel lo captura en producción).

### Alternativas descartadas

- **`notFound()` desde el Server Component cuando los fetch devuelven
  vacío.** Es más agresivo que un boundary y no distingue "Sheets
  caído" de "Sheets devolvió 0 productos legítimos" (puede pasar
  cuando se reformatea la planilla). Descartado.
- **No tener `loading.tsx`.** Mostraría pantalla negra hasta el
  primer render. En cold-start con red lenta se nota.
- **Mensaje técnico al usuario final.** Descartado — el público no
  necesita saber que falló Sheets.

### Trade-offs

- `error.tsx` solo captura errores del segmento `/`. Si en el futuro
  hay rutas nuevas, cada una necesita el suyo o uno global en
  `app/error.tsx` (ya es global porque está en la raíz del segmento).
- El botón "Reintentar" hace `reset()` del boundary. Si la causa del
  error sigue presente (ej. variable de entorno faltante), volverá a
  fallar inmediatamente. Es aceptable: la mayoría de los casos reales
  son red transitoria.

---

## 2026-05-25 — `formatPrecio` tolerante a formato AR

### Problema

`formatPrecio` hacía `Number(precio)` directo sobre el string del CSV.
Si el cliente cargaba el precio en formato argentino (`1.500` con
punto de miles), `Number("1.500")` devolvía `1.5` y la pantalla
mostraba `$1,5` en vez de `$1.500`. Bug silencioso porque no tira
error: solo muestra un número incorrecto.

### Decisión

Normalizar antes de parsear:

```ts
const limpio = precio.trim()
const normalizado = limpio.includes(',')
  ? limpio.replace(/\./g, '').replace(',', '.')
  : limpio
const num = Number(normalizado)
```

Heurística: **si hay coma, asumimos formato AR** (`1.500,50` →
`1500.50`). **Si no hay coma**, lo dejamos como está, lo cual funciona
tanto para enteros (`"1500"`) como para formato JS/US (`"1500.50"`).

### Alternativas descartadas

- **Forzar al cliente a usar siempre un formato.** Imposible de
  garantizar — el cliente escribe en Sheets a mano, sin validación.
- **`Intl.NumberFormat` con parser inverso.** No existe parser oficial;
  habría que escribir el inverso manualmente. La heurística cubre los
  casos reales.
- **Detectar formato por regex compleja.** Suma complejidad para los
  mismos casos. La regla "coma = decimal AR" cubre 100% de lo que
  vemos.

### Convención documentada

El cliente puede cargar precios en cualquiera de estos formatos y la
pantalla los mostrará bien:

| Entrada en Sheets | Render en pantalla |
|-------------------|--------------------|
| `1500`            | `$1.500`           |
| `1500.50`         | `$1.500,5`         |
| `1.500`           | `$1.500`           |
| `1.500,50`        | `$1.500,5`         |

Si la entrada no es numérica, se renderiza literal con `$` adelante
(no se rompe la pantalla).

---

## 2026-05-25 — Reset CSS centralizado en `globals.css`

### Problema

`app/layout.tsx` tenía `<body className="m-0 p-0 overflow-hidden">`,
clases de Tailwind v4. Pero `app/globals.css` ya define el mismo
reset:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
```

Las clases en JSX eran redundantes con el CSS. Peor: dependían de que
Tailwind v4 las siga exponiendo bajo esos nombres (la API cambió
respecto a v3).

### Decisión

**Quitar las clases Tailwind del `<body>` en `layout.tsx`.** El reset
queda 100% en `globals.css`, sin depender de utilidades de framework.

### Trade-offs

- Si en el futuro se quiere meter clases utilitarias de Tailwind,
  perfecto — pueden agregarse. Pero el reset base ya no se rompe si
  Tailwind v4 cambia el nombre de la utilidad o si se desactiva
  Tailwind por completo.

---

## 2026-05-25 — Regex de diacríticos con `new RegExp` + escapes Unicode

### Problema

`lib/sheets.ts` normalizaba las claves de la pestaña CONFIG haciendo
`normalize('NFD').replace(/[̀-ͯ]/g, '')`, pero la regex
estaba escrita con los caracteres **literales** del rango (U+0300 a
U+036F: marcas combinatorias de acentos). Estos caracteres son
invisibles en la mayoría de los editores y se pegan a la letra
anterior, así que el código se veía como `replace(/[̀-ͯ]/g, '')` y era
muy fácil destruir la regex con un copy/paste o un reformateo. Algunos
editores incluso normalizan el archivo al guardar.

### Decisión

Reemplazar la regex literal por una construcción explícita:

```ts
const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
```

Con un comentario que explica para qué sirve y por qué se escribe así
en vez de con el literal. La regex se exporta como constante
nombrada, no como expresión inline, para que sea obvio que es
intencional y reusable.

### Alternativas descartadas

- **`/[̀-ͯ]/g` como literal.** Sintaxis válida en JS y
  funciona idéntico. La preferí en `new RegExp` solo para evitar la
  ambigüedad visual de las barras y dejar el rango como string puro,
  que sobrevive mejor a herramientas que toquetean el archivo.
- **Usar `\p{M}` (categoría Unicode "Mark").** Requeriría flag `u` y
  capturaría más de la cuenta (marcas no espaciadoras, espaciadoras y
  encierros). Para "quitar acentos" el rango U+0300–U+036F es
  exactamente lo que queremos. Descartado.

---

## Decisiones previas (heredadas del proyecto)

Estas decisiones ya estaban tomadas antes de la sesión 1; las dejo
documentadas porque condicionan cómo se trabaja sobre el código.

### Google Sheets publicado como CSV (no API)

El cliente edita los precios en su Google Sheets habitual. En vez de
integrar con la API de Sheets (que requiere OAuth o service account),
el cliente publica cada pestaña como CSV (`Archivo → Compartir →
Publicar en la web → CSV`) y nos pasa la URL.

**Pros:** sin credenciales, sin cuotas de API, edición transparente
para el cliente.

**Contras:** parser CSV propio (en `lib/sheets.ts`), latencia del
"publicar" de Sheets (~1-2 min hasta que los cambios aparecen),
estructura tabular rígida.

### Defaults locales en `config/negocio.ts` con override remoto

Los valores de timing, contactos y horarios están duplicados:

- `config/negocio.ts`: defaults que viajan con el código.
- Pestaña CONFIG en Sheets: overrides que el cliente puede editar sin
  redeploy.

`PantallaRotativa` lee siempre el remoto y cae al local si está
ausente: `configRemota.segundosCartel ?? negocioConfig.segundosCartel`.

Esto permite que el cliente ajuste velocidad de rotación o cambie su
número de WhatsApp sin tocar código, pero la app sigue funcionando si
la planilla está caída o sin esa clave.

### Sin DB, sin auth, sin sesiones

La página es de "broadcast" — la mira cualquiera que pase por la
vidriera del local. No hay usuarios. El único actor con permisos es el
cliente, que edita su Sheets.
