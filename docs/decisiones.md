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

## 2026-05-25 — Service Worker para resistir caídas de wifi en el Stick TV

### Problema

En producción, la pantalla del local (Stick TV con Android TV genérico)
quedaba mostrando la página de error del navegador Chrome:

```
Página web no disponible
No ha sido posible cargar la página web https://precios-el-ancla.vercel.app/ porque:
net::ERR_INTERNET_DISCONNECTED
```

Cuando la wifi del local se cae (señal inestable común en
comercios), el navegador descartaba nuestra app y mostraba su propio
error. JavaScript no podía recuperarse porque ya no estaba corriendo
— alguien físicamente tenía que agarrar el control remoto y recargar.

### Decisión

Implementar un **Service Worker** que intercepta todos los fetches
same-origin y los cachea, con estrategia **network-first con fallback
a cache**:

- **Online**: pasa el request a la red, cachea la respuesta, devuelve
  al cliente. Comportamiento idéntico al actual.
- **Offline / red caída**: el `fetch` tira, el SW devuelve la copia
  cacheada. El navegador ve un response 200 OK y nunca muestra
  ERR_INTERNET_DISCONNECTED.
- **Último recurso** para navegaciones (`req.mode === 'navigate'`):
  si el path específico no está cacheado, devolvemos la home cacheada
  para que al menos algo se renderice.

Combinado con dos defensas complementarias:

1. **Listener `online` en `PantallaRotativa`**: cuando el navegador
   detecta que volvió la red sin que la app haya muerto, fuerza un
   `router.refresh()` inmediato para no esperar al próximo tick.
2. **Auto-retry en `error.tsx`** cada 10s: si caemos al boundary
   nuestro (no al del browser), se recupera solo sin operador.

### Alternativa descartada

- **Instalar un navegador kiosko (Fully Kiosk Browser) en el Stick
  TV.** Es la solución estándar de la industria para cartelería
  digital y resuelve también el caso de cold-start con red caída.
  El cliente la descartó: no quiere mantener una app extra en el
  Stick, prefiere que el problema viva dentro del código del
  proyecto.

### Limitación honesta

El Service Worker se instala **después** del primer load exitoso.
Esto significa:

- **Caso resuelto**: pantalla ya estaba andando + wifi se cae → SW
  sirve cache → no se ve pantalla blanca. **Es el caso real
  reportado.**
- **Caso NO resuelto**: Stick TV se enciende desde cero con la wifi
  caída → no hay SW instalado todavía → Chrome muestra error. Si
  esto se vuelve problema, la solución es la app kiosko (ya
  descartada) o una solución a nivel del Stick (router con UPS,
  cron de reboot, etc.).

### Estrategia de cache: network-first vs cache-first

Elegimos **network-first** para TODO (incluyendo assets estáticos
de `_next/static/*`). Pros y contras:

- **Pros**: garantiza que online siempre vemos data fresca. Si el
  cliente subió un precio nuevo, lo vemos en el próximo
  `router.refresh()`, no en el siguiente boot.
- **Contras**: cada request paga el round-trip a la red incluso si
  está cacheado. Para assets hasheados de Next esto es un poco
  redundante (los hashes ya garantizan inmutabilidad), pero la
  pérdida es marginal en una pantalla 16:9 que carga 1 sola vez por
  boot y después solo refresca data via RSC.
- **Por qué no cache-first para `/_next/static/*`**: agregaría
  complejidad al SW (path matching, dos estrategias) sin beneficio
  real para este caso de uso. La simplicidad gana.

### Riesgo: SW pegajoso con código bugueado

Service Workers son notoriamente difíciles de "desinstalar" en
producción. Si shipeo un SW bugueado, queda atascado en el Stick
TV indefinidamente hasta que alguien limpie cache manualmente.

**Mitigaciones aplicadas:**

1. **Versionado del cache** (`CACHE_VERSION = 'micro-landing-v1'`).
   Cada bump invalida todas las caches viejas en el `activate`.
2. **`skipWaiting()` + `clients.claim()`** en `install`/`activate`:
   cuando un SW nuevo se descarga, toma control inmediatamente sin
   esperar a que se cierren tabs (en el Stick no hay multiples
   tabs).
