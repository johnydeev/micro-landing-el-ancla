import { NextResponse, type NextRequest } from 'next/server'

import { COOKIE_TELE } from '@/lib/acceso'
import { firmarCookie, OPCIONES_COOKIE_TELE, verificarLink } from '@/lib/activacion'
import { getTenant } from '@/tenants'

/*
 * Link de activacion generado con `npm run activar`. Deja la cookie de la
 * tele y redirige a su pantalla. Ver lib/activacion.ts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ partes: string[] }> },
) {
  const secreto = process.env.ACTIVACION_SECRET
  const { partes } = await params
  const tele = secreto ? verificarLink(partes, Date.now(), secreto) : null

  if (!secreto || !tele || !getTenant(tele.tenant)) {
    return new NextResponse('Link de activacion invalido o vencido. Pedi uno nuevo.', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  console.log('[activacion]', JSON.stringify(tele))
  // La TV de El Ancla apunta a "/", que renderiza DEFAULT_TENANT.
  const destino = tele.tenant === process.env.DEFAULT_TENANT ? '/' : `/${tele.tenant}`
  const respuesta = NextResponse.redirect(new URL(destino, request.url))
  respuesta.cookies.set(COOKIE_TELE, firmarCookie(tele, secreto), OPCIONES_COOKIE_TELE)
  return respuesta
}
