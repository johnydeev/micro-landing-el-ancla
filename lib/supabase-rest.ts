import 'server-only'

// Por defecto: una consulta lenta no deja colgada la respuesta.
const TIMEOUT_MS = 3000

/*
 * Acceso a Supabase (PostgREST) con la service role key. Solo servidor: la key
 * nunca sale de aca. Ante cualquier falla (env faltante, timeout, error HTTP,
 * red) devuelve null y loguea `[supabase]`; cada llamador decide que hacer
 * (ante la duda, mostrar).
 */
export async function rest(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUT_MS,
): Promise<Response | null> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[supabase] faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY')
    return null
  }

  try {
    const respuesta = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
    if (!respuesta.ok) {
      console.error(`[supabase] ${path} respondio ${respuesta.status}`)
      return null
    }
    return respuesta
  } catch (error) {
    console.error(`[supabase] ${path} fallo`, error)
    return null
  }
}

/* Llama una funcion SQL (RPC). Devuelve el JSON tal cual: el llamador lo valida. */
export async function rpc<T>(
  nombre: string,
  args: object,
  { timeoutMs = TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<T | null> {
  const respuesta = await rest(
    `rpc/${nombre}`,
    { method: 'POST', body: JSON.stringify(args) },
    timeoutMs,
  )
  if (!respuesta) return null
  try {
    return (await respuesta.json()) as T
  } catch (error) {
    console.error(`[supabase] ${nombre} devolvio algo que no es JSON`, error)
    return null
  }
}
