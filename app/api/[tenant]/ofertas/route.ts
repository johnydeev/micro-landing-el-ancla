import { getOfertas } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

export async function GET(_req: Request, { params }: { params: TenantParams }) {
  const tenant = await getTenantOr404(params)
  const { datos: ofertas } = await getOfertas(tenant)
  return Response.json(ofertas)
}
