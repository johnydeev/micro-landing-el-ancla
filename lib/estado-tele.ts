import 'server-only'

import { parsearEstado, type EstadoBase } from '@/lib/acceso-decision'
import type { Tele } from '@/lib/activacion'

// Si Supabase tarda mas que esto, la pantalla se muestra igual.
const TIMEOUT_MS = 1000

/*
 * Llama a la funcion `estado_tele` de Supabase (RPC de PostgREST): registra la
 * tele si es nueva, anota su conexion y devuelve el estado del comercio y de
 * la tele. Ante cualquier problema (env faltante, timeout, error, respuesta
 * rara) devuelve null y loguea `[supabase]`: ante la duda, se muestra.
 * La service role key nunca sale del servidor.
 */
export async function estadoTele(comercio: string, tele: Tele | null): Promise<EstadoBase | null> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[supabase] faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: se muestra la pantalla igual')
    return null
  }

  try {
    const respuesta = await fetch(`${url}/rest/v1/rpc/estado_tele`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_comercio: comercio,
        p_tele: tele?.id ?? null,
        p_rubros: tele?.rubros ?? null,
      }),
    })
    if (!respuesta.ok) {
      console.error(`[supabase] estado_tele respondio ${respuesta.status}: se muestra la pantalla igual`)
      return null
    }
    const estado = parsearEstado(await respuesta.json())
    if (!estado) console.error('[supabase] respuesta inesperada de estado_tele: se muestra la pantalla igual')
    return estado
  } catch (error) {
    console.error('[supabase] estado_tele fallo: se muestra la pantalla igual', error)
    return null
  }
}
