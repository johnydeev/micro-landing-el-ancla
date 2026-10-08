# Último dato bueno Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Regla del proyecto:** NO ejecutar `git add` ni `git commit`. Los commits los hace el usuario. Donde un plan normal diría "commit", acá hay un **checkpoint**.

**Goal:** Si Google Sheets falla, cada TV sigue mostrando lo último que recibió bien (hasta 2 horas), con un punto ámbar de aviso; y el reload pasa de 5 a 10 minutos.

**Architecture:** El server informa por parte (listas, ofertas, config) si la lectura fue `ok` o `error`, más la hora en que armó la página (`generadoEn`). Un módulo puro `lib/ultimo-dato-bueno.ts` decide qué mostrar y qué guardar. `PantallaRotativa` lee `localStorage` con `useSyncExternalStore`, aplica la decisión y escribe en un effect.

**Tech Stack:** Next.js 16, React 19 (`useSyncExternalStore`), TypeScript, `node --test`, eslint-plugin-react-hooks 7.1.1.

**Spec:** `docs/superpowers/specs/2026-10-08-ultimo-dato-bueno-design.md`

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `types/index.ts` | Modificar | `EstadoLectura`, `EstadoPantalla` |
| `lib/ultimo-dato-bueno.ts` | Crear | `VIGENCIA_MS`, `claveGuardado`, `leerGuardado`, `resolver` |
| `lib/ultimo-dato-bueno.test.ts` | Crear | Tests |
| `lib/planilla.ts` | Modificar | `leerListas`, `leerOfertas` con `{ datos, ok }` |
| `lib/planilla.test.ts` | Modificar | Tests de `ok` |
| `lib/sheets.ts` | Modificar | `Lectura<T>`, estados, `generadoEn` |
| `app/api/[tenant]/*/route.ts` | Modificar | Usar `.datos` |
| `components/HealthIndicator.tsx` | Modificar | Estado ámbar |
| `components/PantallaRotativa.tsx` | Modificar | Integración + reload 10 min |
| `app/page.tsx`, `app/[tenant]/page.tsx`, `vistaCartel`, `vistaLista` | Modificar | Pasar estado/generadoEn/clave |
| `CHANGELOG.md`, `docs/decisiones.md`, `README.md`, `docs/guion-reunion.md` (+ PDF) | Modificar | Documentación |

---

### Task 1: Tipos + `lib/ultimo-dato-bueno.ts`

**Files:**
- Modify: `types/index.ts` (al final)
- Create: `lib/ultimo-dato-bueno.ts`
- Test: `lib/ultimo-dato-bueno.test.ts`

- [ ] **Step 1: Tipos de estado**

Agregar al final de `types/index.ts`:

```ts
/** Resultado de leer una parte de la planilla. Ver lib/ultimo-dato-bueno.ts. */
export type EstadoLectura = 'ok' | 'error'

export interface EstadoPantalla {
  listas: EstadoLectura
  ofertas: EstadoLectura
  config: EstadoLectura
}
```

- [ ] **Step 2: Tests que fallan**

