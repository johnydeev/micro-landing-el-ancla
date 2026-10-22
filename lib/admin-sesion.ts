import { createHmac, timingSafeEqual } from 'node:crypto'

import { sha256Hex } from './hash.ts'

/*
 * Sesion del panel /admin: cookie `admin` = `<expMs>.<hmac>`, firmada con
 * ACTIVACION_SECRET y atada a ADMIN_PASSWORD. Prefijo 'admin|' distinto al de las teles ('link|',
 * 'cookie|') para que una firma de tele nunca valga como sesion.
 * Sin ADMIN_PASSWORD nadie entra.
 *
 * Modulo sin `@/` ni Next: se testea con `node --test`.
 */

export const COOKIE_ADMIN = 'admin'
export const SESION_ADMIN_MS = 30 * 24 * 60 * 60 * 1000

function hmac(secreto: string, texto: string): string {
  return createHmac('sha256', secreto).update(texto).digest('hex')
}

function iguales(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/*
 * La firma incluye el hash de la contrasena: cambiar ADMIN_PASSWORD invalida
 * las sesiones abiertas sin tocar ACTIVACION_SECRET (que apagaria las teles).
 * Sin contrasena no hay sesion valida.
 */
function mensaje(exp: string, password: string): string {
  return `admin|${exp}|${sha256Hex(password)}`
}

/* Valor de la cookie: vence a los 30 dias de `ahoraMs`. */
export function firmarSesion(ahoraMs: number, secreto: string, password: string): string {
  const exp = String(ahoraMs + SESION_ADMIN_MS)
  return `${exp}.${hmac(secreto, mensaje(exp, password))}`
}

export function verificarSesion(
  valor: string | undefined,
  ahoraMs: number,
  secreto: string,
  password: string | undefined,
): boolean {
  if (!valor || !password) return false
  const [exp, firma] = valor.split('.')
  if (!exp || !firma || !iguales(firma, hmac(secreto, mensaje(exp, password)))) return false
  const venceMs = Number(exp)
  return Number.isFinite(venceMs) && venceMs > ahoraMs
}

/* Comparacion en tiempo constante (hash de ambos, mismo largo). Sin esperado, nunca. */
export function passwordCorrecta(input: string, esperado: string | undefined): boolean {
  if (!esperado) return false
  return timingSafeEqual(Buffer.from(sha256Hex(input), 'hex'), Buffer.from(sha256Hex(esperado), 'hex'))
}
