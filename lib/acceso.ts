import 'server-only'

import { cookies } from 'next/headers'

import { pagoVencido, verificarCookie } from '@/lib/activacion'
import { parseRubrosParam } from '@/lib/rubros'
import type { Tenant } from '@/types/tenant'

export const COOKIE_TELE = 'tele'
/** Dias que la pantalla sigue andando despues de `pagadoHasta`. */
export const DIAS_GRACIA_PAGO = 5

export type Acceso =
  | { tipo: 'ok'; rubros: Set<string> | null }
  | { tipo: 'no-habilitada' }
  | { tipo: 'suspendida' }

/*
 * Decide si la tele puede mostrar precios y con que rubros. Lo usan todas
 * las pages que renderizan PantallaRotativa.
 *
 * - Cookie valida del comercio: el rubro sale de la cookie (el `?rubro=` del
 *   link se ignora) y se loguea `[tele]` = ultima conexion de esa tele en
 *   los logs de Vercel, hasta que exista el panel.
 * - Sin cookie: como antes (rubro del link), salvo `requiereActivacion`.
 * - Falta ACTIVACION_SECRET: falla nuestra, ante la duda se muestra.
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

  if (tenant.pagadoHasta && pagoVencido(tenant.pagadoHasta, Date.now(), DIAS_GRACIA_PAGO)) {
    return { tipo: 'suspendida' }
  }

  if (tenant.requiereActivacion && !tele) {
    if (secreto) return { tipo: 'no-habilitada' }
    console.error('[activacion] falta ACTIVACION_SECRET: se muestra la pantalla igual')
  }

  return { tipo: 'ok', rubros: tele ? (tele.rubros && new Set(tele.rubros)) : parseRubrosParam(rubroParam) }
}
