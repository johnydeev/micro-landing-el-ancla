import PantallaRotativa from '@/components/PantallaRotativa'
import { getPantallaData } from '@/lib/sheets'

/*
 * Ruta de desarrollo: pantalla fija en modo "tabla", sin rotacion, para
 * iterar sobre el diseno de la lista de precios sin esperar el timer. No la
 * usa el cliente final. Acepta ?index=N para fijar una lista puntual
 * (default 0 = la primera lista, ej. "PRECIOS CHURRASCOS").
 */
export const revalidate = 60

export default async function VistaLista({
  searchParams,
}: {
  searchParams: Promise<{ index?: string }>
}) {
  const { index } = await searchParams
  const { listas, ofertas, configRemota } = await getPantallaData()

  return (
    <PantallaRotativa
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
      modoFijo="tabla"
      indiceFijo={index ? Number(index) : 0}
    />
  )
}
