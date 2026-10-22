import 'server-only'

import { conLimite } from '@/lib/limite'
import { rubrosDeListas } from '@/lib/panel'
import { getListasPrecios } from '@/lib/sheets'
import { rest } from '@/lib/supabase-rest'
import { getTenant } from '@/tenants'

/*
 * Lectura de datos del panel /admin (Parte B). Solo servidor: usa la service
 * role key via lib/supabase-rest.ts.
 */

export interface TeleAdmin {
  id: string
  rubros: string[] | null
  activa: boolean
  ultimaConexion: string | null
}

export interface ClienteAdmin {
  slug: string
  nombre: string
  pagadoHasta: string | null
  dadoDeBaja: boolean
  teles: TeleAdmin[]
}

interface FilaComercio {
  slug: string
  pagado_hasta: string | null
  dado_de_baja: boolean
  teles: { id: string; rubros: string[] | null; activa: boolean; ultima_conexion: string | null }[] | null
}

/* Todos los comercios con sus teles. null = base no disponible (el panel avisa). */
export async function listarClientes(): Promise<ClienteAdmin[] | null> {
  const respuesta = await rest(
    'comercios?select=slug,pagado_hasta,dado_de_baja,teles(id,rubros,activa,ultima_conexion)',
  )
  if (!respuesta) return null
  let filas: FilaComercio[]
  try {
    filas = (await respuesta.json()) as FilaComercio[]
  } catch (error) {
    console.error('[supabase] comercios devolvio algo que no es JSON', error)
    return null
  }
  if (!Array.isArray(filas)) return null

  return filas.map((f) => ({
    slug: f.slug,
    /* Slug sin archivo en tenants/ (ej. cliente borrado del registro): se muestra el slug. */
    nombre: getTenant(f.slug)?.nombre ?? f.slug,
    pagadoHasta: f.pagado_hasta,
    dadoDeBaja: f.dado_de_baja,
    teles: (f.teles ?? [])
      .map((t) => ({ id: t.id, rubros: t.rubros, activa: t.activa, ultimaConexion: t.ultima_conexion }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }))
}

/*
 * Espera maxima a la planilla: /admin se vuelve a renderizar despues de cada
 * accion (revalidatePath), asi que una planilla lenta no puede colgar el
 * switch ni la vista. Vencido = [] (la UI ofrece solo "Todo").
 */
const LIMITE_PLANILLA_MS = 2500

/*
 * Rubros que tiene la planilla del cliente (para elegir los de una tele).
 * Si el cliente no esta en tenants/, la planilla falla o tarda: [] (no rompe la vista).
 */
export async function rubrosDePlanilla(slug: string): Promise<string[]> {
  const tenant = getTenant(slug)
  if (!tenant) return []
  const lectura = getListasPrecios(tenant).then((l) => (l.estado === 'ok' ? rubrosDeListas(l.datos) : []))
  return conLimite(lectura, LIMITE_PLANILLA_MS, [], () =>
    console.error(`[admin] planilla lenta de ${slug}: sin rubros (mas de ${LIMITE_PLANILLA_MS} ms)`),
  )
}