3. **Headers en `next.config.ts`**: `/sw.js` se sirve con
   `Cache-Control: public, max-age=0, must-revalidate` para que el
   navegador revalide el SW en cada navegación. Sin esto, Vercel
   podría cachear `/sw.js` con TTL largo y el SW viejo seguiría
   vigente días/semanas.
4. **Registro solo en producción**: en dev (`NODE_ENV !==
   'production'`) el SW no se registra. Evita pesadillas de cache
   stale durante desarrollo.

### Kill switch de emergencia

Si en algún momento el SW genera problemas serios y necesitamos
desactivarlo en producción rápido, el camino es:

1. Reemplazar `public/sw.js` por un script que se auto-desinstala:

```js
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', async (event) => {
  const keys = await caches.keys()
  await Promise.all(keys.map((k) => caches.delete(k)))
  const clients = await self.clients.matchAll()
  clients.forEach((c) => c.navigate(c.url))
  await self.registration.unregister()
})
```

2. Deploy a Vercel.
3. La próxima vez que el Stick recargue, este SW reemplaza al
   anterior, limpia todas las caches, se desregistra y recarga la
   página. Después de eso, la app vuelve al estado pre-SW.

Documentado por si llega ese momento — no se aplica todavía.

---

## 2026-05-25 — Tamaño de imagen por-oferta: escala discreta 1-5 vía Sheets

### Problema

El layout del cartel está pensado para imágenes con proporción
aproximadamente cuadrada o ligeramente apaisada. Algunas imágenes
(carnes con cortes muy alargados, productos altos, packs envueltos
en bolsas) tienen proporciones distintas y se ven mal con el 80% de
tamaño que aplica a todas. El cliente necesitaba poder **ajustar
el tamaño por oferta sin tocar el código**.

### Decisión

Agregar una **columna opcional** al bloque de ofertas del Sheets,
con un valor entero entre **1 y 5**, mapeado a porcentajes del
wrapper de la imagen:

| Valor | Porcentaje | Uso típico |
|---|---|---|
| `1` | 60 % | Imagen que se ve demasiado grande |
| `2` | 70 % | Levemente más chica |
| `3` (default) | 80 % | Comportamiento previo a la feature |
| `4` | 90 % | Levemente más grande |
| `5` | 100 % | Imagen muy chica que necesita llenar el wrapper |

**Backwards compatible:** si la columna no existe o el valor es
inválido (no entero, fuera de rango, vacío), se aplica `3` y la
oferta se ve igual que antes de la feature.

**Headers aceptados** para la 5ta columna (normalizados sin acentos):
`tamano`, `tamano imagen`, `tamano de imagen`, `escala`, `escala
imagen`, `size`.

### Por qué escala discreta y no porcentaje libre

- **Audiencia es no técnica.** El dueño del local edita Sheets a
  mano; pedirle valores como `87%` o `1.2` agrega fricción. `1 a 5`
  es inmediato.
- **Cubre los casos reales.** El layout es fijo (16:9 del display)
  y el wrapper está en una posición determinada. Hay un rango útil
  estrecho — más allá de 100 % la imagen se sale del cartel; debajo
  de 60 % se pierde el impacto visual. Cinco pasos son suficientes.
- **Limita el espacio de pruebas.** Si en el futuro alguien ve que
  un valor no funciona bien, hay solo cinco mapeos a revisar en
  un único lugar (`TAMANO_OFERTA_A_ESCALA` en
  `components/PantallaRotativa.tsx`).

### Por qué CSS variable inline y no clase

La escala se aplica como `style={{ '--cartel-image-scale': '90%' }}`
sobre el `<img>`, y `.cartelImage` consume `var(--cartel-image-scale,
80%)`. Esto es consistente con la decisión previa sobre **CSS
variables inyectadas en `.screen`** (ver ADR del 25/05/2026):
el JSX solo emite variables, el layout entero vive en CSS.

Alternativa descartada: tener cinco clases `.cartelImage1` …
`.cartelImage5` y elegir cuál aplicar. Más bullets en el CSS, sin
ganancia.

### Trade-offs

- Si el cliente carga `7` (fuera de rango), la oferta cae a `3`
  silenciosamente. No se loguea. Si en el futuro queremos detectarlo
  podemos sumar un `console.warn` en dev como ya hacemos con el slug
  (ver ADR "Re-slugify de oferta.imagen con warning en dev").
