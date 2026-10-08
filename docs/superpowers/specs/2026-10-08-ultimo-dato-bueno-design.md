# Último dato bueno (falla de Google) — diseño

Fecha: 2026-10-08 · Estado: aprobado en brainstorming, pendiente de plan.

## Objetivo

Con varios comercios en producción (El Ancla, El Látigo, demo; meta ~20
clientes / ~40 TVs), una falla de Google Sheets hoy deja **todas** las TVs en
"Estamos actualizando" a la vez. Este cambio hace que cada TV siga mostrando
lo último que recibió bien, por un tiempo acotado, y que se recupere sola
cuando Google vuelva.

Es la primera de dos mejoras de escala. La segunda (activación de pantallas)
va en su propio spec.

## Decisiones cerradas

| # | Tema | Decisión |
|---|---|---|
| 1 | Qué mostrar si falla Google | El último dato bueno, **hasta 2 horas**. Pasado eso, el comportamiento de hoy (empty state). Reabre la decisión de la sesión 19 ("precio viejo es peor que nada") acotándola en el tiempo. |
| 2 | Dónde se guarda | **En cada TV** (`localStorage` del navegador). Sin servicios nuevos. |
| 3 | Reintento | Igual que hoy: el reload periódico. Cada respuesta buena actualiza el dato guardado y reinicia las 2 horas. |
| 4 | Aviso | El punto de `HealthIndicator` suma un estado **ámbar** = "mostrando datos guardados". |
| 5 | Intervalo de reload | **5 min → 10 min** (`RELOAD_INTERVAL_MS`), para bajar a la mitad los pedidos a Google. Precio corregido llega en ~15 min como máximo. |

## Comportamiento

### Qué es una falla

Por cada parte (listas, ofertas, config), el servidor informa `ok` o `error`.

- **`error`**: el fetch a Google tira excepción, responde no-2xx, o el CSV
  **no tiene la fila de encabezados esperada** (columna movida/borrada).
- **`ok`**: el CSV llegó y se pudo interpretar, **aunque esté vacío** (ej.
  todas las ofertas INACTIVO, o lista sin productos). Una planilla vacía es
  una decisión del comercio y se muestra tal cual.
- Config: `error` si el fetch falla o si falta `TENANT_<SLUG>_CSV_URL`. Si
  el tenant no tiene `gidConfig` (configuración opcional), es `ok` con `{}`.
- Listas/ofertas: falta de `TENANT_<SLUG>_CSV_URL` o de `gidOfertas` también
  es `error` (falta de configuración, no "planilla vacía").

Efecto secundario buscado: si el dueño desacomoda una columna en horario de
atención, la TV sigue con lo último bueno en vez de quedar vacía.

### Qué hace la TV

Para cada parte, independientemente:

| Llega del server | Hay guardado de < 2 h | Se muestra | Se guarda |
|---|---|---|---|
| `ok` | — | lo que llegó | lo que llegó, con la hora actual |
| `error` | sí | lo guardado | nada (no se toca) |
| `error` | no (o > 2 h) | lo que llegó (vacío) → empty state como hoy | nada |

- Fallas parciales: si solo fallan las ofertas, se ven las listas nuevas y
  las ofertas guardadas.
- Edad: las 2 horas se cuentan **por parte** desde su último `ok`.
- Clave de guardado por **tenant + rubros normalizados** (`?rubro=`), así la
  TV de vacuno y la de cerdo+pollo de un mismo local no se pisan. Rubros
  normalizados y ordenados para que `?rubro=pollo,cerdo` y
  `?rubro=cerdo,pollo` compartan clave.
- `HealthIndicator`: ámbar si **alguna** parte se está mostrando desde lo
  guardado. Prioridad de colores: rojo (offline) > ámbar (datos guardados) >
  verde.

### Limitaciones aceptadas

- Una TV recién instalada (o con datos de navegador borrados) no tiene nada
  guardado: si su primera carga coincide con una falla, muestra el empty
  state como hoy.
