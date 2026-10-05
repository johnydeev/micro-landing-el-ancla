# Rubro por pantalla Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Regla del proyecto:** NO ejecutar `git add` ni `git commit`. Los commits los hace el usuario. Donde un plan normal diría "commit", acá hay un **checkpoint**: tests verdes y seguir.

**Goal:** Que cada tele de un comercio pueda mostrar solo uno o varios rubros (`?rubro=cerdo`, `?rubro=cerdo,pollo`), filtrando ofertas y productos de las listas de precios.

**Architecture:** Un módulo puro `lib/rubros.ts` (normalizar, leer el query param, filtrar) testeado con `node --test`. `lib/sheets.ts` pasa a leer el rubro de cada producto (columna Categoria) y de cada bloque de ofertas (super-header). Las 4 páginas que arman la pantalla filtran el resultado de `getPantallaData`. El reducer de rotación sale a `lib/rotacion.ts` y aprende a quedarse en modo cartel cuando no hay listas.

**Tech Stack:** Next.js 16 (App Router, `searchParams` como Promise), React 19, TypeScript, `node --test` con type-stripping de Node 25 (sin bundler: los módulos testeados solo pueden usar `import type` con el alias `@/`).

**Spec:** `docs/superpowers/specs/2026-10-05-rubro-por-pantalla-design.md`

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/rubros.ts` | Crear | `quitarAcentos`, `normalizarRubro`, `esHeaderRubro`, `parseRubrosParam`, `filtrarPorRubro` |
| `lib/rubros.test.ts` | Crear | Tests de lo anterior |
| `lib/rotacion.ts` | Crear | `RotationState`, `RotationAction`, `estadoInicialRotacion`, `rotationReducer` |
| `lib/rotacion.test.ts` | Crear | Tests del reducer |
| `types/index.ts` | Modificar | `rubro?: string` en `Producto` y `Oferta` |
| `lib/sheets.ts` | Modificar | Importar `quitarAcentos`; helper `tituloDeBloque`; rubro en productos y ofertas |
| `components/PantallaRotativa.tsx` | Modificar | Usar `lib/rotacion.ts` |
| `app/page.tsx` | Modificar | Leer `?rubro=` y filtrar |
| `app/[tenant]/page.tsx` | Modificar | Ídem |
| `app/[tenant]/vistaCartel/page.tsx` | Modificar | Ídem |
| `app/[tenant]/vistaLista/page.tsx` | Modificar | Ídem |
| `docs/api.md` | Modificar | Documentar campo `rubro` |
| `CHANGELOG.md` | Modificar | Entrada de sesión 23 |

---

### Task 1: `lib/rubros.ts` — normalización y parseo del link

**Files:**
- Create: `lib/rubros.ts`
- Test: `lib/rubros.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/rubros.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { esHeaderRubro, normalizarRubro, parseRubrosParam, quitarAcentos } from './rubros.ts'

test('quitarAcentos saca tildes y deja la letra base', () => {
  assert.equal(quitarAcentos('Categoría'), 'Categoria')
  assert.equal(quitarAcentos('FIAMBRERÍA'), 'FIAMBRERIA')
})

test('normalizarRubro: minusculas, sin acentos, espacios colapsados', () => {
  assert.equal(normalizarRubro('CERDO'), 'cerdo')
  assert.equal(normalizarRubro('  Pollo  '), 'pollo')
  assert.equal(normalizarRubro('Fiambrería'), 'fiambreria')
  assert.equal(normalizarRubro('carne   de  cerdo'), 'carne de cerdo')
})

test('normalizarRubro: RES y VACUNO son el mismo rubro', () => {
  assert.equal(normalizarRubro('RES'), 'vacuno')
  assert.equal(normalizarRubro('res'), 'vacuno')
  assert.equal(normalizarRubro('Vacuno'), 'vacuno')
})

test('normalizarRubro: vacio o solo espacios es null', () => {
  assert.equal(normalizarRubro(''), null)
  assert.equal(normalizarRubro('   '), null)
})

test('esHeaderRubro acepta Categoria y Rubro, con o sin acento', () => {
  assert.equal(esHeaderRubro('Categoria'), true)
  assert.equal(esHeaderRubro(' CATEGORÍA '), true)
  assert.equal(esHeaderRubro('Rubro'), true)
  assert.equal(esHeaderRubro('Nombre'), false)
  assert.equal(esHeaderRubro(''), false)
})