Crear `lib/ultimo-dato-bueno.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { VIGENCIA_MS, claveGuardado, leerGuardado, resolver } from './ultimo-dato-bueno.ts'

const H = 60 * 60 * 1000
const AHORA = 1_800_000_000_000
const OK = { listas: 'ok', ofertas: 'ok', config: 'ok' } as const

const lista = (titulo: string) => [{ titulo, productos: [{ nombre: 'X', precio: '1', unidad: 'KG' }] }]
const oferta = (nombre: string) => [
  { nombre, precio: '1', imagen: 'x', estado: 'ACTIVO' as const, tamano: 6, descripcion: '' },
]

const recibido = (over: Partial<Parameters<typeof resolver>[0]> = {}) => ({
  listas: lista('NUEVA'),
  ofertas: oferta('NUEVA'),
  configRemota: { segundosCartel: 5 },
  estado: OK,
  generadoEn: AHORA,
  ...over,
})

const guardado = (en: number) => ({
  listas: { datos: lista('VIEJA'), en },
  ofertas: { datos: oferta('VIEJA'), en },
  config: { datos: { segundosCartel: 9 }, en },
})

test('VIGENCIA_MS son 2 horas', () => {
  assert.equal(VIGENCIA_MS, 2 * H)
})

test('todo ok: muestra lo nuevo y lo guarda con la hora del server', () => {
  const r = resolver(recibido(), {})
  assert.equal(r.mostrar.listas[0].titulo, 'NUEVA')
  assert.equal(r.usandoGuardado, false)
  assert.equal(r.guardar.listas?.en, AHORA)
  assert.equal(r.guardar.ofertas?.datos[0].nombre, 'NUEVA')
  assert.deepEqual(r.guardar.config?.datos, { segundosCartel: 5 })
})

test('error con guardado de menos de 2 h: muestra lo guardado y no lo toca', () => {
  const g = guardado(AHORA - 1 * H)
  const r = resolver(
    recibido({ listas: [], ofertas: [], configRemota: {}, estado: { listas: 'error', ofertas: 'error', config: 'error' } }),
    g,
  )
  assert.equal(r.mostrar.listas[0].titulo, 'VIEJA')
  assert.equal(r.mostrar.ofertas[0].nombre, 'VIEJA')
  assert.deepEqual(r.mostrar.configRemota, { segundosCartel: 9 })
  assert.equal(r.usandoGuardado, true)
  assert.deepEqual(r.guardar, g)
})

test('error con guardado justo en el limite de 2 h: todavia vale', () => {
  const r = resolver(recibido({ listas: [], estado: { ...OK, listas: 'error' } }), guardado(AHORA - VIGENCIA_MS))
  assert.equal(r.mostrar.listas[0].titulo, 'VIEJA')
  // Solo fallaron las listas: igual tiene que prender el ambar.
  assert.equal(r.usandoGuardado, true)
})

test('error con guardado de mas de 2 h: vacio (empty state como hoy)', () => {
  const r = resolver(recibido({ listas: [], estado: { ...OK, listas: 'error' } }), guardado(AHORA - VIGENCIA_MS - 1))
  assert.deepEqual(r.mostrar.listas, [])
  assert.equal(r.usandoGuardado, false)
})

test('error sin guardado: vacio', () => {
  const r = resolver(recibido({ ofertas: [], estado: { ...OK, ofertas: 'error' } }), {})
  assert.deepEqual(r.mostrar.ofertas, [])
  assert.equal(r.usandoGuardado, false)
})

test('falla parcial: listas nuevas y ofertas guardadas', () => {
  const r = resolver(recibido({ ofertas: [], estado: { ...OK, ofertas: 'error' } }), guardado(AHORA - H))
  assert.equal(r.mostrar.listas[0].titulo, 'NUEVA')
  assert.equal(r.mostrar.ofertas[0].nombre, 'VIEJA')
  assert.equal(r.usandoGuardado, true)
  assert.equal(r.guardar.listas?.en, AHORA)
  assert.equal(r.guardar.ofertas?.en, AHORA - H)
})

test('ok despues de una falla reinicia la vigencia', () => {
  const r = resolver(recibido(), guardado(AHORA - 1.9 * H))
  assert.equal(r.mostrar.listas[0].titulo, 'NUEVA')
  assert.equal(r.guardar.listas?.en, AHORA)
  assert.equal(r.usandoGuardado, false)
})

test('pagina vieja del SW (ok, pero generada antes que lo guardado): no pisa y muestra lo mas nuevo', () => {
  const g = guardado(AHORA - 10 * 60 * 1000)
  const r = resolver(recibido({ generadoEn: AHORA - H }), g)
  assert.equal(r.mostrar.listas[0].titulo, 'VIEJA')
  assert.deepEqual(r.guardar, g)
})

test('la edad se mide con la hora del server (generadoEn), no con el reloj de la TV', () => {
  // Pagina armada 1 h despues de lo guardado: vigente sin importar el reloj de la TV.
  const r = resolver(recibido({ listas: [], estado: { ...OK, listas: 'error' }, generadoEn: AHORA + H }), guardado(AHORA))
  assert.equal(r.mostrar.listas[0].titulo, 'VIEJA')
})

test('claveGuardado: estable ante el orden de rubros; null = todo', () => {
  assert.equal(claveGuardado('el-latigo', new Set(['pollo', 'cerdo'])), claveGuardado('el-latigo', new Set(['cerdo', 'pollo'])))
  assert.equal(claveGuardado('el-latigo', new Set(['cerdo', 'pollo'])), 'ultimo-dato-bueno:el-latigo:cerdo,pollo')
  assert.equal(claveGuardado('demo', null), 'ultimo-dato-bueno:demo:*')
})

test('leerGuardado: null, JSON roto o no-objeto devuelven {}', () => {
  assert.deepEqual(leerGuardado(null), {})
  assert.deepEqual(leerGuardado('{roto'), {})
  assert.deepEqual(leerGuardado('42'), {})
  assert.deepEqual(leerGuardado('{"listas":{"datos":[],"en":1}}'), { listas: { datos: [], en: 1 } })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `node --test lib/ultimo-dato-bueno.test.ts`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` de `./ultimo-dato-bueno.ts`.

- [ ] **Step 4: Implementar `lib/ultimo-dato-bueno.ts`**

