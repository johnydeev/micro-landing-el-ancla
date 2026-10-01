import type { Metadata, Viewport } from 'next'

import { urlIcono, urlOg } from '@/lib/cloudinary'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

interface Props {
  params: TenantParams
  children: React.ReactNode
}

export async function generateMetadata({ params }: { params: TenantParams }): Promise<Metadata> {
  const tenant = await getTenantOr404(params)
  const descripcion = `Pantalla de precios y ofertas de ${tenant.nombre}`
  const og = urlOg(tenant.logo)
  const icono = urlIcono(tenant.logo, 192)

  return {
    title: `${tenant.nombre} - Precios`,
    description: descripcion,
    manifest: `/${tenant.slug}/manifest.webmanifest`,
    // Icono y preview POR COMERCIO. Antes vivian en app/icon.png y
    // app/apple-icon.png, que son globales: al compartir el link de un comercio,
    // WhatsApp mostraba el logo de otro. Si el tenant no tiene logo cargado,
    // urlIcono/urlOg devuelven '' y no se emite ninguna etiqueta.
    ...(icono ? { icons: { icon: icono, apple: icono } } : {}),
    ...(og
      ? {
          openGraph: {
            type: 'website',
            title: `${tenant.nombre} - Precios`,
            description: descripcion,
            images: [{ url: og, width: 1200, height: 630, alt: tenant.nombre }],
          },
        }
      : {}),
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
