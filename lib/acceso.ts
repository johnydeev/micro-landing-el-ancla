import 'server-only'

import { cookies } from 'next/headers'

import { decidirAcceso, type Acceso } from '@/lib/acceso-decision'
import { COOKIE_TELE, verificarCookie } from '@/lib/activacion'
import { estadoTele } from '@/lib/estado-tele'
import type { Tenant } from '@/types/tenant'

export { type Acceso } from '@/lib/acceso-decision'

export { COOKIE_TELE }

/*
 * Decide si la tele puede mostrar precios y con que rubros. Lo usan todas
 * las pages que renderizan PantallaRotativa.
 *
 * - Cookie valida del comercio = la tele. Se loguea `[tele]`.
 * - Supabase (lib/estado-tele.ts) da el estado del comercio (activacion,
 *   pago) y de la tele (switch, rubros) y anota la conexion.
 * - La decision es pura (lib/acceso-decision.ts).
 * - Falta ACTIVACION_SECRET: falla nuestra, ante la duda se muestra (no se
 *   consulta la base: con `requiere_activacion` bloquearia a todos).
 */
export async function resolverAcceso(
  tenant: Tenant,
  rubroParam: string | string[] | undefined,
): Promise<Acceso> {
  const secreto = process.env.ACTIVACION_SECRET
  const valor = (await cookies()).get(COOKIE_TELE)?.value
  const leida = secreto && valor ? verificarCookie(valor, secreto) : null
  const tele = leida?.tenant === tenant.slug ? leida : null

  if (tele) console.log('[tele]', JSON.stringify(tele))

  if (!secreto) {
    console.error('[activacion] falta ACTIVACION_SECRET: se muestra la pantalla igual')
    return decidirAcceso({ estado: null, tele: null, rubroParam, ahoraMs: Date.now() })
  }

  const estado = await estadoTele(tenant.slug, tele)
  return decidirAcceso({ estado, tele, rubroParam, ahoraMs: Date.now() })
}
