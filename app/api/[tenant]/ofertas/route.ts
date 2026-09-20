import { getOfertas } from '@/lib/sheets'

export async function GET() {
  const ofertas = await getOfertas()
  return Response.json(ofertas)
}