test('parseRubrosParam: sin param o vacio es null (sin filtro)', () => {
  assert.equal(parseRubrosParam(undefined), null)
  assert.equal(parseRubrosParam(''), null)
  assert.equal(parseRubrosParam(','), null)
  assert.equal(parseRubrosParam(' , ,'), null)
})

test('parseRubrosParam: uno, varios con coma y param repetido', () => {
  assert.deepEqual(parseRubrosParam('cerdo'), new Set(['cerdo']))
  assert.deepEqual(parseRubrosParam('Cerdo, POLLO'), new Set(['cerdo', 'pollo']))
  assert.deepEqual(parseRubrosParam(['cerdo', 'pollo']), new Set(['cerdo', 'pollo']))
  assert.deepEqual(parseRubrosParam('res,vacuno'), new Set(['vacuno']))
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test lib/rubros.test.ts`
Expected: FAIL — `Cannot find module` / `ERR_MODULE_NOT_FOUND` para `./rubros.ts`.

- [ ] **Step 3: Implementar**

Crear `lib/rubros.ts`:

```ts
import type { ListaPrecios, Oferta } from '@/types'

/*
 * Rubro por pantalla: una tele puede mostrar solo uno o varios rubros
 * (`/<slug>?rubro=cerdo`, `?rubro=cerdo,pollo`). Sin param, muestra todo.
 *
 * El rubro sale de la planilla: columna "Categoria" (o "Rubro") de cada
 * producto en las listas, y el super-header arriba de cada bloque de
 * ofertas. Ver docs/superpowers/specs/2026-10-05-rubro-por-pantalla-design.md.
 *
 * Modulo sin dependencias de runtime (solo `import type`) para poder
 * testearlo con `node --test`.
 */

// Rango U+0300-U+036F: "Combining Diacritical Marks" (acentos, tildes).
// Tras normalize('NFD') los caracteres acentuados quedan como letra + marca
// combinatoria; quitamos las marcas para comparar sin acentos. Se escriben
// con escapes Unicode para no depender del encoding del archivo.
const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

/** Compara textos cargados a mano sin importar acentos ("Tamaño" = "tamano"). */
export function quitarAcentos(raw: string): string {
  return raw.normalize('NFD').replace(COMBINING_DIACRITICS, '')
}

/*
 * Nombres distintos para el mismo rubro. La planilla de El Ancla usa RES;
 * la planilla modelo para clientes nuevos usa VACUNO.
 */
const ALIAS_RUBRO: Record<string, string> = {
  res: 'vacuno',
}

/** Rubro en forma canonica (minusculas, sin acentos, alias aplicado), o null si esta vacio. */
export function normalizarRubro(raw: string): string | null {
  const limpio = quitarAcentos(raw).trim().toLowerCase().replace(/\s+/g, ' ')
  if (!limpio) return null
  return ALIAS_RUBRO[limpio] ?? limpio
}

/** true si el header de una columna de las listas es la columna de rubro. */
export function esHeaderRubro(raw: string): boolean {
  const header = quitarAcentos(raw).trim().toLowerCase()
  return header === 'categoria' || header === 'rubro'
}

/*
 * Lee `?rubro=` del link. Acepta varios separados por coma y el param
 * repetido (`?rubro=cerdo&rubro=pollo` llega como array). Sin rubros
 * validos devuelve null = sin filtro.
 */
export function parseRubrosParam(raw: string | string[] | undefined): Set<string> | null {
  if (raw === undefined) return null
  const valores = (Array.isArray(raw) ? raw : [raw]).flatMap((valor) => valor.split(','))
  const rubros = new Set<string>()
  for (const valor of valores) {
    const rubro = normalizarRubro(valor)
    if (rubro) rubros.add(rubro)
  }
  return rubros.size > 0 ? rubros : null
}
```

(`ListaPrecios`/`Oferta` se usan en la Task 2; el `import type` se borra en runtime, así que no rompe el test.)

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test lib/rubros.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Checkpoint** — tests verdes, sin commit.

---

### Task 2: Tipos + `filtrarPorRubro`

**Files:**
- Modify: `types/index.ts` (interfaces `Producto` y `Oferta`)
- Modify: `lib/rubros.ts`
- Test: `lib/rubros.test.ts`

- [ ] **Step 1: Agregar `rubro` a los tipos**

En `types/index.ts`, reemplazar la interfaz `Producto`:

```ts
export interface Producto {
  nombre: string
  precio: string
  unidad: string
  /**
   * Rubro normalizado (ej. "vacuno", "cerdo") desde la columna
   * "Categoria"/"Rubro" de la lista. undefined si la lista no tiene esa
   * columna o la celda esta vacia. Ver lib/rubros.ts.
   */
  rubro?: string
}
```

Y en la interfaz `Oferta`, agregar al final (después de `plantilla?: PlantillaCartelId`):

```ts
  /**
   * Rubro normalizado del bloque de ofertas, tomado del super-header
   * arriba del bloque (ej. "RES" -> "vacuno"). undefined si el bloque no
   * tiene titulo. Ver lib/rubros.ts.
   */
  rubro?: string
```

- [ ] **Step 2: Escribir los tests que fallan**

Agregar al final de `lib/rubros.test.ts` (y sumar `filtrarPorRubro` al import de la línea 4: `import { esHeaderRubro, filtrarPorRubro, normalizarRubro, parseRubrosParam, quitarAcentos } from './rubros.ts'`):

```ts
const oferta = (nombre: string, rubro?: string) => ({
  nombre,
  precio: '1000',
  imagen: 'x',
  estado: 'ACTIVO' as const,
  tamano: 6,
  descripcion: '',
  ...(rubro ? { rubro } : {}),
})

const data = {
  listas: [
    {
      titulo: 'PARRILLEROS',
      productos: [
        { nombre: 'ASADO', precio: '1', unidad: 'KG', rubro: 'vacuno' },
        { nombre: 'CHORIZO', precio: '2', unidad: 'KG', rubro: 'cerdo' },
      ],
    },
    { titulo: 'POLLO', productos: [{ nombre: 'SUPREMA', precio: '3', unidad: 'KG', rubro: 'pollo' }] },
    { titulo: 'SIN RUBRO', productos: [{ nombre: 'HUEVOS', precio: '4', unidad: 'MAPLE' }] },
  ],
  ofertas: [oferta('FALDA', 'vacuno'), oferta('COSTILLITAS', 'cerdo'), oferta('SUELTA')],
  configRemota: { segundosCartel: 5 },
}

test('filtrarPorRubro: sin filtro devuelve los mismos datos', () => {
  assert.equal(filtrarPorRubro(data, null), data)
})

test('filtrarPorRubro: lista mixta conserva solo los productos del rubro', () => {
  const r = filtrarPorRubro(data, new Set(['cerdo']))
  assert.deepEqual(
    r.listas.map((l) => [l.titulo, l.productos.map((p) => p.nombre)]),
    [['PARRILLEROS', ['CHORIZO']]],
  )
  assert.deepEqual(r.ofertas.map((o) => o.nombre), ['COSTILLITAS'])
})

test('filtrarPorRubro: listas sin coincidencias se descartan y lo sin rubro no pasa', () => {
  const r = filtrarPorRubro(data, new Set(['pollo']))
  assert.deepEqual(r.listas.map((l) => l.titulo), ['POLLO'])
  assert.deepEqual(r.ofertas, [])
})

test('filtrarPorRubro: union de dos rubros y resto de campos intacto', () => {
  const r = filtrarPorRubro(data, new Set(['vacuno', 'pollo']))
  assert.deepEqual(r.listas.map((l) => l.titulo), ['PARRILLEROS', 'POLLO'])
  assert.deepEqual(r.listas[0].productos.map((p) => p.nombre), ['ASADO'])
  assert.deepEqual(r.ofertas.map((o) => o.nombre), ['FALDA'])
  assert.deepEqual(r.configRemota, { segundosCartel: 5 })
})

test('filtrarPorRubro: rubro inexistente deja todo vacio', () => {
  const r = filtrarPorRubro(data, new Set(['cerdp']))
  assert.deepEqual(r.listas, [])
  assert.deepEqual(r.ofertas, [])
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `node --test lib/rubros.test.ts`
Expected: FAIL — `filtrarPorRubro` no exportado (`SyntaxError: The requested module './rubros.ts' does not provide an export named 'filtrarPorRubro'`).

- [ ] **Step 4: Implementar**

Agregar al final de `lib/rubros.ts`:

```ts
/*
 * Filtra listas y ofertas por rubro. Con `rubros === null` devuelve los
 * datos tal cual (pantalla "todo"). Con filtro: cada lista conserva solo
 * sus productos del rubro y se descarta si queda vacia; las ofertas pasan
 * si su rubro esta en el set. Lo que no tiene rubro no pasa ningun filtro.
 * El resto de los campos de `data` (ej. configRemota) se conserva.
 */
export function filtrarPorRubro<T extends { listas: ListaPrecios[]; ofertas: Oferta[] }>(
  data: T,
  rubros: Set<string> | null,
): T {
  if (!rubros) return data

  const listas = data.listas
    .map((lista) => ({
      ...lista,
      productos: lista.productos.filter((p) => p.rubro !== undefined && rubros.has(p.rubro)),
    }))
    .filter((lista) => lista.productos.length > 0)

  const ofertas = data.ofertas.filter((o) => o.rubro !== undefined && rubros.has(o.rubro))

  return { ...data, listas, ofertas }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `node --test lib/rubros.test.ts`
Expected: PASS, 12 tests.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Checkpoint** — tests verdes, sin commit.

---

### Task 3: `lib/sheets.ts` — leer el rubro de la planilla

**Files:**
- Modify: `lib/sheets.ts`

`lib/sheets.ts` es `server-only` y no tiene tests directos; la lógica nueva testeable ya está en `lib/rubros.ts`. Esta task se verifica con `tsc` y en la Task 7 contra la planilla real.

- [ ] **Step 1: Usar `quitarAcentos` de `lib/rubros.ts`**

En `lib/sheets.ts`, cambiar el bloque de imports del inicio a:

```ts
import 'server-only'

import { ConfigNegocio, ListaPrecios, Oferta } from '@/types'
import type { Tenant } from '@/types/tenant'
import { normalizarPlantilla } from '@/lib/plantillas'
import { esHeaderRubro, normalizarRubro, quitarAcentos } from '@/lib/rubros'
import { csvUrlDe, envKeyCsv } from '@/lib/tenant-env'
```

Y borrar de `lib/sheets.ts` el bloque completo que va desde el comentario `// Rango U+0300-U+036F: "Combining Diacritical Marks"` hasta el cierre de `function quitarAcentos(...) { ... }` (la constante `COMBINING_DIACRITICS`, el comentario `// Usado para comparar headers del CSV...` y la función). Las llamadas existentes a `quitarAcentos` siguen funcionando con el import.

- [ ] **Step 2: Extraer `tituloDeBloque`**

Agregar en `lib/sheets.ts`, justo antes de `function findProductosTableOffsets`:

```ts
/*
 * Titulo de un bloque (lista de precios o columna de ofertas) en la fila
 * de super-headers: la primera celda no vacia yendo hacia la izquierda
 * desde `offset` hasta el bloque anterior (`prevOffset`, exclusivo). Cubre
 * celdas combinadas, cuyo valor queda en la celda de mas a la izquierda.
 */
function tituloDeBloque(superHeaderRow: string[], offset: number, prevOffset: number): string {
  for (let c = offset; c > prevOffset; c -= 1) {
    const val = (superHeaderRow[c] ?? '').trim()
    if (val) return val
  }
  return ''
}
```

- [ ] **Step 3: Rubro de los productos en `getListasPrecios`**

En `getListasPrecios`, reemplazar desde `const blockListas: ListaPrecios[] = offsets.map((offset, idx) => {` hasta el cierre del `for (let r = headerRowIndex + 1; ...)` por:

```ts
      const headerRow = rows[headerRowIndex]
      // Columna de rubro: la inmediatamente a la izquierda de "Nombre",
      // si su header es "Categoria" o "Rubro".
      const conRubro = offsets.map((offset) => offset > 0 && esHeaderRubro(headerRow[offset - 1] ?? ''))

      const blockListas: ListaPrecios[] = offsets.map((offset, idx) => {
        const prevOffset = idx > 0 ? offsets[idx - 1] : -1
        const titulo = tituloDeBloque(superHeaderRow, offset, prevOffset)
        return {
          titulo: titulo || `Lista ${listas.length + idx + 1}`,
          productos: [],
        }
      })

      for (let r = headerRowIndex + 1; r < dataEnd; r += 1) {
        const dataRow = rows[r]
        offsets.forEach((offset, listaIdx) => {
          const [nombre = '', precio = '', unidad = ''] = dataRow
            .slice(offset, offset + 3)
            .map((column) => (column ?? '').trim())
          if (!nombre || !precio) return
          const rubro = conRubro[listaIdx] ? normalizarRubro(dataRow[offset - 1] ?? '') : null
          blockListas[listaIdx].productos.push({ nombre, precio, unidad, ...(rubro ? { rubro } : {}) })
        })
      }
```

- [ ] **Step 4: Rubro de las ofertas**

4a. En la interfaz `OfertasTableHeader`, agregar al final:

```ts
  /** Rubro normalizado del bloque (super-header), o null si no tiene titulo. */
  rubro: string | null
```

4b. En `findOfertasTableOffsets`, cambiar el push a:

```ts
      result.push({ offset: i, tieneTamano, tieneDescripcion, offsetPlantilla, rubro: null })
```

4c. En `mapRowToOfertas`, cambiar la desestructuración del `for` a:

```ts
  for (const { offset, tieneTamano, tieneDescripcion, offsetPlantilla, rubro } of headers) {
```

y el push final a:

```ts
    ofertas.push({
      nombre,
      precio,
      imagen,
      estado: estadoNormalizado,
      tamano,
      descripcion,
      plantilla,
      ...(rubro ? { rubro } : {}),
    })
```

4d. En `getOfertas`, justo después del bloque `if (headerRowIndex === -1) { ... }` y antes del `return rows`, agregar:

```ts
    // El rubro de cada bloque es su super-header (fila de arriba del header).
    const superHeaderRow = headerRowIndex > 0 ? rows[headerRowIndex - 1] : []
    headers = headers.map((header, idx) => ({
      ...header,
      rubro: normalizarRubro(tituloDeBloque(superHeaderRow, header.offset, idx > 0 ? headers[idx - 1].offset : -1)),
    }))
```

- [ ] **Step 5: Verificar tipos y tests existentes**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: PASS, todos los tests (los 27 previos + 12 de rubros = 39).

- [ ] **Step 6: Checkpoint** — sin commit.

---

### Task 4: `lib/rotacion.ts` — modo solo-cartel cuando no hay listas

**Files:**
- Create: `lib/rotacion.ts`
- Test: `lib/rotacion.test.ts`
- Modify: `components/PantallaRotativa.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/rotacion.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { estadoInicialRotacion, rotationReducer, type RotationState } from './rotacion.ts'

const tick = (listasCount: number, ofertasCount: number) => ({ type: 'tick' as const, listasCount, ofertasCount })

function recorrer(inicial: RotationState, listas: number, ofertas: number, pasos: number): string[] {
  const vistos: string[] = []
  let s = inicial
  for (let i = 0; i < pasos; i += 1) {
    vistos.push(s.modo === 'tabla' ? `T${s.listaIndex}` : `C${s.cartelIndex}`)
    s = rotationReducer(s, tick(listas, ofertas))
  }
  return vistos
}

test('estado inicial: tabla si hay listas, cartel si solo hay ofertas', () => {
  assert.equal(estadoInicialRotacion(2, 3).modo, 'tabla')
  assert.equal(estadoInicialRotacion(2, 0).modo, 'tabla')
  assert.equal(estadoInicialRotacion(0, 3).modo, 'cartel')
  assert.equal(estadoInicialRotacion(0, 0).modo, 'tabla')
})

test('listas y ofertas: recorre todas las listas, todos los carteles y vuelve (comportamiento actual)', () => {
  assert.deepEqual(recorrer(estadoInicialRotacion(2, 2), 2, 2, 6), ['T0', 'T1', 'C0', 'C1', 'T0', 'T1'])
})

test('solo listas: rota entre listas', () => {
  assert.deepEqual(recorrer(estadoInicialRotacion(3, 0), 3, 0, 5), ['T0', 'T1', 'T2', 'T0', 'T1'])
})

test('solo ofertas: nunca pasa a tabla', () => {
  assert.deepEqual(recorrer(estadoInicialRotacion(0, 3), 0, 3, 7), ['C0', 'C1', 'C2', 'C0', 'C1', 'C2', 'C0'])
})

test('solo ofertas: si el estado venia en tabla, salta a cartel', () => {
  const s = rotationReducer({ modo: 'tabla', listaIndex: 0, cartelIndex: 0 }, tick(0, 2))
  assert.deepEqual(s, { modo: 'cartel', listaIndex: 0, cartelIndex: 0 })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test lib/rotacion.test.ts`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` para `./rotacion.ts`.

- [ ] **Step 3: Implementar `lib/rotacion.ts`**

```ts
/*
 * Estado de la rotacion entre tabla de precios y cartel de oferta,
 * manejado con useReducer para tener una sola transicion atomica por
 * tick. Antes usabamos 3 useState separados (modo, listaIndex,
 * cartelIndex) y las transiciones entre modos requerian llamar a un
 * setter dentro del updater de otro setter — anti-patron de React que
 * puede causar dispatches duplicados o estados inconsistentes
 * acumulativos. El reducer resuelve todo en una sola actualizacion.
 *
 * Vive fuera de components/PantallaRotativa.tsx para poder testearlo con
 * `node --test`.
 */
export type RotationState = {
  modo: 'tabla' | 'cartel'
  listaIndex: number
  cartelIndex: number
}

export type RotationAction = {
  type: 'tick'
  listasCount: number
  ofertasCount: number
}

/*
 * Una pantalla filtrada por rubro puede tener ofertas y ninguna lista. En
 * ese caso arranca y se queda en modo cartel: si pasara por tabla
 * mostraria el empty state ("Estamos actualizando...") entre ofertas.
 */
function soloCarteles(listasCount: number, ofertasCount: number): boolean {
  return listasCount === 0 && ofertasCount > 0
}

export function estadoInicialRotacion(listasCount: number, ofertasCount: number): RotationState {
  return {
    modo: soloCarteles(listasCount, ofertasCount) ? 'cartel' : 'tabla',
    listaIndex: 0,
    cartelIndex: 0,
  }
}

export function rotationReducer(state: RotationState, action: RotationAction): RotationState {
  const { listasCount, ofertasCount } = action

  if (soloCarteles(listasCount, ofertasCount)) {
    const siguiente =
      state.modo === 'cartel' && state.cartelIndex < ofertasCount - 1 ? state.cartelIndex + 1 : 0
    return { modo: 'cartel', listaIndex: 0, cartelIndex: siguiente }
  }

  if (state.modo === 'tabla') {
    if (state.listaIndex < listasCount - 1) {
      return { ...state, listaIndex: state.listaIndex + 1 }
    }
    if (ofertasCount > 0) {
      return { modo: 'cartel', listaIndex: 0, cartelIndex: 0 }
    }
    return { ...state, listaIndex: 0 }
  }

  // modo === 'cartel'
  if (state.cartelIndex < ofertasCount - 1) {
    return { ...state, cartelIndex: state.cartelIndex + 1 }
  }
  return { modo: 'tabla', listaIndex: 0, cartelIndex: 0 }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test lib/rotacion.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Usarlo en `PantallaRotativa.tsx`**

5a. Agregar al bloque de imports (después de `import { CATALOGO_CARTELES } from '@/templates'`):

```ts
import { estadoInicialRotacion, rotationReducer } from '@/lib/rotacion'
```

5b. Borrar de `components/PantallaRotativa.tsx` todo el bloque desde el comentario `/* * Estado de la rotacion entre tabla de precios y cartel de oferta,` hasta el cierre de `const ROTATION_INITIAL: RotationState = { ... }` inclusive (comentario, `type RotationState`, `type RotationAction`, `function rotationReducer` y `ROTATION_INITIAL`).

5c. Reemplazar la llamada a `useReducer` por:

```tsx
  const [{ modo, listaIndex, cartelIndex }, dispatchRotation] = useReducer(
    rotationReducer,
    undefined,
    () =>
      modoFijo
        ? {
            modo: modoFijo,
            listaIndex: modoFijo === 'tabla' ? indiceFijo : 0,
            cartelIndex: modoFijo === 'cartel' ? indiceFijo : 0,
          }
        : estadoInicialRotacion(listas.length, ofertas.length),
  )
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: PASS (27 previos + 12 rubros + 5 rotación = 44).

- [ ] **Step 7: Checkpoint** — sin commit.

---

### Task 5: Páginas — leer `?rubro=` y filtrar

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/[tenant]/page.tsx`
- Modify: `app/[tenant]/vistaCartel/page.tsx`
- Modify: `app/[tenant]/vistaLista/page.tsx`

En Next 16 `searchParams` de una page es una `Promise` (ver `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`). Las 4 páginas ya son `force-dynamic`.

- [ ] **Step 1: `app/[tenant]/page.tsx`**

Reemplazar el archivo completo por:

```tsx
import PantallaRotativa from '@/components/PantallaRotativa'
import { filtrarPorRubro, parseRubrosParam } from '@/lib/rubros'
import { getPantallaData } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

// Render dinamico en cada request: sin ISR y sin cache de fetch (ver
// FETCH_SIN_CACHE en lib/sheets.ts). Es lo que hace que apretar "actualizar"
// en el Fire TV muestre los precios nuevos en ESE reload. Ver
// docs/decisiones.md (sesion 19).
export const dynamic = 'force-dynamic'

export default async function PantallaTenant({
  params,
  searchParams,
}: {
  params: TenantParams
  searchParams: Promise<{ rubro?: string | string[] }>
}) {
  const tenant = await getTenantOr404(params)
  const { rubro } = await searchParams
  const { listas, ofertas, configRemota } = filtrarPorRubro(
    await getPantallaData(tenant),
    parseRubrosParam(rubro),
  )

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
    />
  )
}
```

- [ ] **Step 2: `app/page.tsx`**

Agregar el import `import { filtrarPorRubro, parseRubrosParam } from '@/lib/rubros'` (después del import de `PantallaRotativa`) y reemplazar la función `Home` por:

```tsx
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ rubro?: string | string[] }>
}) {
  const tenant = getDefaultTenantOr404()
  const { rubro } = await searchParams
  const { listas, ofertas, configRemota } = filtrarPorRubro(
    await getPantallaData(tenant),
    parseRubrosParam(rubro),
  )

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
    />
  )
}
```

(El resto del archivo — imports existentes, comentario y `export const dynamic` — queda igual.)

- [ ] **Step 3: `app/[tenant]/vistaCartel/page.tsx`**

Agregar el import `import { filtrarPorRubro, parseRubrosParam } from '@/lib/rubros'` y reemplazar la función `VistaCartel` por:

```tsx
export default async function VistaCartel({
  params,
  searchParams,
}: {
  params: TenantParams
  searchParams: Promise<{ index?: string; rubro?: string | string[] }>
}) {
  const tenant = await getTenantOr404(params)
  const { index, rubro } = await searchParams
  const { listas, ofertas, configRemota } = filtrarPorRubro(
    await getPantallaData(tenant),
    parseRubrosParam(rubro),
  )

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
      modoFijo="cartel"
      indiceFijo={index ? Number(index) : 0}
    />
  )
}
```

Y en el comentario de cabecera, cambiar la línea `* usa el cliente final. Acepta ?index=N para fijar una oferta puntual` por `* usa el cliente final. Acepta ?index=N para fijar una oferta puntual y ?rubro=`
y la siguiente por `* (el index se aplica sobre las ofertas ya filtradas; default 0 = la primera oferta activa).`

- [ ] **Step 4: `app/[tenant]/vistaLista/page.tsx`**

Agregar el import `import { filtrarPorRubro, parseRubrosParam } from '@/lib/rubros'` y reemplazar la función `VistaLista` por:

```tsx
export default async function VistaLista({
  params,
  searchParams,
}: {
  params: TenantParams
  searchParams: Promise<{ index?: string; rubro?: string | string[] }>
}) {
  const tenant = await getTenantOr404(params)
  const { index, rubro } = await searchParams
  const { listas, ofertas, configRemota } = filtrarPorRubro(
    await getPantallaData(tenant),
    parseRubrosParam(rubro),
  )

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
      modoFijo="tabla"
      indiceFijo={index ? Number(index) : 0}
    />
  )
}
```

Si el comentario de cabecera menciona `?index=N`, agregar en esa misma frase "y `?rubro=` (el index se aplica sobre las listas ya filtradas)".

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 6: Checkpoint** — sin commit.

---

### Task 6: Documentación

**Files:**
- Modify: `docs/api.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: `docs/api.md` — productos**

En la sección `GET /api/<tenant>/productos`, cambiar los productos del ejemplo JSON para incluir rubro:

```json
      { "nombre": "Pollo entero", "precio": "3500", "unidad": "kg", "rubro": "pollo" },
      { "nombre": "Pechuga", "precio": "5200", "unidad": "kg", "rubro": "pollo" }
```

```json
      { "nombre": "Bondiola", "precio": "6800", "unidad": "kg", "rubro": "cerdo" }
```

Y agregar a sus **Notas**:

```markdown
- `rubro` sale de la columna `Categoria` (o `Rubro`) ubicada justo a la
  izquierda de `Nombre`. Se normaliza (minúsculas, sin acentos) y `RES`
  se convierte en `vacuno`. Si la lista no tiene esa columna o la celda
  está vacía, la clave **se omite**. La API no filtra por rubro: el
  filtro `?rubro=` es solo de la pantalla (ver
  `docs/superpowers/specs/2026-10-05-rubro-por-pantalla-design.md`).
```

- [ ] **Step 2: `docs/api.md` — ofertas**

En el ejemplo JSON de `GET /api/<tenant>/ofertas`, agregar `"rubro": "vacuno"` después de `"plantilla": "clasico"` (con la coma correspondiente). Y agregar a sus **Notas**:

```markdown
- `rubro` es el título del bloque de ofertas (la celda de arriba del
  header `titulo`, ej. `RES` / `CERDO` / `POLLO`), normalizado igual que
  en productos. Si el bloque no tiene título, la clave **se omite**.
```

- [ ] **Step 3: `CHANGELOG.md`**

Insertar debajo de `## [Unreleased]` (antes de `### Sesión 22`):

```markdown
### Sesión 23 — 2026-10-05 (rubro por pantalla)

**Context**: modelo comercial "abono por pantalla". Para que la segunda y
tercera tele de un local tengan sentido, cada una puede mostrar solo su
rubro. Spec: `docs/superpowers/specs/2026-10-05-rubro-por-pantalla-design.md`.
Plan: `docs/superpowers/plans/2026-10-05-rubro-por-pantalla.md`.

**Added**
- **`?rubro=` en la pantalla** (`/`, `/<slug>`, `vistaCartel`, `vistaLista`):
  `?rubro=cerdo` muestra solo las ofertas del bloque CERDO y los productos
  con Categoria CERDO; `?rubro=cerdo,pollo` une rubros. Sin param, todo como
  antes. RES y VACUNO son el mismo rubro.
- **`lib/rubros.ts`** (+ tests): normalización, parseo del link y filtro.
- **`lib/rotacion.ts`** (+ tests): el reducer de rotación sale de
  `PantallaRotativa.tsx`.
- Campo `rubro` en `/api/<slug>/productos` y `/ofertas` (aditivo).

**Changed**
- Rotación: si no hay listas pero sí ofertas, la pantalla se queda en modo
  cartel en vez de pasar por la tabla vacía.
- `quitarAcentos` se mueve de `lib/sheets.ts` a `lib/rubros.ts`.

**Notas operativas**
- La planilla de El Ancla ya funciona sin cambios. En la del demo, cerdo y
  pollo figuran como GRANJA en Categoria: corregir a CERDO / POLLO. En la
  planilla modelo, renombrar los títulos `RUBRO 1/2/3` de ofertas.
```

- [ ] **Step 4: Checkpoint** — sin commit.

---

### Task 7: Validación completa

- [ ] **Step 1: Chequeos estáticos**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm run lint` → sin errores.
Run: `npm test` → PASS, 44 tests.
Run: `npm run build` → build OK.

- [ ] **Step 2: Contra `npm start`, datos reales**

Levantar el server de producción local (`npm start`, puerto 3000) y verificar con curl, buscando nombres de productos en el HTML (el payload de props viaja en el HTML):

```bash
curl -s "http://localhost:3000/granja-elancla" | grep -c "CUADRIL"
curl -s "http://localhost:3000/granja-elancla?rubro=cerdo" | grep -c "CUADRIL"
curl -s "http://localhost:3000/granja-elancla?rubro=cerdo" | grep -c "COSTILLITAS"
curl -s "http://localhost:3000/granja-elancla?rubro=vacuno" | grep -c "CUADRIL"
curl -s "http://localhost:3000/granja-elancla?rubro=res" | grep -c "CUADRIL"
curl -s "http://localhost:3000/granja-elancla?rubro=cerdo,pollo" | grep -c "SUPREMA"
curl -s "http://localhost:3000/?rubro=pollo" | grep -c "COSTILLITAS"
```

Expected, en orden: `>0`, `0`, `>0`, `>0`, `>0`, `>0`, `0`.

```bash
curl -s "http://localhost:3000/granja-elancla?rubro=cerdp" | grep -c -E "CUADRIL|COSTILLITAS|SUPREMA"
```

Expected: `0` (sin listas ni ofertas → empty state). Ojo: no sirve buscar
"Estamos actualizando" en el HTML, porque `textoSinDatos` viaja como prop
siempre, haya datos o no. Confirmar el empty state a ojo en el navegador.

- [ ] **Step 3: Sin param, idéntico a producción**

Comparar la cantidad de listas y ofertas de `/` y `/granja-elancla` locales contra `https://precios-el-ancla.vercel.app/` (mismas listas y mismas ofertas activas). Revisar `/api/granja-elancla/productos` local: cada producto trae `rubro` (`vacuno`, `cerdo` o `pollo`).

- [ ] **Step 4: Demo**

`/demo?rubro=cerdo`: muestra ofertas de cerdo. Las listas aparecen recién cuando el usuario corrija GRANJA → CERDO / POLLO en la planilla del demo (precondición documentada en el spec). Reportarlo, no es un bug.

- [ ] **Step 5: Avisar "listo para commitear"** — sin `git add`, sin mensaje de commit.
