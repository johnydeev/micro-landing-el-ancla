import { getConfig } from '@/lib/sheets'

export async function GET() {
  const config = await getConfig()
  return Response.json(config)
}
