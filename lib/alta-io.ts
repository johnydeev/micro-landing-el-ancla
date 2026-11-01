/*
 * I/O compartido por `npm run alta` y `npm run alta-express`: archivos del
 * repo, env de Vercel y fila de Supabase. lib/alta.ts sigue siendo puro; lo
 * que toca disco o red vive aca para no duplicarlo en cada script.
 */

import { readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'

import { envKeyCsv, generarTenantTs, insertarEnRegistro, pedidoComercio, upsertEnv, type DatosTenant } from './alta.ts'

export async function existe(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export interface Vercel {
  token: string
  projectId: string
  teamId?: string
}

/* URL de la API de Vercel con el teamId si hay uno. */
export function urlVercel(ruta: string, teamId?: string, query = ''): string {
  const params = new URLSearchParams(query)
  if (teamId) params.set('teamId', teamId)
  const qs = params.toString()
  return `https://api.vercel.com${ruta}${qs ? `?${qs}` : ''}`
}

/* Que el token sirva, no solo que exista. Tira si Vercel no responde 2xx. */
export async function verificarVercel(v: Vercel): Promise<void> {
  const res = await fetch(urlVercel(`/v9/projects/${encodeURIComponent(v.projectId)}`, v.teamId), {
    headers: { Authorization: `Bearer ${v.token}` },
  })
  if (!res.ok) {
    throw new Error(
      `Vercel respondió ${res.status} al verificar el proyecto. Revisá VERCEL_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID.`,
    )
  }
}

/* Crea o reemplaza TENANT_<SLUG>_CSV_URL en los tres entornos. Tira si falla. */
export async function subirEnvCsvVercel(v: Vercel, slug: string, csvUrl: string, comentario: string): Promise<string> {
  const key = envKeyCsv(slug)
  const res = await fetch(urlVercel(`/v10/projects/${encodeURIComponent(v.projectId)}/env`, v.teamId, 'upsert=true'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${v.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      value: csvUrl,
      type: 'encrypted',
      target: ['production', 'preview', 'development'],
      comment: comentario,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: { message: string }; failed?: unknown[] }
  if (!res.ok || (body.failed && body.failed.length > 0)) {
    throw new Error(`Vercel: ${body.error?.message ?? (body.failed ? JSON.stringify(body.failed) : res.status)}`)
  }
  return key
}

/* Escribe tenants/<slug>.ts, lo registra en tenants/index.ts y agrega la env a .env.local. */
export async function escribirArchivosTenant(datos: DatosTenant, csvUrl: string): Promise<void> {
  await writeFile(path.join('tenants', `${datos.slug}.ts`), generarTenantTs(datos), 'utf8')
  const indexPath = path.join('tenants', 'index.ts')
  await writeFile(indexPath, insertarEnRegistro(await readFile(indexPath, 'utf8'), datos.slug), 'utf8')

  const envLocalPath = '.env.local'
  const envLocal = (await existe(envLocalPath)) ? await readFile(envLocalPath, 'utf8') : ''
  await writeFile(envLocalPath, upsertEnv(envLocal, envKeyCsv(datos.slug), csvUrl), 'utf8')
}

/*
 * Fila del cliente en `comercios` (requiere_activacion = true). No corta el
 * alta: devuelve un mensaje para imprimir y, si falla, la fila queda manual.
 */
export async function crearFilaComercio(
  supabase: { url?: string; key?: string },
  slug: string,
): Promise<{ ok: boolean; mensaje: string }> {
  const manual = `Cargá la fila en comercios a mano (slug ${slug}, requiere_activacion true)`
  if (!supabase.url || !supabase.key) {
    return { ok: false, mensaje: `faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. ${manual}` }
  }
  const pedido = pedidoComercio(supabase.url, supabase.key, slug)
  try {
    const res = await fetch(pedido.url, pedido.init)
    if (res.ok) {
      return { ok: true, mensaje: `comercios: ${slug} (requiere_activacion = true; si ya existía, quedó como estaba)` }
    }
    return { ok: false, mensaje: `Supabase respondió ${res.status}: ${await res.text()}. ${manual}` }
  } catch (e) {
    return { ok: false, mensaje: `Supabase: ${(e as Error).message}. ${manual}` }
  }
}
