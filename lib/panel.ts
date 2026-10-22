/*
 * Funciones puras del panel /admin (Parte B): badge de conexion, avisos de
 * pago, "pago" (mes siguiente) y etiqueta de rubros.
 * Spec: docs/superpowers/specs/2026-10-19-panel-admin-parte-b-design.md
 *
 * Modulo sin `@/` ni Next: se testea con `node --test`.
 */

export type ColorBadge = 'verde' | 'ambar' | 'rojo' | 'gris'

const MIN = 60_000
const DIA = 24 * 60 * MIN
/** Argentina no tiene horario de verano: -03:00 fijo. */
const OFFSET_AR_MS = 3 * 60 * MIN

/* Verde < 15 min, ambar 15-60 min, rojo > 60 min o nunca, gris si esta dada de baja. */
export function colorBadge(
  tele: { activa: boolean; ultimaConexion: string | null },
  ahoraMs: number,
): ColorBadge {
  if (!tele.activa) return 'gris'
  if (!tele.ultimaConexion) return 'rojo'
  const ultima = Date.parse(tele.ultimaConexion)
  if (Number.isNaN(ultima)) return 'rojo'
  const hace = ahoraMs - ultima
  if (hace < 15 * MIN) return 'verde'
  if (hace <= 60 * MIN) return 'ambar'
  return 'rojo'
}

export type AvisoPago = { tipo: 'vencido'; dias: number } | { tipo: 'por-vencer'; dias: number } | null

/* Dia de calendario en Argentina ('AAAA-MM-DD') de un instante. */
function diaArgentina(ahoraMs: number): string {
  return new Date(ahoraMs - OFFSET_AR_MS).toISOString().slice(0, 10)
}

/*
 * Aviso segun `pagado_hasta`: "por vencer" si faltan 0-3 dias, "vencido" si ya
 * paso (con los dias de atraso). Compara fechas de calendario en hora de
 * Argentina. Fecha ausente o mal escrita = sin aviso.
 */
export function avisoPago(pagadoHasta: string | null, ahoraMs: number): AvisoPago {
  if (!pagadoHasta) return null
  const limite = Date.parse(`${pagadoHasta}T00:00:00Z`)
  if (Number.isNaN(limite)) return null
  const hoy = Date.parse(`${diaArgentina(ahoraMs)}T00:00:00Z`)
  const faltan = Math.round((limite - hoy) / DIA)
  if (faltan < 0) return { tipo: 'vencido', dias: -faltan }
  if (faltan <= 3) return { tipo: 'por-vencer', dias: faltan }
  return null
}

/* Mismo dia del mes siguiente; si no existe (31 -> febrero), ultimo dia del mes. */
export function siguienteMes(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  // `mes` es 1-based: Date.UTC(anio, mes + 1, 0) = ultimo dia del mes siguiente.
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  const destino = new Date(Date.UTC(anio, mes, Math.min(dia, ultimoDia)))
  return destino.toISOString().slice(0, 10)
}

/* "Todo" | "Vacuno" | "Cerdo y pollo" | "Cerdo, pollo y vacuno" (orden alfabetico). */
export function etiquetaRubros(rubros: string[] | null): string {
  if (!rubros || rubros.length === 0) return 'Todo'
  const nombres = [...rubros].sort().map((r) => r.toLowerCase())
  const texto =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/* "hace 3 min" | "hace 2 h" | "hace 3 d" | "nunca". Menos de 1 min = "hace 0 min". */
export function haceCuanto(ultimaConexion: string | null, ahoraMs: number): string {
  if (!ultimaConexion) return 'nunca'
  const ultima = Date.parse(ultimaConexion)
  if (Number.isNaN(ultima)) return 'nunca'
  const min = Math.max(0, Math.floor((ahoraMs - ultima) / MIN))
  if (min < 60) return `hace ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} d`
}

/* 'AAAA-MM-DD' -> 'DD/MM/AAAA'. Texto mal escrito se devuelve tal cual (ante la duda, mostrar). */
export function fechaArgentina(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha
}

/*
 * Orden de los avisos: vencidos primero (mas dias de atraso primero), despues
 * por vencer (menos dias primero). Estable para empates.
 */
export function ordenarAvisos<T extends { aviso: NonNullable<AvisoPago> }>(avisos: T[]): T[] {
  const peso = (a: NonNullable<AvisoPago>) => (a.tipo === 'vencido' ? -a.dias : 1000 + a.dias)
  return [...avisos].sort((x, y) => peso(x.aviso) - peso(y.aviso))
}

/* Etiquetas que se repiten entre las teles de un cliente (ahi se muestra el id corto). */
export function etiquetasRepetidas(teles: { rubros: string[] | null }[]): Set<string> {
  const vistas = new Set<string>()
  const repetidas = new Set<string>()
  for (const t of teles) {
    const etiqueta = etiquetaRubros(t.rubros)
    if (vistas.has(etiqueta)) repetidas.add(etiqueta)
    vistas.add(etiqueta)
  }
  return repetidas
}

/* Rubros unicos y ordenados de las listas de la planilla (los productos sin rubro no cuentan). */
export function rubrosDeListas(listas: { productos: { rubro?: string }[] }[]): string[] {
  const rubros = new Set<string>()
  for (const lista of listas) {
    for (const p of lista.productos) if (p.rubro) rubros.add(p.rubro)
  }
  return [...rubros].sort((a, b) => a.localeCompare(b, 'es'))
}