```ts
import type { ConfigNegocio, EstadoLectura, EstadoPantalla, ListaPrecios, Oferta } from '@/types'

/*
 * Ultimo dato bueno: si Google Sheets falla, cada TV sigue mostrando lo
 * ultimo que recibio bien, hasta VIGENCIA_MS. Se guarda en el localStorage
 * de la TV (PantallaRotativa); este modulo solo decide, sin tocar storage
 * ni reloj (todo entra por parametro) para poder testearlo.
 * Ver docs/superpowers/specs/2026-10-08-ultimo-dato-bueno-design.md.
 */

export const VIGENCIA_MS = 2 * 60 * 60 * 1000

const PREFIJO = 'ultimo-dato-bueno'

export interface Copia<T> {
  datos: T
  /** Hora (ms) en que el server armo la pagina de la que salio el dato. */
  en: number
}

export interface Guardado {
  listas?: Copia<ListaPrecios[]>
  ofertas?: Copia<Oferta[]>
  config?: Copia<ConfigNegocio>
}

export interface Recibido {
  listas: ListaPrecios[]
  ofertas: Oferta[]
  configRemota: ConfigNegocio
  estado: EstadoPantalla
  generadoEn: number
}

export interface Resuelto {
  mostrar: { listas: ListaPrecios[]; ofertas: Oferta[]; configRemota: ConfigNegocio }
  guardar: Guardado
  /** true si alguna parte se muestra desde lo guardado (punto ambar). */
  usandoGuardado: boolean
}

/* Una clave por TV: tenant + rubros normalizados y ordenados. */
export function claveGuardado(slug: string, rubros: Set<string> | null): string {
  const sufijo = rubros ? [...rubros].sort().join(',') : '*'
  return `${PREFIJO}:${slug}:${sufijo}`
}

/* Parseo tolerante de lo que haya en localStorage. Cualquier cosa rara = nada guardado. */
export function leerGuardado(raw: string | null): Guardado {
  if (!raw) return {}
  try {
    const valor: unknown = JSON.parse(raw)
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Guardado) : {}
  } catch {
    return {}
  }
}

interface ParteResuelta<T> {
  mostrar: T
  guardar?: Copia<T>
  usandoGuardado: boolean
}

function resolverParte<T>(
  estado: EstadoLectura,
  recibido: T,
  vacio: T,
  generadoEn: number,
  guardado: Copia<T> | undefined,
): ParteResuelta<T> {
  const guardadoVigente = guardado && generadoEn - guardado.en <= VIGENCIA_MS ? guardado : undefined

  if (estado === 'ok') {
    // Pagina vieja servida por el SW sin red: lo guardado es mas nuevo.
    if (guardadoVigente && guardadoVigente.en > generadoEn) {
      return { mostrar: guardadoVigente.datos, guardar: guardadoVigente, usandoGuardado: true }
    }
    return { mostrar: recibido, guardar: { datos: recibido, en: generadoEn }, usandoGuardado: false }
  }

  if (guardadoVigente) {
    return { mostrar: guardadoVigente.datos, guardar: guardadoVigente, usandoGuardado: true }
  }
  return { mostrar: vacio, guardar: guardado, usandoGuardado: false }
}

/*
 * Todas las edades se miden con la hora del SERVER: `generadoEn` de esta
 * pagina contra el `en` guardado (tambien hora del server). No se usa el
 * reloj de la TV, que puede estar corrido.
 */
export function resolver(recibido: Recibido, guardado: Guardado): Resuelto {
  const { estado, generadoEn } = recibido
  const listas = resolverParte<ListaPrecios[]>(estado.listas, recibido.listas, [], generadoEn, guardado.listas)
  const ofertas = resolverParte<Oferta[]>(estado.ofertas, recibido.ofertas, [], generadoEn, guardado.ofertas)
  const config = resolverParte<ConfigNegocio>(estado.config, recibido.configRemota, {}, generadoEn, guardado.config)

  const guardar: Guardado = {}
  if (listas.guardar) guardar.listas = listas.guardar
  if (ofertas.guardar) guardar.ofertas = ofertas.guardar
  if (config.guardar) guardar.config = config.guardar

  return {
    mostrar: { listas: listas.mostrar, ofertas: ofertas.mostrar, configRemota: config.mostrar },
    guardar,
    usandoGuardado: listas.usandoGuardado || ofertas.usandoGuardado || config.usandoGuardado,
  }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `node --test lib/ultimo-dato-bueno.test.ts`
Expected: PASS, 12 tests. Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 6: Checkpoint** — sin commit.

---

### Task 2: `lib/planilla.ts` — `leerListas` / `leerOfertas`

**Files:**
- Modify: `lib/planilla.ts`
- Test: `lib/planilla.test.ts`

- [ ] **Step 1: Tests que fallan**

En `lib/planilla.test.ts`, cambiar el import de la línea 4 a:

```ts
import { leerListas, leerOfertas, parsearConfig, parsearListas, parsearOfertas } from './planilla.ts'
```

Y agregar al final:

```ts
test('leerListas: ok=false si no hay fila de encabezados, ok=true si la hay (aunque este vacia)', () => {
  assert.deepEqual(leerListas('hola,chau\n1,2'), { datos: [], ok: false })
  assert.deepEqual(leerListas(''), { datos: [], ok: false })
  assert.deepEqual(leerListas('LISTA,,\nNombre,Precio,Unidad'), { datos: [], ok: true })
  assert.equal(leerListas(LISTAS).ok, true)
})

