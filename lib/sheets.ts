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

const OFERTAS_TABLE_OFFSETS = [0, 6, 12]

function isOfertasColumnHeaderRow(columns: string[]): boolean {
  return OFERTAS_TABLE_OFFSETS.some((offset) => {
    const slice = columns.slice(offset, offset + 4).map((column) => (column ?? '').trim().toLowerCase())
    return (
      slice[0] === 'titulo' &&
      slice[1] === 'precio' &&
      slice[2] === 'slug imagen' &&
      slice[3] === 'estado'
    )
  })
}

function mapRowToOfertas(columns: string[]): Oferta[] {
  const ofertas: Oferta[] = []

  for (const offset of OFERTAS_TABLE_OFFSETS) {
    const [nombre = '', precio = '', imagen = '', estado = ''] = columns
      .slice(offset, offset + 4)
      .map((column) => (column ?? '').trim())

    if (!nombre || !precio) continue

    const estadoNormalizado = estado.toUpperCase() === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO'

    ofertas.push({ nombre, precio, imagen, estado: estadoNormalizado })
  }

  return ofertas
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
    const headerRowIndex = rows.findIndex((columns) => isOfertasColumnHeaderRow(columns))

    if (headerRowIndex === -1) {
      console.error('No se encontró la fila de encabezados en el CSV de ofertas')
      return []
    }

    return rows
      .slice(headerRowIndex + 1)
      .flatMap((columns) => mapRowToOfertas(columns))
      .filter((o) => o.estado === 'ACTIVO')
  } catch (error) {
    console.error('Error en getOfertas:', error)
    return []
  }
}
