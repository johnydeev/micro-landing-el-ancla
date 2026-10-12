import PantallaBloqueada from '@/components/PantallaBloqueada'
import PantallaRotativa from '@/components/PantallaRotativa'
import { resolverAcceso } from '@/lib/acceso'
import { filtrarPorRubro } from '@/lib/rubros'
import { claveGuardado } from '@/lib/ultimo-dato-bueno'
import { getPantallaData } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

// Render dinamico en cada request: sin ISR y sin cache de fetch (ver
// FETCH_SIN_CACHE en lib/sheets.ts). Es lo que hace que apretar "actualizar"
// en el Fire TV muestre los precios nuevos en ESE reload. Ver
// docs/decisiones.md (sesion 19).
export const dynamic = 'force-dynamic'

export default async function PantallaTenant({
  params,
  searchParams,
}: {
  params: TenantParams
  searchParams: Promise<{ rubro?: string | string[] }>
}) {
  const tenant = await getTenantOr404(params)
  const { rubro } = await searchParams
  const acceso = await resolverAcceso(tenant, rubro)
  if (acceso.tipo !== 'ok') return <PantallaBloqueada tenant={tenant} motivo={acceso.tipo} />
  const rubros = acceso.rubros
  const { listas, ofertas, configRemota, estado, generadoEn } = filtrarPorRubro(
    await getPantallaData(tenant),
    rubros,
  )

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
      estado={estado}
      generadoEn={generadoEn}
      claveGuardado={claveGuardado(tenant.slug, rubros)}
    />
  )
}