- El parser está acotado al rango 1-5. Si más adelante se necesita
  un valor intermedio (75 %, 85 %), hay que decidir si granular más
  el mapeo (1-10) o cambiar a porcentaje libre. Ambas opciones tocan
  solo dos lugares: el parser (`lib/sheets.ts`) y el mapeo
  (`PantallaRotativa.tsx`).

### Instrucciones para el cliente

En la pestaña de ofertas del Google Sheets, agregar una **5ta
columna** después de `ESTADO` con cualquiera de estos nombres:
`tamaño`, `escala`, `size`. Llenar con un número de 1 a 5 solo
para las ofertas que necesitan ajuste — las demás pueden quedar en
blanco y se renderizan al tamaño normal.

---

## 2026-05-25 — Mapper tipado en `getConfig` (parsers por clave con `satisfies`)

### Problema

`getConfig` en `lib/sheets.ts` usaba dos estructuras paralelas para
parsear el CSV de configuración:

1. `CONFIG_KEYS_NUMERICOS: Set<string>` — qué claves son números.
2. `CONFIG_ALIASES: Record<string, keyof ConfigNegocio>` — qué alias
   mapean a qué clave canónica.

Y el loop asignaba con casts:

```ts
if (CONFIG_KEYS_NUMERICOS.has(clave)) {
  ;(config[clave] as number) = num
} else {
  ;(config[clave] as string) = valor
}
```

Los `as number` / `as string` desactivaban el chequeo de TypeScript.
Si mañana alguien agregaba una clave booleana a `ConfigNegocio` (ej.
`modoMantenimiento?: boolean`), TS no avisaba que faltaba el parser:
la clave quedaba ignorada silenciosamente, o peor, se le asignaba el
string crudo del CSV.

### Decisión

Reemplazar el `Set` + casts por un **mapper tipado por clave** validado
con `satisfies`:

```ts
type ConfigParser<K extends keyof ConfigNegocio> = (raw: string) => ConfigNegocio[K] | undefined

const parseNum = (raw: string): number | undefined => {
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}
const parseStr = (raw: string): string | undefined => (raw === '' ? undefined : raw)

const CONFIG_PARSERS = {
  segundosCartel: parseNum,
  segundosTabla: parseNum,
  minutosActualizacion: parseNum,
  horarios: parseStr,
  whatsapp: parseStr,
  instagram: parseStr,
} satisfies { [K in keyof Required<ConfigNegocio>]: ConfigParser<K> }
```

Y un helper genérico `asignarConfig<K>(...)` que aplica el parser
correcto y asigna con el tipo preservado.

### Por qué `satisfies` y no anotación de tipo

- Con `: Record<keyof ConfigNegocio, ConfigParser<keyof ConfigNegocio>>`
  perderíamos el estrechamiento por clave: TS asumiría que cualquier
  parser puede recibir cualquier clave, y la asignación
  `config[clave] = parser(valor)` requeriría casts de vuelta.
- Con `satisfies`, TS conserva el tipo literal por clave (TS sabe que
  `CONFIG_PARSERS.segundosCartel` devuelve `number | undefined`,
  no `number | string | undefined`).

### Validación de que funciona

Antes de cerrar la sesión, probé agregar `modoMantenimiento?: boolean`
a `ConfigNegocio` y reverificar:

```
lib/sheets.ts(241,3): error TS1360: Type '{ ... }' does not satisfy
the expected type '{ ..., modoMantenimiento: ConfigParser<...>; }'.
Property 'modoMantenimiento' is missing.
```

Build rompe en compilación. Exactamente lo que queríamos. Revertí el
cambio en `types/index.ts` después de confirmar.

### Trade-offs

- El cast interno en `asignarConfig` (`parser as ConfigParser<K>`) es
  necesario porque TS no puede estrechar el genérico `K` en runtime.
  Es seguro porque el `satisfies` en `CONFIG_PARSERS` ya validó que
  cada clave tiene su parser del tipo correcto.
- `parseStr` ahora retorna `undefined` para strings vacíos (antes
  asignaba el string crudo). Mejora: claves vacías ya no contaminan
  el objeto config. Mismo efecto que el `if (!valor) continue` que ya
  existía afuera, redundancia defensiva.

