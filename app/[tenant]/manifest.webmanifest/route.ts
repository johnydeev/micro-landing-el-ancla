import { urlIcono } from '@/lib/cloudinary'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

/*
 * Manifest PWA por tenant. Reemplaza al app/manifest.json global (sesion 17):
 * con varios comercios, el nombre, los iconos y el start_url tienen que ser
 * del comercio que instala la PWA en su TV. Los iconos se derivan del logo
 * en Cloudinary con una transformacion, sin archivos en el repo.
 */
export async function GET(_req: Request, { params }: { params: TenantParams }) {
  const tenant = await getTenantOr404(params)

  const manifest = {
    name: `${tenant.nombre} - Precios`,
    short_name: tenant.nombre,
    description: `Pantalla de precios y ofertas de ${tenant.nombre}`,
    start_url: `/${tenant.slug}`,
    scope: `/${tenant.slug}`,
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: tenant.paleta.fondo,
    theme_color: tenant.paleta.primario,
    icons: [
      { src: urlIcono(tenant.logo, 192), sizes: '192x192', type: 'image/png' },
      { src: urlIcono(tenant.logo, 512), sizes: '512x512', type: 'image/png' },
    ],
  }

  return Response.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
