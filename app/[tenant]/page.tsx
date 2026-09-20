import PantallaRotativa from '@/components/PantallaRotativa'
import { getPantallaData } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

// Render dinamico en cada request: sin ISR y sin cache de fetch (ver
// FETCH_SIN_CACHE en lib/sheets.ts). Es lo que hace que apretar "actualizar"
// en el Fire TV muestre los precios nuevos en ESE reload. Ver
// docs/decisiones.md (sesion 19).
export const dynamic = 'force-dynamic'

export default async function PantallaTenant({ params }: { params: TenantParams }) {
  const tenant = await getTenantOr404(params)
  const { listas, ofertas, configRemota } = await getPantallaData(tenant)

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
    />
  )
}
