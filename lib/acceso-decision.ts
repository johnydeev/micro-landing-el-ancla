import type { Tele } from './activacion.ts'
import { normalizarRubro, parseRubrosParam } from './rubros.ts'

/*
 * Que muestra una tele, decidido a partir de lo que devolvio Supabase
 * (`estado_tele`, ver supabase/migrations) y de su cookie. Puro: sin Next,
 * sin red, testeable con `node --test`. La llamada a la base vive en
 * lib/estado-tele.ts y la orquestacion en lib/acceso.ts.
 * Spec: docs/superpowers/specs/2026-10-17-activacion-supabase-parte-a-design.md
 */

export interface EstadoBase {
  /** null = el comercio no tiene fila: sin activacion ni control de pago. */
  comercio: { requiereActivacion: boolean; pagadoHasta: string | null; dadoDeBaja: boolean } | null
  /** null = la tele no tiene fila (o no vino cookie). */
  tele: { activa: boolean; rubros: string[] | null } | null
}

export type Acceso =
  | { tipo: 'ok'; rubros: Set<string> | null }
  /* conCodigo: la pantalla puede mostrar el codigo de alta (false si el comercio esta dado de baja). */
  | { tipo: 'no-habilitada'; conCodigo: boolean }
  | { tipo: 'desactivada' }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const esRubros = (v: unknown): v is string[] | null =>
  v === null || (Array.isArray(v) && v.every((r) => typeof r === 'string'))

/** Valida la respuesta de la RPC campo por campo. Cualquier forma inesperada → null. */
export function parsearEstado(json: unknown): EstadoBase | null {
  if (!esObjeto(json) || !('comercio' in json) || !('tele' in json)) return null
  const { comercio, tele } = json

  let c: EstadoBase['comercio'] = null
  if (comercio !== null) {
    if (!esObjeto(comercio)) return null
    const { requiere_activacion, pagado_hasta } = comercio
    if (typeof requiere_activacion !== 'boolean') return null
    if (pagado_hasta !== null && typeof pagado_hasta !== 'string') return null
    // Ausente (funcion SQL vieja) = no dado de baja; presente y no booleano = basura.
    const baja = comercio.dado_de_baja ?? false
    if (typeof baja !== 'boolean') return null
    c = { requiereActivacion: requiere_activacion, pagadoHasta: pagado_hasta, dadoDeBaja: baja }
  }

  let t: EstadoBase['tele'] = null
  if (tele !== null) {
    if (!esObjeto(tele)) return null
    const { activa, rubros } = tele
    if (typeof activa !== 'boolean' || !esRubros(rubros)) return null
    t = { activa, rubros }
  }

  return { comercio: c, tele: t }
}

// Los rubros de la base se cargan a mano en el editor de Supabase: se
// normalizan igual que los de la planilla ("Cerdo" → "cerdo", "res" →
// "vacuno"). Sin ninguno valido = todo, nunca una tele en blanco.
const aSet = (rubros: string[] | null): Set<string> | null => {
  const validos = (rubros ?? []).map(normalizarRubro).filter((r): r is string => r !== null)
  return validos.length > 0 ? new Set(validos) : null
}

/*
 * Orden: baja → no habilitada → desactivada → ok. El pago vencido no corta
 * la pantalla: solo avisa en el panel (el corte es la baja, a mano). `tele` llega ya
 * filtrada (cookie valida y del mismo comercio). Estado null (la base fallo):
 * ante la duda, se muestra.
 */
export function decidirAcceso({
  estado,
  tele,
  rubroParam,
}: {
  estado: EstadoBase | null
  tele: Tele | null
  rubroParam: string | string[] | undefined
  /** Ya no interviene (el pago no corta); se conserva por compatibilidad con los llamadores. */
  ahoraMs?: number
}): Acceso {
  const comercio = estado?.comercio ?? null
  const fila = estado?.tele ?? null

  if (comercio?.dadoDeBaja) return { tipo: 'no-habilitada', conCodigo: false }
  if (comercio?.requiereActivacion && !tele) return { tipo: 'no-habilitada', conCodigo: true }
  if (fila && !fila.activa) return { tipo: 'desactivada' }

  if (fila) return { tipo: 'ok', rubros: aSet(fila.rubros) }
  if (tele) return { tipo: 'ok', rubros: aSet(tele.rubros) }
  return { tipo: 'ok', rubros: parseRubrosParam(rubroParam) }
}
