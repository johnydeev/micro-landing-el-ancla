import { getListasPrecios } from '@/lib/sheets'

export async function GET() {
  const listas = await getListasPrecios()
  return Response.json(listas)
}
