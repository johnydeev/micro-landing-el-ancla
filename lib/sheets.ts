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
    return rows
      .map((columns, i) => mapRowToOferta(columns, i))
      .filter((o): o is Oferta => o !== null)
  } catch (error) {
    console.error('Error en getOfertas:', error)
    return []
  }
}
