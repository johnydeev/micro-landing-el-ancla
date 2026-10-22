import 'server-only'

import { randomBytes } from 'node:crypto'

import type { Tele } from '@/lib/activacion'
import { generarCodigo, type CodigoGuardado } from '@/lib/codigo-alta'
import { sha256Hex } from '@/lib/hash'
import { rpc } from '@/lib/supabase-rest'

/* Un codigo repetido es rarisimo (31^6 combinaciones, 15 min de vida): con 3 intentos sobra. */
const INTENTOS = 3

type RespuestaCrear = { ok: true; vence_en: string } | { ok: false; motivo: 'comercio' | 'repetido' }

/*
 * Crea un codigo de alta para el comercio. La base guarda solo sha256(nonce):
 * el nonce viaja una vez a la tele y no se muestra (el codigo se ve en la
 * vidriera; sin el nonce nadie mas puede quedarse con la cookie).
 * - CodigoGuardado: listo.
 * - 'comercio': sin fila o dado de baja.
 * - null: la base fallo (o 3 repetidos seguidos).
 */
export async function crearCodigo(slug: string): Promise<CodigoGuardado | 'comercio' | null> {
  for (let i = 0; i < INTENTOS; i++) {
    const codigo = generarCodigo(randomBytes(6))
    const nonce = randomBytes(32).toString('base64url')
    const r = await rpc<RespuestaCrear>('crear_codigo_alta', {
      p_comercio: slug,
      p_codigo: codigo,
      p_nonce_sha256: sha256Hex(nonce),
    })
    if (!r) return null
    if (r.ok === true) {
      const venceMs = Date.parse(r.vence_en)
      if (Number.isNaN(venceMs)) break
      return { codigo, nonce, venceMs }
    }
    if (r.ok === false && r.motivo === 'comercio') return 'comercio'
    if (r.ok === false && r.motivo === 'repetido') continue
    break
  }
  console.error('[supabase] crear_codigo_alta no pudo crear un codigo')
  return null
}

export type EstadoCodigo =
  | { estado: 'invalido' | 'vencido' | 'pendiente' }
  | { estado: 'activada'; tele: Tele }

/* Estado del codigo para la tele que lo pidio (con su nonce). null = la base fallo o respondio raro. */
export async function consultarCodigo(codigo: string, nonce: string): Promise<EstadoCodigo | null> {
  const r = await rpc<{ estado?: unknown; tele?: { id?: unknown; comercio?: unknown; rubros?: unknown } }>(
    'consultar_codigo_alta',
    { p_codigo: codigo, p_nonce_sha256: sha256Hex(nonce) },
  )
  if (!r) return null
  if (r.estado === 'invalido' || r.estado === 'vencido' || r.estado === 'pendiente') {
    return { estado: r.estado }
  }
  const t = r.tele
  if (
    r.estado === 'activada' &&
    typeof t?.id === 'string' &&
    typeof t.comercio === 'string' &&
    (t.rubros === null || (Array.isArray(t.rubros) && t.rubros.every((x) => typeof x === 'string')))
  ) {
    const rubros = t.rubros as string[] | null
    return {
      estado: 'activada',
      tele: { id: t.id, tenant: t.comercio, rubros: rubros && rubros.length > 0 ? rubros : null },
    }
  }
  console.error('[supabase] respuesta inesperada de consultar_codigo_alta')
  return null
}