- Parpadeo: en cada reload durante una falla, el primer render es el del
  server (vacío) y una fracción de segundo después se reemplaza por lo
  guardado (el `localStorage` solo existe en el cliente). Ocurre solo
  durante fallas, una vez cada 10 min.
- Si `localStorage` falla (bloqueado, lleno, cuota), todo sigue como hoy: se
  envuelve en try/catch y nunca rompe la pantalla.

### Página vieja del Service Worker

El Service Worker es network-first y, **sin red**, sirve la última página
HTML que cacheó. Esa página trae estado `ok` y datos de cuando se cacheó,
que pueden tener más de 2 horas. Sin `generadoEn`, la TV la tomaría como
dato nuevo: la guardaría con la hora actual (reiniciando las 2 horas sobre
datos viejos) y la mostraría sin límite. Con `generadoEn`, `resolver` la
fecha con la hora real en que el server la armó y aplica las mismas reglas
de prioridad (lo guardado, si es más nuevo, gana). En este caso el punto
ya está rojo (offline), que tiene prioridad sobre el ámbar.

## Diseño técnico

### `lib/planilla.ts`

Se agregan `leerListas` y `leerOfertas`, que devuelven `{ datos, ok }`, donde
`ok = false` solo cuando no se encontró la fila de encabezados (hoy:
`console.error` + `[]`). `parsearListas` y `parsearOfertas` quedan como
`leerX(text).datos`, así sus 16 tests no cambian. `parsearConfig` no tiene
encabezados obligatorios: sigue devolviendo el objeto y siempre es
interpretable. Se suman tests de `ok`.

### `lib/sheets.ts`

`getListasPrecios` / `getOfertas` / `getConfig` devuelven
`{ datos, estado: 'ok' | 'error' }`. `error` en: excepción, `!res.ok`,
falta de env/gid que hoy devuelve `[]` con `console.error` (falta de
configuración también es error, no "vacío legítimo"), o `ok === false` del
parser. `getPantallaData` devuelve
`{ listas, ofertas, configRemota, estado: { listas, ofertas, config } }`.

Las API públicas (`app/api/[tenant]/productos|ofertas|config/route.ts`)
pasan a usar `.datos` del nuevo retorno y siguen devolviendo solo los datos
(sin el estado): su contrato JSON no cambia.

`getPantallaData` agrega `generadoEn: number` (`Date.now()` del server al
armar la página). Ver "Página vieja del Service Worker".

### `lib/rubros.ts`

`filtrarPorRubro` ya conserva campos extra de `data` (genérico `T`), así que
el `estado` pasa intacto. Sin cambios.

### `lib/ultimo-dato-bueno.ts` (nuevo, puro, testeado)

```ts
export const VIGENCIA_MS = 2 * 60 * 60 * 1000

type Parte = 'listas' | 'ofertas' | 'config'
type Guardado = Partial<Record<Parte, { datos: unknown; en: number }>>

export function claveGuardado(slug: string, rubros: Set<string> | null): string
export function resolver(
  recibido: { listas, ofertas, configRemota, estado, generadoEn },
  guardado: Guardado,
): { mostrar: { listas, ofertas, configRemota }, guardar: Guardado, usandoGuardado: boolean }
```

`resolver` implementa la tabla de "Qué hace la TV". Sin acceso a
`localStorage` ni a reloj: todo entra por parámetro.

**Todas las edades se miden con la hora del server** (`generadoEn` de la
página actual menos el `en` guardado, que también es hora del server). No se
usa el reloj de la TV: un Fire TV con la hora corrida más de 2 horas daría
todo por vencido (o nada). Cuando Google falla el server sigue andando, así
que `generadoEn` es la hora real. Reglas extra:

- Una parte `ok` se guarda con `en = generadoEn` (hora del server).
- Una parte `ok` **más vieja que lo guardado** (`generadoEn < guardado.en`)
  no pisa lo guardado, y se muestra la más nueva de las dos.
- Límite aceptado: sin red, el Service Worker sirve una página vieja cuyo
  `generadoEn` también es viejo, así que no hay forma de medir cuánto tiempo
  pasó. Se muestra esa página (comportamiento de hoy) y el punto está rojo.

### `components/PantallaRotativa.tsx`

