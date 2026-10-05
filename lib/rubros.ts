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
// con escapes Unicode para no depender del encoding del archivo (los
// caracteres literales son invisibles en muchos editores).
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
