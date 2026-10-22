import { NextResponse, type NextRequest } from 'next/server'

import { COOKIE_TELE } from '@/lib/acceso'
import { firmarCookie, OPCIONES_COOKIE_TELE } from '@/lib/activacion'
import { consultarCodigo, crearCodigo } from '@/lib/alta-db'
import { normalizarCodigo } from '@/lib/codigo-alta'
import { getTenant } from '@/tenants'

/* 32 bytes en base64url, como lo genera lib/alta-db.ts. */
const NONCE_RE = /^[A-Za-z0-9_-]{43}$/

/* Nada de esto se guarda en caches: el polling lleva el nonce y la respuesta puede traer la cookie. */
function json(cuerpo: unknown, status = 200): NextResponse {
  return NextResponse.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } })
}

/*
 * Alta de una tele por codigo corto (lado de la tele, components/CodigoAlta.tsx).
 * POST { slug } -> { codigo, nonce, venceMs } | 404 slug desconocido | 409
 * comercio sin fila o dado de baja | 503 base caida.
 */
export async function POST(request: NextRequest) {
  let slug: unknown
  try {
    slug = ((await request.json()) as { slug?: unknown })?.slug
  } catch {
    return json({ error: 'body invalido' }, 400)
  }
  if (typeof slug !== 'string' || !getTenant(slug)) return json({ error: 'comercio desconocido' }, 404)

  const r = await crearCodigo(slug)
  if (r === 'comercio') return json({ error: 'comercio no habilitado' }, 409)
  if (!r) return json({ error: 'base no disponible' }, 503)
  return json(r)
}

/*
 * GET ?codigo=…&nonce=… -> { estado: 'pendiente' | 'vencido' | 'invalido' }, o
 * 'activada' poniendo la cookie de la tele (mismo formato y opciones que
 * /activar). 503 si la base falla: la tele reintenta en el proximo ciclo.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const codigo = normalizarCodigo(params.get('codigo') ?? '')
  const nonce = params.get('nonce') ?? ''
  if (!codigo || !NONCE_RE.test(nonce)) return json({ estado: 'invalido' })

  const secreto = process.env.ACTIVACION_SECRET
  if (!secreto) {
    console.error('[activacion] falta ACTIVACION_SECRET: no se puede dar la cookie de alta')
    return json({ error: 'servidor sin configurar' }, 503)
  }

  const r = await consultarCodigo(codigo, nonce)
  if (!r) return json({ error: 'base no disponible' }, 503)
  if (r.estado !== 'activada') return json({ estado: r.estado })
  /* La cookie solo para comercios del registro: un comercio de la base sin tenant no tiene pantalla. */
  if (!getTenant(r.tele.tenant)) {
    console.error('[alta] codigo activado para un comercio sin tenant:', r.tele.tenant)
    return json({ estado: 'invalido' })
  }

  console.log('[alta]', JSON.stringify(r.tele))
  const respuesta = json({ estado: 'activada' })
  respuesta.cookies.set(COOKIE_TELE, firmarCookie(r.tele, secreto), OPCIONES_COOKIE_TELE)
  return respuesta
}
