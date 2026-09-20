import { getListasPrecios } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

export async function GET(_req: Request, { params }: { params: TenantParams }) {
  const tenant = await getTenantOr404(params)
  const listas = await getListasPrecios(tenant)
  return Response.json(listas)
}
