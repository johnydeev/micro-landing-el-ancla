import type { ConfigNegocio, EstadoLectura, EstadoPantalla, ListaPrecios, Oferta } from '@/types'

/*
 * Ultimo dato bueno: si Google Sheets falla, cada TV sigue mostrando lo
 * ultimo que recibio bien, hasta VIGENCIA_MS. Se guarda en el localStorage
 * de la TV (PantallaRotativa); este modulo solo decide, sin tocar storage
 * ni reloj (todo entra por parametro) para poder testearlo.
 * Ver docs/superpowers/specs/2026-10-08-ultimo-dato-bueno-design.md.
 */

export const VIGENCIA_MS = 2 * 60 * 60 * 1000

const PREFIJO = 'ultimo-dato-bueno'

export interface Copia<T> {
  datos: T
  /** Hora (ms) en que el server armo la pagina de la que salio el dato. */
  en: number
}

export interface Guardado {
  listas?: Copia<ListaPrecios[]>
  ofertas?: Copia<Oferta[]>
  config?: Copia<ConfigNegocio>
}

export interface Recibido {
  listas: ListaPrecios[]
  ofertas: Oferta[]
  configRemota: ConfigNegocio
  estado: EstadoPantalla
  generadoEn: number
}

export interface Resuelto {
  mostrar: { listas: ListaPrecios[]; ofertas: Oferta[]; configRemota: ConfigNegocio }
  guardar: Guardado
  /** true si alguna parte se muestra desde lo guardado (punto ambar). */
  usandoGuardado: boolean
}

/* Una clave por TV: tenant + rubros normalizados y ordenados. */
export function claveGuardado(slug: string, rubros: Set<string> | null): string {
  const sufijo = rubros ? [...rubros].sort().join(',') : '*'
  return `${PREFIJO}:${slug}:${sufijo}`
}

/* Parseo tolerante de lo que haya en localStorage. Cualquier cosa rara = nada guardado. */
export function leerGuardado(raw: string | null): Guardado {
  if (!raw) return {}
  try {
    const valor: unknown = JSON.parse(raw)
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Guardado) : {}
  } catch {
    return {}
  }
}

interface ParteResuelta<T> {
  mostrar: T
  guardar?: Copia<T>
  usandoGuardado: boolean
}

function resolverParte<T>(
  estado: EstadoLectura,
  recibido: T,
  vacio: T,
  generadoEn: number,
  guardado: Copia<T> | undefined,
): ParteResuelta<T> {
  const guardadoVigente = guardado && generadoEn - guardado.en <= VIGENCIA_MS ? guardado : undefined

  if (estado === 'ok') {
    // Pagina vieja servida por el SW sin red: lo guardado es mas nuevo.
    if (guardadoVigente && guardadoVigente.en > generadoEn) {
      return { mostrar: guardadoVigente.datos, guardar: guardadoVigente, usandoGuardado: true }
    }
    return { mostrar: recibido, guardar: { datos: recibido, en: generadoEn }, usandoGuardado: false }
  }

  if (guardadoVigente) {
    return { mostrar: guardadoVigente.datos, guardar: guardadoVigente, usandoGuardado: true }
  }
  return { mostrar: vacio, guardar: guardado, usandoGuardado: false }
}

/*
 * Todas las edades se miden con la hora del SERVER: `generadoEn` de esta
 * pagina contra el `en` guardado (tambien hora del server). No se usa el
 * reloj de la TV, que puede estar corrido.
 */
export function resolver(recibido: Recibido, guardado: Guardado): Resuelto {
  const { estado, generadoEn } = recibido
  const listas = resolverParte<ListaPrecios[]>(estado.listas, recibido.listas, [], generadoEn, guardado.listas)
  const ofertas = resolverParte<Oferta[]>(estado.ofertas, recibido.ofertas, [], generadoEn, guardado.ofertas)
  const config = resolverParte<ConfigNegocio>(estado.config, recibido.configRemota, {}, generadoEn, guardado.config)

  const guardar: Guardado = {}
  if (listas.guardar) guardar.listas = listas.guardar
  if (ofertas.guardar) guardar.ofertas = ofertas.guardar
  if (config.guardar) guardar.config = config.guardar

  return {
    mostrar: { listas: listas.mostrar, ofertas: ofertas.mostrar, configRemota: config.mostrar },
    guardar,
    usandoGuardado: listas.usandoGuardado || ofertas.usandoGuardado || config.usandoGuardado,
  }
}
