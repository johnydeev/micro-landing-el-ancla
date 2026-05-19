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

function findOfertasTableOffsets(headerRow: string[]): number[] {
  const offsets: number[] = []

  for (let i = 0; i <= headerRow.length - 4; i += 1) {
    const slice = headerRow.slice(i, i + 4).map((column) => (column ?? '').trim().toLowerCase())
    if (
      slice[0] === 'titulo' &&
      slice[1] === 'precio' &&
      slice[2] === 'slug imagen' &&
      slice[3] === 'estado'
    ) {
      offsets.push(i)
    }
  }

  return offsets
}

function mapRowToOfertas(columns: string[], offsets: number[]): Oferta[] {
  const ofertas: Oferta[] = []

  for (const offset of offsets) {
    const [nombre = '', precio = '', imagen = '', estado = ''] = columns
      .slice(offset, offset + 4)
      .map((column) => (column ?? '').trim())

    if (!nombre || !precio) continue

    const estadoNormalizado = estado.toUpperCase() === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO'

    ofertas.push({ nombre, precio, imagen, estado: estadoNormalizado })
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

const CONFIG_KEYS_NUMERICOS = new Set([
  'segundosCartel',
  'segundosTabla',
  'minutosActualizacion',
])

const CONFIG_ALIASES: Record<string, keyof ConfigNegocio> = {
  'segundoscartel': 'segundosCartel',
  'segundos cartel': 'segundosCartel',
  'frecuencia cartel': 'segundosCartel',
  'frecuencia ofertas': 'segundosCartel',
  'segundostabla': 'segundosTabla',
  'segundos tabla': 'segundosTabla',
  'frecuencia tabla': 'segundosTabla',
  'frecuencia tablas': 'segundosTabla',
  'minutosactualizacion': 'minutosActualizacion',
  'minutos actualizacion': 'minutosActualizacion',
  'minutos de actualizacion': 'minutosActualizacion',
  'horarios': 'horarios',
  'horario': 'horarios',
  'horarios de atencion': 'horarios',
  'whatsapp': 'whatsapp',
  'telefono': 'whatsapp',
  'instagram': 'instagram',
}

function normalizarClave(raw: string): keyof ConfigNegocio | null {
  const key = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return CONFIG_ALIASES[key] ?? null
}

export async function getConfig(): Promise<ConfigNegocio> {
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL
  const gidConfig = process.env.GOOGLE_SHEETS_GID_CONFIG

  if (!csvUrl || !gidConfig) {
    return {}
  }

  const configUrl = csvUrl.replace(/gid=\d+/, `gid=${gidConfig}`)

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
      if (CONFIG_KEYS_NUMERICOS.has(clave)) {
        const num = Number(valor)
        if (!Number.isFinite(num)) continue
        ;(config[clave] as number) = num
      } else {
        ;(config[clave] as string) = valor
      }
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

  const ofertasUrl = csvUrl.replace(/gid=\d+/, `gid=${gidOfertas}`)

  try {
    const res = await fetch(ofertasUrl, { next: { revalidate: 60 } })
    if (!res.ok) {
      console.error('Error fetching CSV de ofertas:', res.status)
      return []
    }
    const text = await res.text()
    const rows = parseCsvRows(text)

    let offsets: number[] = []
    let headerRowIndex = -1
    for (let i = 0; i < rows.length; i += 1) {
      const found = findOfertasTableOffsets(rows[i])
      if (found.length > 0) {
        offsets = found
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
      .flatMap((columns) => mapRowToOfertas(columns, offsets))
      .filter((o) => o.estado === 'ACTIVO')
  } catch (error) {
    console.error('Error en getOfertas:', error)
    return []
  }
}
