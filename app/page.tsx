import PantallaRotativa from '@/components/PantallaRotativa'
import { getPantallaData } from '@/lib/sheets'

// Render dinamico en cada request: sin ISR y sin cache de fetch (ver
// FETCH_SIN_CACHE en lib/sheets.ts). Es lo que hace que apretar "actualizar"
// en el Fire TV muestre los precios nuevos en ESE reload.
//
// Con el `revalidate = 60` anterior, el primer request despues de expirar
// devolvia la pagina vieja y recien ahi regeneraba en background
// (stale-while-revalidate) — o sea, el precio corregido aparecia recien en el
// reload siguiente. Ver docs/decisiones.md.
//
// El cliente igual hace un reload completo cada RELOAD_INTERVAL_MS (ver
// PantallaRotativa.tsx) para volver a ejecutar este Server Component.
export const dynamic = 'force-dynamic'

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
