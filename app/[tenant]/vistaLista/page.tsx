import PantallaRotativa from '@/components/PantallaRotativa'
import { filtrarPorRubro, parseRubrosParam } from '@/lib/rubros'
import { getPantallaData } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

/*
 * Ruta de desarrollo: pantalla fija en modo "tabla", sin rotacion, para
 * iterar sobre el diseno de la lista de precios sin esperar el timer. No la
 * usa el cliente final. Acepta ?index=N para fijar una lista puntual
 * (default 0 = la primera lista, ej. "PRECIOS CHURRASCOS") y ?rubro= (el
 * index se aplica sobre las listas ya filtradas).
 */
// Mismo criterio que app/page.tsx: datos frescos en cada request.
export const dynamic = 'force-dynamic'

export default async function VistaLista({
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
      modoFijo="tabla"
      indiceFijo={index ? Number(index) : 0}
    />
  )
}
