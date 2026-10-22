import { createHash } from 'node:crypto'

/*
 * SHA-256 en hex. Vive aparte de codigo-alta.ts porque ese modulo lo importa
 * un Client Component y no puede arrastrar `node:crypto`.
 */
export function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto).digest('hex')
}
