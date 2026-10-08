import type { ConfigNegocio, ListaPrecios, Oferta } from '@/types'
import { normalizarPlantilla } from './plantillas.ts'
import { esHeaderRubro, normalizarRubro, quitarAcentos } from './rubros.ts'

/*
 * Interpretacion de la planilla del comercio: recibe el TEXTO de un CSV
 * publicado de Google Sheets y devuelve listas, ofertas o configuracion.
 * No hace fetch ni depende de Next: lib/sheets.ts baja los CSV y llama a
 * estas funciones. Separado para poder testearlo con `node --test` (por
 * eso los imports de runtime son relativos con extension .ts).
 */

function parseCsvRows(text: string): string[][] {
  const sanitizedText = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  const pushField = () => {
    currentRow.push(currentField)
    currentField = ''
  }

  const pushRow = () => {
    if (currentRow.some((field) => field.trim() !== '')) {
      rows.push(currentRow)
    }
    currentRow = []
  }

  for (let index = 0; index < sanitizedText.length; index += 1) {
    const char = sanitizedText[index]

    if (inQuotes) {
      if (char === '"') {
        if (sanitizedText[index + 1] === '"') {
          currentField += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        currentField += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      pushField()
      continue
    }

    if (char === '\r') {
      continue
    }

    if (char === '\n') {
      pushField()
      pushRow()
      continue
    }

    currentField += char
  }

  if (currentField !== '' || currentRow.length > 0) {
    pushField()
    pushRow()
  }

  return rows
}

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

function findProductosTableOffsets(headerRow: string[]): number[] {
  const offsets: number[] = []

  for (let i = 0; i <= headerRow.length - 3; i += 1) {
    const slice = headerRow.slice(i, i + 3).map((column) => (column ?? '').trim().toLowerCase())
    if (
      slice[0] === 'nombre' &&
      slice[1] === 'precio' &&
      slice[2] === 'unidad'
    ) {
      offsets.push(i)
    }
  }

  return offsets
}

/*
 * Palabras clave aceptadas para la columna OPCIONAL de tamano de imagen
 * (5ta columna del bloque de ofertas). El header se normaliza sin acentos
 * y en minusculas, y alcanza con que CONTENGA alguna de estas palabras —
 * no exige coincidencia exacta. Esto cubre tanto "Tamaño" (la normalizacion
 * ya convierte la ñ a n, ver quitarAcentos) como anotaciones que un cliente
 * no tecnico agrega de mas, ej. "Tamaño (1-5)" o "Tamaño:".
 */
const TAMANO_OFERTA_KEYWORDS = ['tamano', 'escala', 'size']

function esHeaderTamano(headerNormalizado: string): boolean {
  return TAMANO_OFERTA_KEYWORDS.some((keyword) => headerNormalizado.includes(keyword))
}

// Escala 1-10. Default 6 (= 91% con el mapeo de sesion 14, rango 55-120%).
// Valores fuera de [1,10] caen al default. Ver el mapeo a porcentajes en
// components/PantallaRotativa.tsx -> TAMANO_OFERTA_A_ESCALA.
const TAMANO_OFERTA_DEFAULT = 6
const TAMANO_OFERTA_MIN = 1
const TAMANO_OFERTA_MAX = 10

/*
 * Palabras clave aceptadas para la columna OPCIONAL de aclaracion/condicion
 * de la oferta (ej. "Solo efectivo", "Valido de lunes a viernes"). No es
 * una descripcion del producto: es una condicion corta que se muestra en un
 * badge debajo de "SUPER OFERTA". Misma logica de deteccion tolerante que
 * TAMANO_OFERTA_KEYWORDS: basta con que el header CONTENGA alguna palabra.
 */
const DESCRIPCION_OFERTA_KEYWORDS = ['descripcion', 'aclaracion', 'condicion', 'detalle', 'nota']

function esHeaderDescripcion(headerNormalizado: string): boolean {
  return DESCRIPCION_OFERTA_KEYWORDS.some((keyword) => headerNormalizado.includes(keyword))
}

/*
 * Palabras clave de la columna OPCIONAL "plantilla": que diseno de cartel
 * usa esta oferta. Misma deteccion tolerante que tamano/descripcion. A
 * diferencia de esas dos, su posicion es libre: se busca en las 4 celdas
 * que siguen a "estado" (hasta el proximo bloque de tabla).
 */
const PLANTILLA_OFERTA_KEYWORDS = ['plantilla', 'diseno', 'template']

function esHeaderPlantilla(headerNormalizado: string): boolean {
  return PLANTILLA_OFERTA_KEYWORDS.some((keyword) => headerNormalizado.includes(keyword))
}

interface OfertasTableHeader {
  offset: number
  /** true si la 5ta columna (offset+4) es un header de tamano. */
  tieneTamano: boolean
  /**
   * true si hay un header de descripcion/aclaracion. Su posicion depende de
   * si tieneTamano: offset+5 si tamano esta presente, offset+4 si no (para
   * seguir soportando el caso en que el cliente no cargo la columna tamano).
   */
  tieneDescripcion: boolean
  /** Indice absoluto de la columna "plantilla", o null si no esta. */
  offsetPlantilla: number | null
  /** Rubro normalizado del bloque (super-header), o null si no tiene titulo. */
  rubro: string | null
}

function findOfertasTableOffsets(headerRow: string[]): OfertasTableHeader[] {
  const result: OfertasTableHeader[] = []

  for (let i = 0; i <= headerRow.length - 4; i += 1) {
    const slice = headerRow
      .slice(i, i + 4)
      .map((column) => quitarAcentos((column ?? '').trim().toLowerCase()))
    if (
      slice[0] === 'titulo' &&
      slice[1] === 'precio' &&
      slice[2] === 'slug imagen' &&
      slice[3] === 'estado'
    ) {
      // Chequeo opcional de la 5ta columna. Normalizamos sin acentos para
      // aceptar "tamaño", "Tamaño", "tamano", etc. Si la columna no esta
      // (o es un header de otra tabla pegada al costado), tieneTamano=false
      // y las ofertas usan el default.
      const quinta = quitarAcentos((headerRow[i + 4] ?? '').trim().toLowerCase())
      const tieneTamano = esHeaderTamano(quinta)

      // La descripcion va despues de tamano si tamano esta presente, o
      // justo despues de estado si no lo esta.
      const offsetDescripcion = tieneTamano ? i + 5 : i + 4
      const columnaDescripcion = quitarAcentos((headerRow[offsetDescripcion] ?? '').trim().toLowerCase())
      const tieneDescripcion = esHeaderDescripcion(columnaDescripcion)

      // Plantilla: posicion libre entre estado+1 y estado+4, sin pisar un
      // header de otra tabla pegada al costado ("titulo").
      let offsetPlantilla: number | null = null
      for (let c = i + 4; c <= i + 7 && c < headerRow.length; c += 1) {
        const celda = quitarAcentos((headerRow[c] ?? '').trim().toLowerCase())
        if (celda === 'titulo') break
        if (esHeaderPlantilla(celda)) {
          offsetPlantilla = c
          break
        }
      }

      result.push({ offset: i, tieneTamano, tieneDescripcion, offsetPlantilla, rubro: null })
    }
  }

  return result
}

function parseTamanoOferta(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return TAMANO_OFERTA_DEFAULT
  if (parsed < TAMANO_OFERTA_MIN || parsed > TAMANO_OFERTA_MAX) return TAMANO_OFERTA_DEFAULT
  return parsed
}

function mapRowToOfertas(columns: string[], headers: OfertasTableHeader[]): Oferta[] {
  const ofertas: Oferta[] = []

  for (const { offset, tieneTamano, tieneDescripcion, offsetPlantilla, rubro } of headers) {
    const [nombre = '', precio = '', imagen = '', estado = ''] = columns
      .slice(offset, offset + 4)
      .map((column) => (column ?? '').trim())

    if (!nombre || !precio) continue

    const estadoNormalizado = estado.toUpperCase() === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO'

    const tamano = tieneTamano
      ? parseTamanoOferta((columns[offset + 4] ?? '').trim())
      : TAMANO_OFERTA_DEFAULT

    const offsetDescripcion = tieneTamano ? offset + 5 : offset + 4
    const descripcion = tieneDescripcion ? (columns[offsetDescripcion] ?? '').trim() : ''

    const plantillaRaw = offsetPlantilla === null ? '' : (columns[offsetPlantilla] ?? '')
    const plantilla = normalizarPlantilla(plantillaRaw)
    if (process.env.NODE_ENV !== 'production' && plantillaRaw.trim() && !plantilla) {
      console.warn(
        `[ofertas] plantilla "${plantillaRaw}" no existe en el catalogo; ` +
          `"${nombre}" usa la default del tenant.`,
      )
    }

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
  }

  return ofertas
}

/*
 * Listas de precios desde el CSV de la pestaña principal. `ok: false` solo
 * si el CSV no tiene ninguna fila de encabezados (Nombre|Precio|Unidad):
 * planilla rota o desacomodada. Una planilla bien armada sin productos es
 * `ok: true` con `datos: []`. Ver lib/ultimo-dato-bueno.ts.
 */
export function leerListas(text: string): { datos: ListaPrecios[]; ok: boolean } {
  const rows = parseCsvRows(text)

  const headerBlocks: { headerRowIndex: number; offsets: number[] }[] = []
  for (let i = 0; i < rows.length; i += 1) {
    const found = findProductosTableOffsets(rows[i])
    if (found.length > 0) {
      headerBlocks.push({ headerRowIndex: i, offsets: found })
    }
  }

  if (headerBlocks.length === 0) {
    console.error('No se encontró ninguna fila de encabezados en el CSV de productos')
    return { datos: [], ok: false }
  }

  const listas: ListaPrecios[] = []

  for (let b = 0; b < headerBlocks.length; b += 1) {
    const { headerRowIndex, offsets } = headerBlocks[b]
    const superHeaderRow = headerRowIndex > 0 ? rows[headerRowIndex - 1] : []
    const dataEnd =
      b + 1 < headerBlocks.length
        ? headerBlocks[b + 1].headerRowIndex - 1
        : rows.length

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

    listas.push(...blockListas)
  }

  return { datos: listas.filter((l) => l.productos.length > 0), ok: true }
}

/** Listas de precios (solo los datos). Ver leerListas. */
export function parsearListas(text: string): ListaPrecios[] {
  return leerListas(text).datos
}

/*
 * Parsers tipados por clave de ConfigNegocio.
 *
 * `satisfies` garantiza dos invariantes en tiempo de compilacion:
 *   1. Cada clave del tipo ConfigNegocio tiene su parser asociado.
 *   2. El parser devuelve el tipo correcto para esa clave (number o string).
 *
 * Si manana se agrega una clave nueva a ConfigNegocio (ej. `mostrarHorarios?:
 * boolean`) y no se actualiza CONFIG_PARSERS, TS rompe el build aca. Eso
 * elimina el riesgo del `as number` / `as string` que habia antes.
 */
type ConfigParser<K extends keyof ConfigNegocio> = (raw: string) => ConfigNegocio[K] | undefined

const parseNum = (raw: string): number | undefined => {
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

const parseStr = (raw: string): string | undefined => (raw === '' ? undefined : raw)

const CONFIG_PARSERS = {
  segundosCartel: parseNum,
  segundosTabla: parseNum,
  horarios: parseStr,
  whatsapp: parseStr,
  instagram: parseStr,
  // Horas de atenuado se guardan como string ("13" o "13:00") y se validan
  // en el cliente (components/DimOverlay.tsx). parseStr solo descarta vacios.
  atenuarDesde: parseStr,
  atenuarHasta: parseStr,
} satisfies { [K in keyof Required<ConfigNegocio>]: ConfigParser<K> }

const CONFIG_ALIASES: Record<string, keyof ConfigNegocio> = {
  'segundoscartel': 'segundosCartel',
  'segundos cartel': 'segundosCartel',
  'segundos x ofertas': 'segundosCartel',
  'segundos x oferta': 'segundosCartel',
  'frecuencia cartel': 'segundosCartel',
  'frecuencia ofertas': 'segundosCartel',
  'segundostabla': 'segundosTabla',
  'segundos tabla': 'segundosTabla',
  'segundos x listas': 'segundosTabla',
  'segundos x lista': 'segundosTabla',
  'frecuencia tabla': 'segundosTabla',
  'frecuencia tablas': 'segundosTabla',
  'horarios': 'horarios',
  'horario': 'horarios',
  'horarios de atencion': 'horarios',
  'whatsapp': 'whatsapp',
  'telefono': 'whatsapp',
  'instagram': 'instagram',
  'atenuardesde': 'atenuarDesde',
  'atenuar desde': 'atenuarDesde',
  'atenuado desde': 'atenuarDesde',
  'inicio atenuado': 'atenuarDesde',
  'atenuar inicio': 'atenuarDesde',
  'hora atenuado desde': 'atenuarDesde',
  'atenuarhasta': 'atenuarHasta',
  'atenuar hasta': 'atenuarHasta',
  'atenuado hasta': 'atenuarHasta',
  'fin atenuado': 'atenuarHasta',
  'atenuar fin': 'atenuarHasta',
  'hora atenuado hasta': 'atenuarHasta',
}

function normalizarClave(raw: string): keyof ConfigNegocio | null {
  const key = quitarAcentos(raw.trim().toLowerCase())
  return CONFIG_ALIASES[key] ?? null
}

/*
 * Aplica el parser correspondiente y asigna el resultado a `config` con tipo
 * preservado. TS no puede estrechar el generico K en runtime — el cast interno
 * a `never` es el patron estandar para este caso (asignar a una union de
 * setters discriminada por clave). El `satisfies` en CONFIG_PARSERS garantiza
 * que cualquier nueva clave necesita su parser, asi que el cast no oculta
 * agujeros de tipos: solo le hace saber a TS lo que el `satisfies` ya valido.
 */
function asignarConfig<K extends keyof ConfigNegocio>(
  config: ConfigNegocio,
  clave: K,
  valor: string,
): void {
  const parser = CONFIG_PARSERS[clave] as ConfigParser<K>
  const parsed = parser(valor)
  if (parsed === undefined) return
  config[clave] = parsed as ConfigNegocio[K]
}

/** Configuracion del comercio desde el CSV de la pestaña de configuracion (clave, valor). */
export function parsearConfig(text: string): ConfigNegocio {
  const rows = parseCsvRows(text)

  const config: ConfigNegocio = {}
  for (const row of rows) {
    const [rawClave = '', rawValor = ''] = row
    const clave = normalizarClave(rawClave)
    const valor = rawValor.trim()
    if (!clave || !valor) continue
    // El parser conoce el tipo correcto para `clave`; asignamos via helper
    // generico para no perder el estrechamiento que `satisfies` ya garantizo.
    asignarConfig(config, clave, valor)
  }
  return config
}

/*
 * Ofertas ACTIVAS desde el CSV de la pestaña de ofertas. `ok: false` solo
 * si no se encontro la fila de encabezados (titulo|precio|slug imagen|estado).
 */
export function leerOfertas(text: string): { datos: Oferta[]; ok: boolean } {
  const rows = parseCsvRows(text)

  let headers: OfertasTableHeader[] = []
  let headerRowIndex = -1
  for (let i = 0; i < rows.length; i += 1) {
    const found = findOfertasTableOffsets(rows[i])
    if (found.length > 0) {
      headers = found
      headerRowIndex = i
      break
    }
  }

  if (headerRowIndex === -1) {
    console.error('No se encontró la fila de encabezados en el CSV de ofertas')
    return { datos: [], ok: false }
  }

  // El rubro de cada bloque es su super-header (fila de arriba del header).
  const superHeaderRow = headerRowIndex > 0 ? rows[headerRowIndex - 1] : []
  headers = headers.map((header, idx) => ({
    ...header,
    rubro: normalizarRubro(tituloDeBloque(superHeaderRow, header.offset, idx > 0 ? headers[idx - 1].offset : -1)),
  }))

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
