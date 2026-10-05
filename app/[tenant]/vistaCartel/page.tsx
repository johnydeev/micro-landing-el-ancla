import PantallaRotativa from '@/components/PantallaRotativa'
import { filtrarPorRubro, parseRubrosParam } from '@/lib/rubros'
import { getPantallaData } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

/*
 * Ruta de desarrollo: pantalla fija en modo "cartel", sin rotacion, para
 * iterar sobre el diseno del cartel de oferta sin esperar el timer. No la
 * usa el cliente final. Acepta ?index=N para fijar una oferta puntual y ?rubro=
 * (el index se aplica sobre las ofertas ya filtradas; default 0 = la primera oferta activa).
 */
// Mismo criterio que app/page.tsx: datos frescos en cada request.
export const dynamic = 'force-dynamic'

export default async function VistaCartel({
  params,
  searchParams,
}: {
  params: TenantParams
  searchParams: Promise<{ index?: string; rubro?: string | string[] }>
}) {
  const tenant = await getTenantOr404(params)
  const { index, rubro } = await searchParams
  const { listas, ofertas, configRemota } = filtrarPorRubro(
    await getPantallaData(tenant),
    parseRubrosParam(rubro),
  )

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
      modoFijo="cartel"
      indiceFijo={index ? Number(index) : 0}
    />
  )
}
