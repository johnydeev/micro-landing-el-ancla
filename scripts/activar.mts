/*
 * Genera el link de activacion de una tele: `npm run activar -- <slug> [rubros] [horas]`
 *
 *   npm run activar -- el-latigo cerdo,pollo
 *   npm run activar -- granja-elancla todo 4
 *
 * rubros: separados por coma, o "todo" (default). horas: vigencia del link
 * (default 2). Se abre una vez en el Fire TV; deja la cookie y redirige a la
 * pantalla. Anotar el id que imprime: es el de esa tele en el panel futuro.
 *
 * Necesita ACTIVACION_SECRET en .env.local (el mismo que en Vercel).
 * URL_PUBLICA opcional (default https://tv-precios.vercel.app).
 */

import { randomBytes } from 'node:crypto'
import { argv, env, exit } from 'node:process'

import { firmarLink, normalizarRubros } from '../lib/activacion.ts'
import { getTenant } from '../tenants/index.ts'

const [slug, rubrosArg, horasArg] = argv.slice(2)
const secreto = env.ACTIVACION_SECRET
const base = env.URL_PUBLICA ?? 'https://tv-precios.vercel.app'

if (!secreto) {
  console.error('Falta ACTIVACION_SECRET en .env.local')
  exit(1)
}
if (!slug || !getTenant(slug)) {
  console.error(`Comercio desconocido: "${slug ?? ''}". Uso: npm run activar -- <slug> [rubros] [horas]`)
  exit(1)
}

const horas = Number(horasArg ?? 2)
if (!(horas > 0)) {
  console.error(`Horas invalidas: "${horasArg}"`)
  exit(1)
}

// 6 caracteres base36: id corto para tipear y leer en logs.
const id = BigInt(`0x${randomBytes(5).toString('hex')}`).toString(36).padStart(6, '0').slice(-6)
const rubros = normalizarRubros(rubrosArg)
const path = firmarLink({ id, tenant: slug, rubros }, Date.now() + horas * 60 * 60 * 1000, secreto)

console.log(`\nTele ${id} · ${slug} · rubros: ${rubros?.join(', ') ?? 'todo'} · vence en ${horas} h\n`)
console.log(`${base}/activar/${path}\n`)
