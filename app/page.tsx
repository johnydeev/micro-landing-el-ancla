import PantallaRotativa from '@/components/PantallaRotativa'
import { getConfig, getListasPrecios, getOfertas } from '@/lib/sheets'

// Datos cacheados a nivel de fetch (revalidate: 60 en lib/sheets.ts).
// El cliente dispara router.refresh() periodicamente segun minutosActualizacion.
export const revalidate = 60

export default async function Home() {
  const [listas, ofertas, configRemota] = await Promise.all([
    getListasPrecios(),
    getOfertas(),
    getConfig(),
  ])

  return (
    <PantallaRotativa
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
    />
  )
}
