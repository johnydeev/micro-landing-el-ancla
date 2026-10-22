import { createHmac, timingSafeEqual } from 'node:crypto'

import { normalizarRubro } from './rubros.ts'

/*
 * Activacion de pantallas, version "solo codigo" (sin base de datos).
 *
 * 1. `npm run activar` genera un link firmado y con vencimiento:
 *      /activar/<tenant>/<rubros>/<id>/<vence>/<firma>
 *    Corto a proposito: se tipea con el control remoto del Fire TV.
 * 2. Abrirlo en la tele deja una cookie firmada con { id, tenant, rubros }.
 * 3. Cada carga de la pantalla lee la cookie (lib/acceso.ts). El estado de la
 *    tele (switch, rubros) y del comercio (`requiere_activacion`,
 *    `pagado_hasta`) vive en Supabase, keyed por el `id` de la cookie: ver
 *    lib/estado-tele.ts y lib/acceso-decision.ts.
 * Specs: docs/superpowers/specs/2026-10-12-activacion-pantallas-opciones.md y
 * 2026-10-17-activacion-supabase-parte-a-design.md
 *
 * Modulo sin `@/` ni Next: se testea con `node --test`.
 */

export interface Tele {
  /** Id propio de la tele, ej. "k3x9q2". */
  id: string
  tenant: string
  /** Rubros fijos de la tele (canonicos). null = muestra todo. */
  rubros: string[] | null
}

const ID_RE = /^[a-z0-9]{4,12}$/
const SLUG_RE = /^[a-z0-9-]+$/
/** Hex de la firma del link: 48 bits, imposible de adivinar por HTTP. */
const LARGO_FIRMA_LINK = 12
const SIN_RUBRO = 'todo'

function hmac(secreto: string, texto: string): string {
  return createHmac('sha256', secreto).update(texto).digest('hex')
}

function iguales(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

function rubrosATexto(rubros: string[] | null): string {
  return rubros && rubros.length > 0 ? rubros.join(',') : SIN_RUBRO
}

function textoARubros(texto: string): string[] | null {
  if (texto === SIN_RUBRO) return null
  const rubros = texto.split(',').map(normalizarRubro).filter((r): r is string => r !== null)
  return rubros.length > 0 ? rubros : null
}

/** Normaliza rubros cargados a mano ("Cerdo, POLLO") a su forma canonica. */
export function normalizarRubros(texto: string | undefined): string[] | null {
  return texto ? textoARubros(texto.trim().toLowerCase()) : null
}

/** Path del link de activacion (sin "/activar/" adelante). */
export function firmarLink(tele: Tele, venceMs: number, secreto: string): string {
  const vence = Math.floor(venceMs / 60_000).toString(36)
  const segmentos = [tele.tenant, rubrosATexto(tele.rubros), tele.id, vence]
  const firma = hmac(secreto, `link|${segmentos.join('/')}`).slice(0, LARGO_FIRMA_LINK)
  // Un rubro puede tener espacios ("carne vacuna"): se codifica para la URL.
  // La coma queda literal (valida en un path): el link se tipea a mano.
  return [...segmentos, firma].map((seg) => encodeURIComponent(seg).replaceAll('%2C', ',')).join('/')
}

// Next puede entregar los params ya decodificados; decodificar de nuevo es
// inocuo salvo con un "%" suelto, que tiraria URIError (500).
function decodificar(segmento: string): string {
  try {
    return decodeURIComponent(segmento)
  } catch {
    return segmento
  }
}

/** Tele del link si la firma es valida y no vencio; si no, null. */
export function verificarLink(partes: string[], ahoraMs: number, secreto: string): Tele | null {
  if (partes.length !== 5) return null
  const [tenant, rubros, id, vence, firma] = partes.map(decodificar)
  if (!SLUG_RE.test(tenant) || !ID_RE.test(id)) return null
  const base = `${tenant}/${rubros}/${id}/${vence}`
  const esperada = hmac(secreto, `link|${base}`).slice(0, LARGO_FIRMA_LINK)
  if (!iguales(firma, esperada)) return null
  if (parseInt(vence, 36) * 60_000 < ahoraMs) return null
  return { id, tenant, rubros: textoARubros(rubros) }
}

/* Nombre de la cookie de la tele. Vive aca (no en acceso.ts, que es server-only)
   para poder importarla desde proxy.ts. */
export const COOKIE_TELE = 'tele'

// Chrome no deja cookies de mas de 400 dias. Antes de que venza, el panel
// (o un link nuevo) la renueva.
export const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60

/* Opciones de la cookie de la tele: las comparten /activar y /api/alta. */
export const OPCIONES_COOKIE_TELE = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: COOKIE_MAX_AGE_S,
} as const

export function firmarCookie(tele: Tele, secreto: string): string {
  const datos = Buffer.from(JSON.stringify(tele)).toString('base64url')
  return `${datos}.${hmac(secreto, `cookie|${datos}`)}`
}

export function verificarCookie(valor: string, secreto: string): Tele | null {
  const [datos, firma] = valor.split('.')
  if (!datos || !firma || !iguales(firma, hmac(secreto, `cookie|${datos}`))) return null
  try {
    const tele = JSON.parse(Buffer.from(datos, 'base64url').toString()) as Tele
    return typeof tele.id === 'string' && typeof tele.tenant === 'string' ? tele : null
  } catch {
    return null
  }
}

/*
 * `pagado_hasta` del comercio ('AAAA-MM-DD') vencido hace mas de `diasGracia` dias.
 * Fecha mal escrita = no vencido (ante la duda, mostrar).
 */
export function pagoVencido(pagadoHasta: string, ahoraMs: number, diasGracia: number): boolean {
  const limite = Date.parse(`${pagadoHasta}T23:59:59-03:00`)
  if (Number.isNaN(limite)) return false
  return ahoraMs > limite + diasGracia * 24 * 60 * 60 * 1000
}