test('leerOfertas: ok=false sin encabezados; ok=true con todo INACTIVO', () => {
  assert.deepEqual(leerOfertas('a,b,c\n1,2,3'), { datos: [], ok: false })
  const todoInactivo = ['titulo,precio,slug imagen,estado', 'FALDA,20999,falda,INACTIVO'].join('\n')
  assert.deepEqual(leerOfertas(todoInactivo), { datos: [], ok: true })
  assert.equal(leerOfertas(OFERTAS).ok, true)
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test lib/planilla.test.ts`
Expected: FAIL, `does not provide an export named 'leerListas'`.

- [ ] **Step 3: Implementar**

En `lib/planilla.ts`:

3a. Reemplazar la línea `export function parsearListas(text: string): ListaPrecios[] {` (y su comentario `/** Listas de precios desde el CSV de la pestaña principal. */` arriba) por:

```ts
/*
 * Listas de precios desde el CSV de la pestaña principal. `ok: false` solo
 * si el CSV no tiene ninguna fila de encabezados (Nombre|Precio|Unidad):
 * planilla rota o desacomodada. Una planilla bien armada sin productos es
 * `ok: true` con `datos: []`. Ver lib/ultimo-dato-bueno.ts.
 */
export function leerListas(text: string): { datos: ListaPrecios[]; ok: boolean } {
```

3b. Dentro de esa función, reemplazar:

```ts
    console.error('No se encontró ninguna fila de encabezados en el CSV de productos')
    return []
```

por:

```ts
    console.error('No se encontró ninguna fila de encabezados en el CSV de productos')
    return { datos: [], ok: false }
```

3c. Y su última línea `  return listas.filter((l) => l.productos.length > 0)` por:

```ts
  return { datos: listas.filter((l) => l.productos.length > 0), ok: true }
}

/** Listas de precios (solo los datos). Ver leerListas. */
export function parsearListas(text: string): ListaPrecios[] {
  return leerListas(text).datos
```

(El `}` que cerraba la función original ahora cierra `parsearListas`.)

3d. Reemplazar `/** Ofertas ACTIVAS desde el CSV de la pestaña de ofertas. */` y la línea `export function parsearOfertas(text: string): Oferta[] {` por:

```ts
/*
 * Ofertas ACTIVAS desde el CSV de la pestaña de ofertas. `ok: false` solo
 * si no se encontro la fila de encabezados (titulo|precio|slug imagen|estado).
 */
export function leerOfertas(text: string): { datos: Oferta[]; ok: boolean } {
```

3e. Dentro, reemplazar:

```ts
    console.error('No se encontró la fila de encabezados en el CSV de ofertas')
    return []
```

por:

```ts
    console.error('No se encontró la fila de encabezados en el CSV de ofertas')
    return { datos: [], ok: false }
```

3f. Reemplazar el final:

```ts
  return rows
    .slice(headerRowIndex + 1)
    .flatMap((columns) => mapRowToOfertas(columns, headers))
    .filter((o) => o.estado === 'ACTIVO')
}
```

por:

```ts
  const datos = rows
    .slice(headerRowIndex + 1)
    .flatMap((columns) => mapRowToOfertas(columns, headers))
    .filter((o) => o.estado === 'ACTIVO')
  return { datos, ok: true }
}

/** Ofertas ACTIVAS (solo los datos). Ver leerOfertas. */
export function parsearOfertas(text: string): Oferta[] {
  return leerOfertas(text).datos
}
```

- [ ] **Step 4: Verificar**

Run: `node --test lib/planilla.test.ts` → PASS, 18 tests.
Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 5: Checkpoint** — sin commit.

---

### Task 3: `lib/sheets.ts` + API routes

**Files:**
- Modify: `lib/sheets.ts` (desde `export async function getListasPrecios` hasta el final del archivo)
- Modify: `app/api/[tenant]/productos/route.ts`, `ofertas/route.ts`, `config/route.ts`

- [ ] **Step 1: Reemplazar los lectores**

En `lib/sheets.ts`, cambiar los imports a:

```ts
import type { ConfigNegocio, EstadoLectura, EstadoPantalla, ListaPrecios, Oferta } from '@/types'
import type { Tenant } from '@/types/tenant'
import { leerListas, leerOfertas, parsearConfig } from '@/lib/planilla'
import { csvUrlDe, envKeyCsv } from '@/lib/tenant-env'
```

Y reemplazar todo desde `export async function getListasPrecios` hasta el final del archivo por:

```ts
/*
 * Resultado de leer una parte de la planilla. `error` = fetch fallido,
 * respuesta no-2xx, falta de configuracion (env/gid) o CSV sin encabezados.
 * `ok` con datos vacios = planilla bien armada pero vacia (decision del
 * comercio). La TV usa el estado para decidir si muestra lo guardado
 * (lib/ultimo-dato-bueno.ts).
 */
export interface Lectura<T> {
  datos: T
  estado: EstadoLectura
}

export async function getListasPrecios(tenant: Tenant): Promise<Lectura<ListaPrecios[]>> {
  const csvUrl = csvUrlDe(tenant.slug)

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return { datos: [], estado: 'error' }
  }

  try {
    const res = await fetch(urlSinCache(csvUrl), FETCH_SIN_CACHE)

    if (!res.ok) {
      console.error('Error fetching CSV:', res.status, res.statusText)
      return { datos: [], estado: 'error' }
    }

    const { datos, ok } = leerListas(await res.text())
    return { datos, estado: ok ? 'ok' : 'error' }
  } catch (error) {
    console.error('Error en getListasPrecios:', error)
    return { datos: [], estado: 'error' }
  }
}

export async function getConfig(tenant: Tenant): Promise<Lectura<ConfigNegocio>> {
  const csvUrl = csvUrlDe(tenant.slug)
  const gidConfig = tenant.sheets.gidConfig

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return { datos: {}, estado: 'error' }
  }
  // Pestaña de configuracion opcional: sin gid no es una falla.
  if (!gidConfig) {
    return { datos: {}, estado: 'ok' }
  }

  const configUrl = urlConGid(csvUrl, gidConfig)

  try {
    const res = await fetch(urlSinCache(configUrl), FETCH_SIN_CACHE)
    if (!res.ok) {
      console.error('Error fetching CSV de configuracion:', res.status)
      return { datos: {}, estado: 'error' }
    }
    return { datos: parsearConfig(await res.text()), estado: 'ok' }
  } catch (error) {
    console.error('Error en getConfig:', error)
    return { datos: {}, estado: 'error' }
  }
}

export async function getPantallaData(tenant: Tenant): Promise<{
  listas: ListaPrecios[]
  ofertas: Oferta[]
  configRemota: ConfigNegocio
  estado: EstadoPantalla
  /** Date.now() del server al armar la pagina (vigencia del ultimo dato bueno). */
  generadoEn: number
}> {
  const [listas, ofertas, config] = await Promise.all([
    getListasPrecios(tenant),
    getOfertas(tenant),
    getConfig(tenant),
  ])
  return {
    listas: listas.datos,
    ofertas: ofertas.datos,
    configRemota: config.datos,
    estado: { listas: listas.estado, ofertas: ofertas.estado, config: config.estado },
    generadoEn: Date.now(),
  }
}

export async function getOfertas(tenant: Tenant): Promise<Lectura<Oferta[]>> {
  const csvUrl = csvUrlDe(tenant.slug)
  const gidOfertas = tenant.sheets.gidOfertas

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return { datos: [], estado: 'error' }
  }
  if (!gidOfertas) {
    console.error(`Tenant ${tenant.slug} sin sheets.gidOfertas`)
    return { datos: [], estado: 'error' }
  }

  const ofertasUrl = urlConGid(csvUrl, gidOfertas)

  try {
    const res = await fetch(urlSinCache(ofertasUrl), FETCH_SIN_CACHE)
    if (!res.ok) {
      console.error('Error fetching CSV de ofertas:', res.status)
      return { datos: [], estado: 'error' }
    }
    const { datos, ok } = leerOfertas(await res.text())
    return { datos, estado: ok ? 'ok' : 'error' }
  } catch (error) {
    console.error('Error en getOfertas:', error)
    return { datos: [], estado: 'error' }
  }
}
```

- [ ] **Step 2: API routes (contrato JSON igual)**

`app/api/[tenant]/productos/route.ts`: cambiar `const listas = await getListasPrecios(tenant)` por `const { datos: listas } = await getListasPrecios(tenant)`.

`app/api/[tenant]/ofertas/route.ts`: cambiar `const ofertas = await getOfertas(tenant)` por `const { datos: ofertas } = await getOfertas(tenant)`.

`app/api/[tenant]/config/route.ts`: cambiar `const config = await getConfig(tenant)` por `const { datos: config } = await getConfig(tenant)`.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: solo errores en las 4 páginas / `PantallaRotativa` si los hubiera por props nuevos (se resuelven en Task 5-6); en `lib/` y `app/api/` ninguno. Si tsc no marca nada, mejor.

- [ ] **Step 4: Checkpoint** — sin commit.

---

### Task 4: `HealthIndicator` — estado ámbar

**Files:**
- Modify: `components/HealthIndicator.tsx`

- [ ] **Step 1: Implementar**

1a. Cambiar los tipos y tablas de colores/títulos:

```ts
type EstadoSalud = 'inicial' | 'online' | 'offline' | 'guardado'

