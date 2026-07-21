import PantallaRotativa from '@/components/PantallaRotativa'
import { getPantallaData } from '@/lib/sheets'

// Datos cacheados a nivel de fetch (revalidate: 60 en lib/sheets.ts).
// El cliente hace un reload completo cada RELOAD_INTERVAL_MS (ver
// PantallaRotativa.tsx) para volver a ejecutar este Server Component.
export const revalidate = 60

export default async function Home() {
  const { listas, ofertas, configRemota } = await getPantallaData()

  return (
    <PantallaRotativa
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
    />
  )
}
