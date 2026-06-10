import 'server-only'

import { ConfigNegocio, ListaPrecios, Oferta } from '@/types'

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

function urlConGid(baseUrl: string, gid: string): string {
  if (/[?&]gid=\d+/.test(baseUrl)) {
    return baseUrl.replace(/([?&])gid=\d+/, `$1gid=${gid}`)
  }
  const sep = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${sep}gid=${gid}`
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
 * Encabezados aceptados para la columna OPCIONAL de tamano de imagen
 * (5ta columna del bloque de ofertas). Se normalizan sin acentos y en
 * minusculas antes de comparar — el cliente puede cargar "Tamaño",
 * "tamano", "Escala", etc.
 */
const TAMANO_OFERTA_HEADERS = new Set([
  'tamano',
  'tamano imagen',
  'tamano de imagen',
  'escala',
  'escala imagen',
  'size',
])

const TAMANO_OFERTA_DEFAULT = 3
const TAMANO_OFERTA_MIN = 1
const TAMANO_OFERTA_MAX = 5

interface OfertasTableHeader {
  offset: number
  /** true si la 5ta columna (offset+4) es un header de tamano. */
  tieneTamano: boolean
}

function findOfertasTableOffsets(headerRow: string[]): OfertasTableHeader[] {
  const result: OfertasTableHeader[] = []

  for (let i = 0; i <= headerRow.length - 4; i += 1) {
    const slice = headerRow.slice(i, i + 4).map((column) => (column ?? '').trim().toLowerCase())
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
      const quinta = (headerRow[i + 4] ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(COMBINING_DIACRITICS, '')
      const tieneTamano = TAMANO_OFERTA_HEADERS.has(quinta)
      result.push({ offset: i, tieneTamano })
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

  for (const { offset, tieneTamano } of headers) {
    const [nombre = '', precio = '', imagen = '', estado = ''] = columns
      .slice(offset, offset + 4)
      .map((column) => (column ?? '').trim())

    if (!nombre || !precio) continue

    const estadoNormalizado = estado.toUpperCase() === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO'

    const tamano = tieneTamano
      ? parseTamanoOferta((columns[offset + 4] ?? '').trim())
      : TAMANO_OFERTA_DEFAULT

    ofertas.push({ nombre, precio, imagen, estado: estadoNormalizado, tamano })
  }

  return ofertas
}

export async function getListasPrecios(): Promise<ListaPrecios[]> {
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL

  if (!csvUrl) {
    console.error('Falta la variable de entorno GOOGLE_SHEETS_CSV_URL')
    return []
  }

  try {
    const res = await fetch(csvUrl, {
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      console.error('Error fetching CSV:', res.status, res.statusText)
      return []
    }

    const text = await res.text()
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
      return []
    }

    const listas: ListaPrecios[] = []

    for (let b = 0; b < headerBlocks.length; b += 1) {
      const { headerRowIndex, offsets } = headerBlocks[b]
      const superHeaderRow = headerRowIndex > 0 ? rows[headerRowIndex - 1] : []
      const dataEnd =
        b + 1 < headerBlocks.length
          ? headerBlocks[b + 1].headerRowIndex - 1
          : rows.length

      const blockListas: ListaPrecios[] = offsets.map((offset, idx) => {
        const prevOffset = idx > 0 ? offsets[idx - 1] : -1
        let titulo = ''
        for (let c = offset; c > prevOffset; c -= 1) {
          const val = (superHeaderRow[c] ?? '').trim()
          if (val) {
            titulo = val
            break
          }
        }
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
          blockListas[listaIdx].productos.push({ nombre, precio, unidad })
        })
      }

      listas.push(...blockListas)
    }

    return listas.filter((l) => l.productos.length > 0)
  } catch (error) {
    console.error('Error en getListasPrecios:', error)
    return []
  }
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
  minutosActualizacion: parseNum,
  horarios: parseStr,
  whatsapp: parseStr,
  instagram: parseStr,
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
  'minutosactualizacion': 'minutosActualizacion',
  'minutos actualizacion': 'minutosActualizacion',
  'minutos de actualizacion': 'minutosActualizacion',
  'minutos x actualizacion': 'minutosActualizacion',
  'horarios': 'horarios',
  'horario': 'horarios',
  'horarios de atencion': 'horarios',
  'whatsapp': 'whatsapp',
  'telefono': 'whatsapp',
  'instagram': 'instagram',
}

// Rango U+0300-U+036F: "Combining Diacritical Marks" (acentos, tildes).
// Tras normalize('NFD') los caracteres acentuados quedan como letra + marca combinatoria;
// quitamos las marcas para comparar sin acentos. Se escriben con escapes
// Unicode para no depender del encoding del archivo (los caracteres literales
// son invisibles en muchos editores).
const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

function normalizarClave(raw: string): keyof ConfigNegocio | null {
  const key = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
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

export async function getConfig(): Promise<ConfigNegocio> {
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL
  const gidConfig = process.env.GOOGLE_SHEETS_GID_CONFIG

  if (!csvUrl || !gidConfig) {
    return {}
  }

  const configUrl = urlConGid(csvUrl, gidConfig)

  try {
    const res = await fetch(configUrl, { next: { revalidate: 60 } })
    if (!res.ok) {
      console.error('Error fetching CSV de configuracion:', res.status)
      return {}
    }
    const text = await res.text()
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
  } catch (error) {
    console.error('Error en getConfig:', error)
    return {}
  }
}

export async function getOfertas(): Promise<Oferta[]> {
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL
  const gidOfertas = process.env.GOOGLE_SHEETS_GID_OFERTAS

  if (!csvUrl) {
    console.error('Falta GOOGLE_SHEETS_CSV_URL')
    return []
  }
  if (!gidOfertas) {
    console.error('Falta GOOGLE_SHEETS_GID_OFERTAS')
    return []
  }

  const ofertasUrl = urlConGid(csvUrl, gidOfertas)

  try {
    const res = await fetch(ofertasUrl, { next: { revalidate: 60 } })
    if (!res.ok) {
      console.error('Error fetching CSV de ofertas:', res.status)
      return []
    }
    const text = await res.text()
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
      return []
    }

    return rows
      .slice(headerRowIndex + 1)
      .flatMap((columns) => mapRowToOfertas(columns, headers))
      .filter((o) => o.estado === 'ACTIVO')
  } catch (error) {
    console.error('Error en getOfertas:', error)
    return []
  }
}
