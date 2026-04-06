import { getProductos } from '@/lib/sheets'

export async function GET() {
  const productos = await getProductos()
  return Response.json(productos)
}
