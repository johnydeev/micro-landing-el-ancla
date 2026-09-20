import type { Tenant } from '@/types/tenant'
// Extension .ts explicita: tenants/registro.test.ts importa este modulo con
// `node --test` (sin bundler), y Node ESM exige la extension. tsconfig tiene
// allowImportingTsExtensions; Turbopack la resuelve igual.
import { granjaElAncla } from './granja-elancla.ts'

/*
 * Registro de comercios. Alta de un cliente:
 *   1. tenants/<slug>.ts
 *   2. una linea aca
 *   3. TENANT_<SLUG>_CSV_URL en Vercel
 *   4. logo en Cloudinary como logos/<slug>
 * Ver README "Alta de un cliente".
 */
export const TENANTS: Record<string, Tenant> = {
  'granja-elancla': granjaElAncla,
}

export function getTenant(slug: string): Tenant | undefined {
  return TENANTS[slug]
}
