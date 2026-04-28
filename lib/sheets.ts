import 'server-only'

import { Oferta, Producto } from '@/types'

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

function isHeaderRow(columns: string[]): boolean {
  const normalizedColumns = columns.map((column) => column.trim().toLowerCase())

  return (
    normalizedColumns[0] === 'categoria' &&
    normalizedColumns[1] === 'nombre' &&
    normalizedColumns[2] === 'precio'
  )
}

function mapRowToProducto(columns: string[], rowIndex: number): Producto | null {
  if (isHeaderRow(columns)) {
    return null
  }

  if (columns.length < 3) {
    console.warn(`Fila CSV ignorada por tener menos de 3 columnas: ${rowIndex + 1}`)
    return null
  }

  const [categoria = '', nombre = '', precio = '', unidad = ''] = columns.map((column) => column.trim())

  if (!nombre || !precio) {
    console.warn(`Fila CSV ignorada por no tener nombre o precio: ${rowIndex + 1}`)
    return null
  }

  return {
    categoria,
    nombre,
    precio,
    unidad,
  }
}

function mapRowToOferta(columns: string[], rowIndex: number): Oferta | null {
  if (columns.length < 2) {
    console.warn(`Fila CSV de ofertas ignorada por tener menos de 2 columnas: ${rowIndex + 1}`)
    return null
  }

  const [nombre = '', precio = '', unidad = ''] = columns.map((column) => column.trim())

  if (!nombre || !precio) {
    console.warn(`Fila CSV de ofertas ignorada por no tener nombre o precio: ${rowIndex + 1}`)
    return null
  }

  return {
    nombre,
    precio,
    unidad,
  }
}

export async function getProductos(): Promise<Producto[]> {
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
    const productos = rows
      .map((columns, rowIndex) => mapRowToProducto(columns, rowIndex))
      .filter((producto): producto is Producto => producto !== null)

    return productos
  } catch (error) {
    console.error('Error en getProductos:', error)
    return []
  }
}

interface SheetMetadataEntry {
  name?: string
  title?: string
  sheetId?: number | string
  gid?: number | string
}

function extractGidFromMetadata(metadata: unknown, sheetName: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null

  const candidates: SheetMetadataEntry[] = []
  const root = metadata as Record<string, unknown>

  const collect = (value: unknown) => {
    if (!value) return
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          candidates.push(item as SheetMetadataEntry)
        }
      }
    }
  }

  collect(root.sheets)
  collect(root.feed)
  if (root.feed && typeof root.feed === 'object') {
    collect((root.feed as Record<string, unknown>).entry)
  }

  for (const entry of candidates) {
    const name = (entry.name ?? entry.title ?? '') as string | { $t?: string }
    const resolvedName = typeof name === 'string' ? name : name?.$t ?? ''
    if (resolvedName.trim().toLowerCase() === sheetName.toLowerCase()) {
      const gid = entry.gid ?? entry.sheetId
      if (gid !== undefined && gid !== null) return String(gid)
    }
  }

  return null
}

export async function getOfertas(): Promise<Oferta[]> {
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL

  if (!csvUrl) {
    console.error('Falta la variable de entorno GOOGLE_SHEETS_CSV_URL')
    return []
  }

  const match = csvUrl.match(/spreadsheets\/d\/e\/([^/]+)/)
  if (!match) {
    console.error('No se pudo extraer el ID publicado desde GOOGLE_SHEETS_CSV_URL')
    return []
  }

  const publishedId = match[1]
  const metadataUrl = `https://docs.google.com/spreadsheets/d/e/${publishedId}/pub?output=json`

  try {
    const metadataRes = await fetch(metadataUrl, {
      next: { revalidate: 60 },
    })

    if (!metadataRes.ok) {
      console.error('Error fetching metadatos de hojas:', metadataRes.status, metadataRes.statusText)
      return []
    }

    const metadataText = await metadataRes.text()
    let metadata: unknown
    try {
      metadata = JSON.parse(metadataText)
    } catch {
      const jsonMatch = metadataText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.error('No se pudo parsear los metadatos de hojas como JSON')
        return []
      }
      metadata = JSON.parse(jsonMatch[0])
    }

    const gid = extractGidFromMetadata(metadata, 'Ofertas')
    if (!gid) {
      console.error('No se encontró la hoja "Ofertas" en los metadatos')
      return []
    }

    const ofertasUrl = csvUrl.replace(/gid=\d+/, `gid=${gid}`)

    const res = await fetch(ofertasUrl, {
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      console.error('Error fetching CSV de ofertas:', res.status, res.statusText)
      return []
    }

    const text = await res.text()
    const rows = parseCsvRows(text)
    const ofertas = rows
      .map((columns, rowIndex) => mapRowToOferta(columns, rowIndex))
      .filter((oferta): oferta is Oferta => oferta !== null)

    return ofertas
  } catch (error) {
    console.error('Error en getOfertas:', error)
    return []
  }
}
