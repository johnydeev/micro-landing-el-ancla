import 'server-only'

import { parsearEstado, type EstadoBase } from '@/lib/acceso-decision'
import type { Tele } from '@/lib/activacion'
import { rpc } from '@/lib/supabase-rest'

// Si Supabase tarda mas que esto, la pantalla se muestra igual.
const TIMEOUT_MS = 1000

/*
 * Llama a la funcion `estado_tele` de Supabase (RPC de PostgREST): registra la
 * tele si es nueva, anota su conexion y devuelve el estado del comercio y de
 * la tele. Ante cualquier problema (env faltante, timeout, error, respuesta
 * rara) devuelve null y loguea `[supabase]` (lib/supabase-rest.ts): ante la
 * duda, se muestra. La service role key nunca sale del servidor.
 */
export async function estadoTele(comercio: string, tele: Tele | null): Promise<EstadoBase | null> {
  const crudo = await rpc<unknown>(
    'estado_tele',
    {
      p_comercio: comercio,
      p_tele: tele?.id ?? null,
      p_rubros: tele?.rubros ?? null,
    },
    { timeoutMs: TIMEOUT_MS },
  )
  if (crudo === null) return null
  const estado = parsearEstado(crudo)
  if (!estado) console.error('[supabase] respuesta inesperada de estado_tele: se muestra la pantalla igual')
  return estado
}
