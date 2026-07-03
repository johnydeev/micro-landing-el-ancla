import PantallaRotativa from '@/components/PantallaRotativa'
import { getPantallaData } from '@/lib/sheets'

/*
 * Ruta de desarrollo: pantalla fija en modo "cartel", sin rotacion, para
 * iterar sobre el diseno del cartel de oferta sin esperar el timer. No la
 * usa el cliente final. Acepta ?index=N para fijar una oferta puntual
 * (default 0 = la primera oferta activa).
 */
export const revalidate = 60

export default async function VistaCartel({
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
      modoFijo="cartel"
      indiceFijo={index ? Number(index) : 0}
    />
  )
}
