import type { Metadata, Viewport } from 'next'

import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

interface Props {
  params: TenantParams
  children: React.ReactNode
}

export async function generateMetadata({ params }: { params: TenantParams }): Promise<Metadata> {
  const tenant = await getTenantOr404(params)
  return {
    title: `${tenant.nombre} - Precios`,
    description: `Pantalla de precios y ofertas de ${tenant.nombre}`,
    manifest: `/${tenant.slug}/manifest.webmanifest`,
  }
}

export async function generateViewport({ params }: { params: TenantParams }): Promise<Viewport> {
  const tenant = await getTenantOr404(params)
  return { themeColor: tenant.paleta.primario }
}

export default async function TenantLayout({ params, children }: Props) {
  // Resolver aca hace que un slug desconocido sea 404 antes de renderizar
  // cualquier page o loading del segmento.
  await getTenantOr404(params)
  return children
}