---

## 2026-05-25 — Re-slugify de `oferta.imagen` con warning en dev

### Problema

`CartelOferta` re-slugificaba el campo `oferta.imagen` antes de
construir el path al PNG:

```ts
const slug = oferta.imagen.toLowerCase().trim().replace(/\s+/g, '-')
```

Pero la columna del CSV ya se llama **"slug imagen"** — el contrato
con el cliente es cargar un slug, no un nombre con espacios. El
re-slugify era defensivo: si el cliente cargaba `"Asado Especial"`,
lo convertía a `"asado-especial"` y la pantalla seguía funcionando.

El problema era que **el cliente nunca se enteraba** de que estaba
cargando mal. Y si en algún momento queremos cambiar el uso del campo
(ej. usar el string completo como descripción, o como URL), el
silencio juega en contra.

### Decisión

**Mantener el re-slugify como red de seguridad** + **loguear en
desarrollo** cuando el original difiere del slugificado:

```ts
if (process.env.NODE_ENV !== 'production' && slug !== oferta.imagen) {
  console.warn(
    `[ofertas] "${oferta.imagen}" se re-slugify como "${slug}". ` +
      `Cargar el slug correcto en la planilla (columna "slug imagen").`,
  )
}
```

Tres comportamientos posibles según el contexto:

| Contexto | Comportamiento |
|---|---|
| Cliente carga slug correcto | Sin warning, todo igual |
| Cliente carga mal en producción | Pantalla funciona, sin warning visible |
| Desarrollador prueba localmente | Warning en consola al detectar el patrón |

### Alternativas descartadas

- **Opción A — Confiar en el contrato.** Usar `oferta.imagen` tal
  cual, sin slugificar. Si el cliente carga mal, no se ve la imagen
  (cae al `onError`). Más simple, pero hostil al cliente real que
  carga la planilla a mano.
- **Opción C — Validar en `lib/sheets.ts`** y filtrar las ofertas
  con slug inválido. Más estricto: la oferta no aparecería hasta
  cargarla bien. Descartado porque "no se ve la oferta" es peor que
  "se ve la oferta pero el nombre del archivo no es perfecto".

### Notas para mantener

- El warning vive en `NODE_ENV !== 'production'`. Vercel lo desactiva
  en builds productivos automáticamente (`process.env.NODE_ENV ===
  'production'` está hardcoded en `next build`).
- Si más adelante se quiere ver el warning en producción para detectar
  cargas mal hechas a distancia, conectar a un logger remoto (Sentry,
  LogTail). Hoy sería over-engineering.

---

## 2026-05-25 — Empty state con texto amable y datos de contacto

### Problema

Cuando los fetch a Sheets devolvían `[]` (planilla vacía, CSV
malformado, columna renombrada), la pantalla mostraba `Sin productos
disponibles` en gris pelado. El público que pasaba por la vidriera
veía un mensaje técnico y sin acción posible.

Los bordes ya estaban cubiertos:
- HTTP error → `error.tsx` (sesión 2)
- Mientras los fetch resuelven → `loading.tsx` (sesión 2)

Pero el caso "200 OK con array vacío" caía en la tabla y mostraba el
texto seco.

### Decisión

Reemplazar el `Sin productos disponibles` por un mensaje en dos líneas
con tono al público y datos de contacto del local:

```
Estamos actualizando la lista de precios.
Consultá por 11 6000 7394
```

El WhatsApp se toma del config remoto con fallback al local:
`configRemota.whatsapp ?? negocioConfig.whatsapp ?? negocioConfig.telefono`.

### Alternativas descartadas

