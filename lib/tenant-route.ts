import 'server-only'

import { notFound } from 'next/navigation'

import { getTenant } from '@/tenants'
import type { Tenant } from '@/types/tenant'

export type TenantParams = Promise<{ tenant: string }>

/*
 * Resuelve el tenant del segmento [tenant]. Slug desconocido -> 404 de Next.
 * Lo usan layout, pages y route handlers del segmento.
 */
export async function getTenantOr404(params: TenantParams): Promise<Tenant> {
  const { tenant: slug } = await params
  const tenant = getTenant(slug)
  if (!tenant) notFound()
  return tenant
}

/*
 * Tenant por defecto para "/". La TV de El Ancla apunta a "/" y no se
 * puede cambiar sin ir al local, asi que "/" renderiza este tenant (no
 * redirige: un 307 no es cacheable por el Service Worker y la TV perderia
 * el fallback offline). Ver docs/decisiones.md.
 */
export function getDefaultTenantOr404(): Tenant {
  const slug = process.env.DEFAULT_TENANT
  const tenant = slug ? getTenant(slug) : undefined
  if (!tenant) notFound()
  return tenant
}
