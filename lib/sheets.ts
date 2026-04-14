import { Producto } from '@/types'

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
    const lines = text.split('\n').filter((line) => line.trim() !== '')

    const productos: Producto[] = lines.map((line) => {
      const cols = line.split(',')
      return {
        categoria: cols[0]?.trim() || '',
        nombre: cols[1]?.trim() || '',
        precio: cols[2]?.trim() || '',
        unidad: cols[3]?.trim() || '',
      }
    })

    return productos
  } catch (error) {
    console.error('Error en getProductos:', error)
    return []
  }
}