- **Opción B — Throwear desde el Server Component cuando todo está
  vacío.** Llevaría al usuario al `error.tsx`. Trade-off: pasa a un
  mensaje más alarmista ("Estamos actualizando los precios. Volvé en
  unos minutos."). Descartado porque empty state ≠ error: la planilla
  puede estar vacía a propósito.
- **Opción C — Clave de mantenimiento explícita en CONFIG.**
  Agregar `modoMantenimiento?: boolean` a `ConfigNegocio` y mostrar
  una pantalla dedicada. Descartado por YAGNI: no hay caso de uso
  real todavía. Si en el futuro aparece, el mapper tipado de
  `getConfig` ya está preparado (la decisión de mapper de esta misma
  sesión hizo que agregar una clave booleana sea seguro).

### Notas para mantener

- El texto está hardcoded en español neutro AR. Si se vende el
  proyecto a otro local con copy distinto, mover a `negocioConfig` o
  a la pestaña CONFIG remota como clave `mensajeMantenimiento`.

---

## 2026-05-25 — Colores de marca via CSS variables inyectadas en `.screen`

### Problema

`CartelOferta` y la tabla de precios tenían los colores (`primario`,
`secundario`, `textoPrimario`, etc.) repetidos como `style={{ background:
negocioConfig.colores.primario }}` en una docena de elementos. Eso:

1. Inflaba el JSX con bloques `style={{...}}` de 10-14 propiedades
   cada uno.
2. Recreaba los objetos de estilo en cada render.
3. Hacía imposible cambiar el branding sin tocar el JSX en N lugares.
4. Acoplaba el CSS module al componente de manera frágil (el CSS no
   conocía los colores y dependía del JSX para que se aplicaran).

### Decisión

**Inyectar los colores como CSS custom properties** en el contenedor
`.screen` y consumirlas desde `page.module.css` con `var(--c-*)`:

```tsx
const screenVars = {
  '--c-primario': negocioConfig.colores.primario,
  '--c-secundario': negocioConfig.colores.secundario,
  '--c-fondo': negocioConfig.colores.fondo,
  '--c-texto-primario': negocioConfig.colores.textoPrimario,
  '--c-texto-secundario': negocioConfig.colores.textoSecundario,
  '--c-fila-impar': negocioConfig.colores.filaImpar,
  '--table-font-scale': `${negocioConfig.tipografia.tabla / 100}`,
} as CSSProperties

<div className={styles.screen} style={screenVars}>
```

```css
.cartelDiagonal { background: var(--c-secundario); }
.cartelBadge   { background: var(--c-primario); color: #fff; }
.row:nth-child(even) { background: var(--c-fila-impar); }
.priceValue { color: var(--c-primario); }
```

El único `style={}` que sobrevive es ese contenedor: pasa las
variables. El resto del JSX usa solo `className`.

### Por qué esta forma y no otras

- **CSS variables vs. clases hardcoded**: si en algún momento el
  cliente pide variantes (ej: paleta "navidad", "fiestas patrias",
  "halloween"), solo hay que cambiar el objeto que define
  `screenVars`. El CSS no se toca.
- **CSS variables vs. CSS-in-JS runtime**: cero peso de runtime, cero
  hidratación de estilos. El CSS module se compila estático y solo
  las variables viajan como `style=` mínimo. Funciona idéntico en
  Server Components.
- **CSS variables vs. Tailwind**: ya está descartado Tailwind del
  reset (ver decisión "Reset CSS centralizado"). Mantener el proyecto
  con un solo enfoque (CSS modules + variables) es más simple para
  vender.

### Trade-offs

- Si alguien edita `config/negocio.ts` y agrega un color nuevo, tiene
  que recordar dos pasos:
  1. Inyectarlo como variable en `screenVars`.
  2. Usarlo desde el CSS con `var(--c-...)`.
  Si solo hace (1), no afecta nada (no rompe). Si solo hace (2),
  cae al default que se ponga en `var(--c-x, #fallback)`. La regla
  está documentada arriba del CSS module y al lado de `screenVars`
  en el TSX.
- Los selectores `:nth-child(odd/even)` para alternar fondos de
  filas funcionan porque el `<tr>` empty-state está en otra rama del
  ternario y no entra en el mismo `<tbody>`. Si en el futuro se
  intercalan filas de otro tipo dentro del listado, hay que revisar.

### Impacto medible

- `components/PantallaRotativa.tsx`: pasó de 303 líneas con ~12
  bloques `style={{...}}` a 199 líneas con 0 inline literals (solo
  `style={screenVars}` en el contenedor).
- `app/page.module.css`: pasó de 161 a ~270 líneas, pero esas líneas
  ahora son CSS legible con secciones comentadas (Tabla / Cartel /
  Animaciones) en vez de strings JS.
- CSS muerto eliminado en el mismo paso: `.headCell`, `.priceHead`,
  `.rowEven`, `.rowOdd`.

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