const COLORES: Record<EstadoSalud, string> = {
  inicial: '#9ca3af', // gris
  online: '#22c55e',  // verde
  offline: '#ef4444', // rojo
  guardado: '#f59e0b', // ambar: mostrando el ultimo dato bueno (Google fallo)
}

const TITULOS: Record<EstadoSalud, string> = {
  inicial: 'Estado: cargando',
  online: 'Estado: conectado',
  offline: 'Estado: sin conexion',
  guardado: 'Estado: mostrando datos guardados',
}
```

1b. Agregar en el comentario de cabecera, en la lista de estados, la línea:
`ambar    — online, pero mostrando el ultimo dato bueno (Google fallo)`.

1c. Reemplazar el componente:

```tsx
// `memo` evita re-ejecutar este componente en cada tick de la rotacion de
// PantallaRotativa; su estado de red sigue actualizandose via los listeners
// de useSyncExternalStore. Prioridad: rojo (offline) > ambar > verde.
function HealthIndicator({ usandoGuardado = false }: { usandoGuardado?: boolean }) {
  const red = useSyncExternalStore(
    suscribirEventosRed,
    obtenerEstadoCliente,
    obtenerEstadoServidor,
  )
  const estado: EstadoSalud = red === 'online' && usandoGuardado ? 'guardado' : red
```

(el `return (...)` sigue igual; `obtenerEstadoCliente` sigue devolviendo solo `'online' | 'offline'`).

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` → sin errores en `HealthIndicator.tsx`.

- [ ] **Step 3: Checkpoint** — sin commit.

---

### Task 5: `PantallaRotativa` — integración + reload 10 min

**Files:**
- Modify: `components/PantallaRotativa.tsx`

- [ ] **Step 1: Imports**

Reemplazar la línea 3 por:

```ts
import { useEffect, useMemo, useReducer, useSyncExternalStore, type CSSProperties } from 'react'
```

Y agregar después de `import { estadoInicialRotacion, rotationReducer } from '@/lib/rotacion'`:

```ts
import { leerGuardado, resolver } from '@/lib/ultimo-dato-bueno'
```

Y cambiar `import type { ConfigNegocio, ListaPrecios, Oferta } from '@/types'` por:

```ts
import type { ConfigNegocio, EstadoPantalla, ListaPrecios, Oferta } from '@/types'
```

- [ ] **Step 2: Reload 10 min**

Reemplazar el párrafo del comentario que empieza en `* 5 min (sesion 23; antes 30 min, y 1h hasta sesion 11): un precio` hasta `* pantalla, 3 fetch a Google cada uno.` (inclusive) por:

```ts
 * 10 min (sesion 24; 5 min en sesion 23, 30 min antes y 1h hasta sesion
 * 11): la mitad de pedidos a Google que con 5 min (~145 reloads/dia por
 * pantalla, 3 fetch cada uno), que es la dependencia sin limite publicado.
 * Un precio corregido llega a la TV en ~15 min como maximo (4-5 de
 * publicacion de Google + hasta 10 de espera). No se baja de ~5: cada
 * reload reinicia la rotacion, y una vuelta completa en El Ancla dura
 * ~3,5 min. Si Google falla, la TV muestra el ultimo dato bueno
 * (lib/ultimo-dato-bueno.ts) y reintenta en cada reload.
```

(La frase siguiente, `Como esto corre en el main thread, no es recovery...`, queda.)

Y la constante: `const RELOAD_INTERVAL_MS = 10 * 60 * 1000`.

Y el comentario `// Reload completo periodico (cada RELOAD_INTERVAL_MS = 5 min).` → `= 10 min`.

- [ ] **Step 3: Props**

En `interface PantallaRotativaProps`, después de `configRemota: ConfigNegocio`, agregar:

```ts
  /** Estado de lectura de cada parte (lib/sheets.ts -> getPantallaData). */
  estado: EstadoPantalla
  /** Date.now() del server al armar la pagina. */
  generadoEn: number
  /** Clave de localStorage de esta TV (claveGuardado(slug, rubros)). */
  claveGuardado: string
```

- [ ] **Step 4: Helpers de storage (arriba del componente)**

Agregar antes de `export default function PantallaRotativa`:

```ts
/*
 * localStorage via useSyncExternalStore: en SSR (y durante la hidratacion)
 * no hay nada guardado (null); en el cliente se lee el string crudo. Un
 * string es comparable por valor, asi que no hay loop de re-render. Sin
 * suscripcion: solo esta TV escribe su clave. try/catch: si el storage esta
 * bloqueado o falla, la pantalla sigue como si no hubiera nada guardado.
 */
function sinSuscripcion(): () => void {
  return () => {}
}

function leerStorage(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave)
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Firma y resolución**

Reemplazar la desestructuración de props:

```tsx
export default function PantallaRotativa({
  tenant,
  listas: listasRecibidas,
  ofertas: ofertasRecibidas,
  configRemota: configRecibida,
  estado,
  generadoEn,
  claveGuardado,
  modoFijo,
  indiceFijo = 0,
}: PantallaRotativaProps) {
  // Ultimo dato bueno: si alguna parte llego con `error`, se muestra lo
  // guardado en esta TV (hasta 2 h). Ver lib/ultimo-dato-bueno.ts.
  // `undefined` = todavia no se leyo (SSR y render de hidratacion);
  // `null` = se leyo y no hay nada guardado. La distincion importa para la
  // escritura: ver el effect de abajo.
  const crudo = useSyncExternalStore<string | null | undefined>(
    sinSuscripcion,
    () => leerStorage(claveGuardado),
    () => undefined,
  )
  const { mostrar, guardar, usandoGuardado } = useMemo(
    () =>
      resolver(
        { listas: listasRecibidas, ofertas: ofertasRecibidas, configRemota: configRecibida, estado, generadoEn },
        leerGuardado(crudo ?? null),
      ),
    [listasRecibidas, ofertasRecibidas, configRecibida, estado, generadoEn, crudo],
  )
  const { listas, ofertas, configRemota } = mostrar

  // Escritura del ultimo dato bueno. Effect sin setState (solo storage).
  // No se escribe mientras `crudo` es `undefined`: en el render de
  // hidratacion todavia no se leyo lo guardado, y `guardar` saldria sin las
  // copias de las partes con error -> borraria el ultimo dato bueno justo
  // cuando hace falta.
  const guardarJson = JSON.stringify(guardar)
  useEffect(() => {
    if (crudo === undefined || guardarJson === crudo) return
    try {
      window.localStorage.setItem(claveGuardado, guardarJson)
    } catch {
      // Storage lleno o bloqueado: seguimos sin guardar.
    }
  }, [claveGuardado, guardarJson, crudo])
```

(El resto del cuerpo —`useReducer`, rotación, `screenVars`, render— sigue usando `listas`, `ofertas` y `configRemota`, que ahora son los resueltos.)

No se usa el reloj de la TV (ni `Date.now()` en el render): `resolver` mide todo con `generadoEn`.

- [ ] **Step 6: HealthIndicator**

Cambiar `<HealthIndicator />` por `<HealthIndicator usandoGuardado={usandoGuardado} />`.

- [ ] **Step 7: Checkpoint** — sin commit (tsc se valida en Task 6, cuando las páginas pasen los props nuevos).

---

### Task 6: Páginas

**Files:**
- Modify: `app/page.tsx`, `app/[tenant]/page.tsx`, `app/[tenant]/vistaCartel/page.tsx`, `app/[tenant]/vistaLista/page.tsx`

En las 4, el patrón es el mismo.

- [ ] **Step 1: Imports**

Cambiar `import { filtrarPorRubro, parseRubrosParam } from '@/lib/rubros'` por:

```ts
import { filtrarPorRubro, parseRubrosParam } from '@/lib/rubros'
import { claveGuardado } from '@/lib/ultimo-dato-bueno'
```

- [ ] **Step 2: Datos y props**

Reemplazar:

```tsx
  const { listas, ofertas, configRemota } = filtrarPorRubro(
    await getPantallaData(tenant),
    parseRubrosParam(rubro),
  )
```

por:

```tsx
  const rubros = parseRubrosParam(rubro)
  const { listas, ofertas, configRemota, estado, generadoEn } = filtrarPorRubro(
    await getPantallaData(tenant),
    rubros,
  )
```

Y en el `<PantallaRotativa ...>` agregar, después de `configRemota={configRemota}`:

```tsx
      estado={estado}
      generadoEn={generadoEn}
      claveGuardado={claveGuardado(tenant.slug, rubros)}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm run lint` → sin errores.
Run: `npm test` → PASS, 76 tests (62 + 12 + 2).
Run: `npm run build` → OK.

- [ ] **Step 4: Checkpoint** — sin commit.

---

### Task 7: Documentación

**Files:**
- Modify: `CHANGELOG.md`, `docs/decisiones.md`, `README.md`, `docs/guion-reunion.md`, `docs/guion-reunion.pdf` (regenerado)

- [ ] **Step 1: `CHANGELOG.md`** — insertar debajo de `## [Unreleased]`:

```markdown
### Sesión 24 — 2026-10-08 (último dato bueno + reload 10 min)

**Context**: preparar escala (~20 clientes / ~40 TVs). Una falla de Google
Sheets dejaba todas las TVs en "Estamos actualizando" a la vez. Spec:
`docs/superpowers/specs/2026-10-08-ultimo-dato-bueno-design.md`. Plan:
`docs/superpowers/plans/2026-10-08-ultimo-dato-bueno.md`.

**Added**
- **Último dato bueno por TV** (`lib/ultimo-dato-bueno.ts` + tests): si una
  parte (listas, ofertas, config) falla, la TV muestra lo último que recibió
  bien, hasta 2 horas, guardado en su `localStorage` por tenant + rubros.
  Cada respuesta buena actualiza la copia y reinicia las 2 horas.
- `lib/sheets.ts` informa `ok`/`error` por parte y `generadoEn`. Error =
  fetch fallido, no-2xx, falta de configuración o CSV sin encabezados
  (columna desacomodada). Planilla vacía pero bien armada = `ok`.
- `leerListas` / `leerOfertas` en `lib/planilla.ts` (+ tests de `ok`).
- Punto de estado **ámbar** = mostrando datos guardados.

**Changed**
- Reload de la pantalla **5 → 10 min**: la mitad de pedidos a Google. Precio
  corregido llega en ~15 min como máximo.
- La API pública no cambia su JSON.
```

- [ ] **Step 2: `docs/decisiones.md`** — agregar al final:

```markdown
## Sesión 24 — Último dato bueno, acotado a 2 horas

La sesión 19 descartó el fallback en `localStorage` ("mostrar un precio
viejo es peor que no mostrar nada"). Con varios comercios, una falla de
Google deja todas las TVs vacías a la vez. Se reabre acotado: cada TV
muestra su último dato bueno **hasta 2 horas**; pasado eso, vuelve al empty
state de siempre. Guardado en la TV (no en el servidor) para no sumar
servicios. Detalle en `docs/superpowers/specs/2026-10-08-ultimo-dato-bueno-design.md`.
```

- [ ] **Step 3: `README.md`**

- `reload preventivo cada 5 minutos que trae precios frescos` → `reload preventivo cada 10 minutos que trae precios frescos`.
- Reemplazar el párrafo que empieza en `**Trade-off aceptado y documentado:** sin ISR no hay última-versión-buena.` (hasta `mostrar un precio viejo es peor que no mostrar nada.`) por:

```markdown
**Si Google falla:** el servidor informa qué parte falló y cada TV muestra
su **último dato bueno, hasta 2 horas**, guardado en el navegador de la
propia TV (punto de estado ámbar mientras tanto). Pasadas las 2 horas sin
respuesta, vuelve al empty state. Acota la decisión original de sesión 19
("mostrar un precio viejo es peor que no mostrar nada"). Ver
`docs/decisiones.md`.
```

- `sus pantallas recargan dentro de los 5 minutos.` → `dentro de los 10 minutos.`

- [ ] **Step 4: Guion (md + PDF)**

En `docs/guion-reunion.md`: `(puede tardar hasta unos 10 minutos)` → `(puede tardar hasta unos 15 minutos)` y `"Unos minutos, hasta 10 como mucho.` → `"Unos minutos, hasta 15 como mucho.`. Aplicar las mismas dos sustituciones en el script del PDF del scratchpad (`guion_pdf.py`) y regenerar `docs/guion-reunion.pdf` con `python guion_pdf.py`.

- [ ] **Step 5: Checkpoint** — sin commit.

---

### Task 8: Validación

- [ ] **Step 1: Estáticos**

`npx tsc --noEmit` ✓ · `npm run lint` ✓ · `npm test` → 76/76 ✓ · `npm run build` ✓.

- [ ] **Step 2: Sin falla, idéntico a producción**

`npx next start -p 3131`. Comparar `/api/<slug>/productos|ofertas|config` de `granja-elancla`, `demo`, `el-latigo` contra `https://tv-precios.vercel.app` (iguales: el contrato no cambió). `/el-latigo?rubro=vacuno` carga normal, punto verde.

- [ ] **Step 3: Simular falla de Google**

1. Con el server bueno, abrir `http://localhost:3131/demo?rubro=cerdo,pollo` en el navegador (guarda el último dato bueno). Verificar en consola: `localStorage.getItem('ultimo-dato-bueno:demo:cerdo,pollo')` no es null.
2. Parar el server y arrancarlo con la planilla del demo rota:
   `TENANT_DEMO_CSV_URL=https://docs.google.com/spreadsheets/d/e/INVALIDO/pub?output=csv npx next start -p 3131`
   (la variable de proceso tiene prioridad sobre `.env.local`).
3. Recargar la misma URL: se ven las listas y ofertas guardadas, punto **ámbar** (`title` = "Estado: mostrando datos guardados").
4. En otra clave sin guardado (`/demo?rubro=vacuno`, nunca abierta): empty state como hoy.
5. Volver a arrancar con la URL buena: punto verde y datos frescos.

- [ ] **Step 4: Avisar "listo para commitear"** — sin `git add`.