- Recibe `estado`, `generadoEn` y la clave de guardado (slug + rubros).
- **Lectura sin `setState` en un effect**: el proyecto usa
  `eslint-plugin-react-hooks` 7.1.1, cuya regla `set-state-in-effect`
  rechaza ese patrón. Se lee `localStorage` con `useSyncExternalStore`
  (mismo patrón que `HealthIndicator`): `getServerSnapshot` devuelve
  "sin guardado" (SSR = datos del server) y `getSnapshot` devuelve lo
  guardado, así React re-renderiza tras hidratar sin warnings. El snapshot
  es el string crudo (comparable por valor, sin loop). `getServerSnapshot`
  devuelve `undefined` ("todavía no leído"), distinto de `null` ("leído,
  vacío").
- Con lo recibido + lo guardado se llama a `resolver` en el render (función
  pura). La **escritura** de `guardar` en `localStorage` sí va en un
  `useEffect` (no hay `setState`, solo efecto externo), con try/catch, y
  **se saltea mientras lo guardado sea `undefined`**: en el render de
  hidratación `guardar` todavía no incluye las copias de las partes con
  error, y escribirlo borraría el último dato bueno justo cuando hace falta.
- **Rotación y vistas fijas usan los datos ya resueltos** (`mostrar`), no
  los props crudos: si se reemplazan listas vacías por guardadas, el reducer
  recibe los conteos correctos en cada tick. El estado inicial del reducer
  se calcula con los props crudos al montar; si después aparecen listas
  guardadas, la rotación entra a ellas en el siguiente paso del ciclo
  (aceptado, ocurre solo durante fallas).
- `RELOAD_INTERVAL_MS` pasa de `5 * 60 * 1000` a `10 * 60 * 1000`;
  actualizar el comentario.
- Pasa `usandoGuardado` a `HealthIndicator`.

### Páginas

`app/page.tsx`, `app/[tenant]/page.tsx`, `vistaCartel`, `vistaLista`: pasan
`estado` y los rubros a `PantallaRotativa`. Las vistas fijas (`modoFijo`)
también aplican el último dato bueno (comportamiento idéntico).

### `components/HealthIndicator.tsx`

Prop opcional `usandoGuardado`. Nuevo estado `guardado` → ámbar
(`#f59e0b`), título "Estado: mostrando datos guardados".

## Testing

- `lib/ultimo-dato-bueno.test.ts`: `ok` guarda y muestra lo nuevo; `error`
  con guardado < 2 h muestra guardado; `error` con guardado > 2 h (y justo
  en el límite) muestra vacío; `error` sin guardado; falla parcial (solo
  ofertas); falla seguida de `ok` reinicia la vigencia; `usandoGuardado`
  correcto; `claveGuardado` estable ante orden de rubros y `null`;
  `ok` con `generadoEn` más viejo que lo guardado no lo pisa.
- `lib/planilla.test.ts`: `ok: false` sin headers; `ok: true` con planilla
  vacía pero bien armada.
- Manual contra `npm start`: con una URL de CSV inválida en `.env.local`
  para un tenant de prueba, verificar ámbar + datos guardados tras una
  carga buena previa, y empty state si no hay guardado.

## Documentación

- `CHANGELOG.md` (sesión 24).
- `docs/decisiones.md`: nota que acota la decisión de sesión 19.
- `docs/guion-reunion.md` y `.pdf`: "hasta 10 minutos" → "hasta 15 minutos".
- `README.md`: las 3 menciones de "5 minutos" (líneas ~64, ~82, ~228) → 10,
  y **reescribir el párrafo "Trade-off aceptado"** (~82), que hoy dice que
  el fallback en `localStorage` se descartó: ahora existe, acotado a 2 horas.
- `components/PantallaRotativa.tsx`: el comentario de `RELOAD_INTERVAL_MS`
  (explica por qué no bajar de 5; pasa a explicar 10 por los pedidos a
  Google).

## Fuera de alcance

- Guardar en el servidor (Upstash/Redis).
- Activación de pantallas (spec aparte).
- Cambiar el intervalo de forma configurable por planilla.
