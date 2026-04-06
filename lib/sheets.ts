import { Producto } from '@/types'

export async function getProductos(): Promise<Producto[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY

  if (!sheetId || !apiKey) {
    console.error('Faltan variables de entorno GOOGLE_SHEET_ID o GOOGLE_SHEETS_API_KEY')
    return []
  }

  const range = encodeURIComponent('Productos!A2:F100')
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`

  try {
    const res = await fetch(url, {
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      console.error('Error fetching Google Sheets:', res.status, res.statusText)
      return []
    }

    const data = await res.json()
    const rows: string[][] = data.values || []

    const productos: Producto[] = rows
      .filter((row) => row[5]?.toUpperCase() === 'TRUE')
      .map((row) => ({
        nombre: row[0] || '',
        detalle: row[1] || '',
        precio: row[2] || '',
        unidad: row[3] || '',
        etiqueta: row[4] || '',
        activo: true,
      }))
      .slice(0, 4)

    return productos
  } catch (error) {
    console.error('Error en getProductos:', error)
    return []
  }
}
