import PantallaRotativa from '@/components/PantallaRotativa'
import { getPantallaData } from '@/lib/sheets'
import { getDefaultTenantOr404 } from '@/lib/tenant-route'

// "/" renderiza el tenant DEFAULT_TENANT (hoy granja-elancla) porque la TV
// del local apunta a "/" y no se puede cambiar sin ir fisicamente. No es un
// redirect a proposito: ver getDefaultTenantOr404.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const tenant = getDefaultTenantOr404()
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
