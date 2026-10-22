/*
 * Codigo de alta de pantallas: 6 caracteres que se tipean en la tele, vencen a
 * los 15 min y se muestran como XXX-XXX. Sin letras ambiguas (I, L, O, 0, 1).
 *
 * Sin imports de `node:*`: lo importa un Client Component. El hash vive en
 * lib/hash.ts.
 */

export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LARGO_CODIGO = 6
/** Margen: un codigo que vence en menos de esto no se reusa. */
const MARGEN_VENCIMIENTO_MS = 30_000

/* 6 bytes -> 6 caracteres (byte % 31; el leve sesgo es irrelevante para un codigo de 15 min). */
export function generarCodigo(bytes: Uint8Array): string {
  let codigo = ''
  for (let i = 0; i < LARGO_CODIGO; i++) {
    codigo += ALFABETO_CODIGO[bytes[i] % ALFABETO_CODIGO.length]
  }
  return codigo
}

/* Mayusculas, sin espacios ni guiones; null si no son 6 caracteres del alfabeto. */
export function normalizarCodigo(input: string): string | null {
  const codigo = input.toUpperCase().replace(/[\s-]/g, '')
  if (codigo.length !== LARGO_CODIGO) return null
  for (const c of codigo) if (!ALFABETO_CODIGO.includes(c)) return null
  return codigo
}

/* 'K7M2QX' -> 'K7M-2QX' */
export function formatearCodigo(codigo: string): string {
  return `${codigo.slice(0, 3)}-${codigo.slice(3)}`
}

export interface CodigoGuardado {
  codigo: string
  nonce: string
  venceMs: number
}

/*
 * Codigo guardado en el navegador, SIN filtrar por vencimiento: el reloj de la
 * tele puede estar mal y el servidor es la autoridad (GET /api/alta). null si
 * no hay o esta roto.
 */
export function codigoGuardado(
  storage: Pick<Storage, 'getItem'> | null,
  clave: string,
): CodigoGuardado | null {
  try {
    const crudo = storage?.getItem(clave)
    if (!crudo) return null
    const g = JSON.parse(crudo) as CodigoGuardado
    if (typeof g?.codigo !== 'string' || typeof g.nonce !== 'string' || typeof g.venceMs !== 'number') {
      return null
    }
    return g
  } catch {
    return null
  }
}

/* Codigo guardado si sigue vigente (con margen); si no, null. */
export function codigoGuardadoVigente(
  storage: Pick<Storage, 'getItem'> | null,
  clave: string,
  ahoraMs: number,
): CodigoGuardado | null {
  const g = codigoGuardado(storage, clave)
  return g && g.venceMs - ahoraMs > MARGEN_VENCIMIENTO_MS ? g : null
}
