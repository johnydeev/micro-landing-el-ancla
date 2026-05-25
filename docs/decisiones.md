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
