/*
 * Helpers puros del alta express (`npm run alta-express`).
 *
 * Sin red, sin fs: validacion del JSON del cliente, URL del CSV exportado y
 * mapeo de la configuracion a las filas de la pestana "Configuracion".
 * Todo testeable con `node --test`.
 */

import { HEX_RE, SLUG_RE, sinAcentos, type Gids } from './alta.ts'
import { normalizarClave } from './planilla.ts'

export interface ContactoExpress {
  whatsapp?: string
  instagram?: string
  horarios?: string
}

export interface PlanillaExpress {
  /** Planilla modelo a copiar. Si falta, se usa GOOGLE_TEMPLATE_SHEET_ID. */
  templateId?: string
  /** Planilla ya existente: no copia, solo la usa. */
  sheetId?: string
  /** Nombre de la copia. Default: "Precios <nombre>". */
  titulo?: string
  /**
   * Compartir por link una planilla existente. En una copia nueva siempre se
   * comparte. Default false para no cambiar permisos de una planilla ajena.
   */
  compartir?: boolean
  /**
   * Escribir `config` en una planilla existente. En una copia nueva siempre se
   * escribe. Default false: una planilla existente puede estar en uso y se
   * pisarian los valores que ven sus teles.
   */
  escribirConfig?: boolean
  /** Valores a escribir en Configuracion, por clave (ej. "horarios"). */
  config?: Record<string, string | number>
}

export interface ClienteExpress {
  nombre: string
  slug?: string
  eslogan?: string
  colores: { primario: string; secundario: string }
  badgeOferta?: string
  contacto?: ContactoExpress
  logo?: string
  planilla: PlanillaExpress
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function textoOpcional(obj: Record<string, unknown>, campo: string): string | undefined {
  const v = obj[campo]
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new Error(`"${campo}" tiene que ser texto`)
  return v.trim()
}

/* Valida el JSON de entrada y devuelve una copia normalizada. */
export function parsearClienteExpress(raw: unknown): ClienteExpress {
  if (!esObjeto(raw)) throw new Error('El JSON del cliente tiene que ser un objeto')

  const nombre = textoOpcional(raw, 'nombre')
  if (!nombre || nombre.trim() === '') throw new Error('Falta "nombre"')

  const slug = textoOpcional(raw, 'slug')
  if (slug !== undefined && !SLUG_RE.test(slug)) {
    throw new Error(`"slug" invalido: "${slug}". Solo minusculas, numeros y guiones`)
  }

  if (!esObjeto(raw.colores)) throw new Error('Falta "colores" con primario y secundario')
  const primario = textoOpcional(raw.colores, 'primario')
  const secundario = textoOpcional(raw.colores, 'secundario')
  for (const [campo, valor] of [
    ['colores.primario', primario],
    ['colores.secundario', secundario],
  ] as const) {
    if (!valor || !HEX_RE.test(valor)) throw new Error(`"${campo}" tiene que ser #rrggbb`)
  }

  let contacto: ContactoExpress | undefined
  if (raw.contacto !== undefined) {
    if (!esObjeto(raw.contacto)) throw new Error('"contacto" tiene que ser un objeto')
    contacto = {
      whatsapp: textoOpcional(raw.contacto, 'whatsapp'),
      instagram: textoOpcional(raw.contacto, 'instagram'),
      horarios: textoOpcional(raw.contacto, 'horarios'),
    }
  }

  if (!esObjeto(raw.planilla)) throw new Error('Falta "planilla"')
  const templateId = textoOpcional(raw.planilla, 'templateId')
  const sheetId = textoOpcional(raw.planilla, 'sheetId')
  const titulo = textoOpcional(raw.planilla, 'titulo')
  if (!templateId && !sheetId) {
    throw new Error('"planilla" necesita "templateId" (para copiar) o "sheetId" (planilla existente)')
  }

  const booleanoOpcional = (campo: 'compartir' | 'escribirConfig'): boolean | undefined => {
    const v = (raw.planilla as Record<string, unknown>)[campo]
    if (v === undefined) return undefined
    if (typeof v !== 'boolean') throw new Error(`"planilla.${campo}" tiene que ser true o false`)
    return v
  }
  const compartir = booleanoOpcional('compartir')
  const escribirConfig = booleanoOpcional('escribirConfig')

  let config: Record<string, string | number> | undefined
  if (raw.planilla.config !== undefined) {
    if (!esObjeto(raw.planilla.config)) throw new Error('"planilla.config" tiene que ser un objeto')
    config = {}
    for (const [clave, valor] of Object.entries(raw.planilla.config)) {
      if (typeof valor !== 'string' && typeof valor !== 'number') {
        throw new Error(`"planilla.config.${clave}" tiene que ser texto o numero`)
      }
      if (!normalizarClave(clave)) {
        throw new Error(`"planilla.config.${clave}" no es una clave conocida de Configuracion`)
      }
      config[clave] = valor
    }
  }

  return {
    nombre,
    slug,
    eslogan: textoOpcional(raw, 'eslogan'),
    colores: { primario: primario!, secundario: secundario! },
    badgeOferta: textoOpcional(raw, 'badgeOferta'),
    contacto,
    logo: textoOpcional(raw, 'logo'),
    planilla: { templateId, sheetId, titulo, compartir, escribirConfig, config },
  }
}

/*
 * URL del CSV de una planilla compartida por link. Evita "Publicar en la web":
 * /export funciona con "cualquiera con el link" y el gid elige la pestaña.
 */
export function urlExportCsv(sheetId: string, gid?: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv`
  return gid ? `${base}&gid=${encodeURIComponent(gid)}` : base
}

/*
 * /export de una planilla no compartida no da 401: Google redirige al login y
 * responde 200 con HTML. Detectarlo evita tomar esa pagina como CSV.
 */
export function pareceHtml(contentType: string | null, texto: string): boolean {
  if (contentType && /text\/html/i.test(contentType)) return true
  return /^\s*</.test(texto)
}

/* Nombre de pestaña en notacion A1, escapando comillas simples. */
export function comillasA1(titulo: string): string {
  return `'${titulo.replace(/'/g, "''")}'`
}

/*
 * Pestana que se usa como CSV base (la lista de precios): la primera que no
 * sea ofertas ni configuracion, priorizando nombres con "tabla" o "precio".
 * El orden del documento no es contrato: si el cliente mueve pestañas, esto
 * sigue eligiendo la correcta.
 */
export function elegirGidListas(pestanas: { nombre: string; gid: string }[], gids: Gids): string {
  const norm = (s: string) => sinAcentos(s).toLowerCase()

  const candidatas = pestanas.filter(
    (p) => p.gid !== gids.gidOfertas && p.gid !== gids.gidConfig && !p.nombre.startsWith('_') && !norm(p.nombre).includes('catalogo'),
  )
  const elegida =
    candidatas.find((p) => norm(p.nombre).includes('tabla')) ??
    candidatas.find((p) => norm(p.nombre).includes('precio')) ??
    candidatas[0]
  if (!elegida) {
    const lista = pestanas.map((p) => `"${p.nombre}" (gid ${p.gid})`).join(', ')
    throw new Error(`No encontre una pestana de listas de precios. Pestanas: ${lista}`)
  }
  return elegida.gid
}

export interface EscrituraConfig {
  range: string
  values: string[][]
}

/*
 * Busca en la columna A de Configuracion la fila de cada clave y arma la
 * escritura de la columna B. Las claves desconocidas o que no estan en la
 * planilla vuelven en `faltantes` (no se inventan filas: se avisa).
 */
export function armarEscriturasConfig(
  filas: string[][],
  config: Record<string, string | number>,
  tituloConfig: string,
): { data: EscrituraConfig[]; faltantes: string[] } {
  const data: EscrituraConfig[] = []
  const faltantes: string[] = []
  const usadas = new Set<number>()

  for (const [clave, valor] of Object.entries(config)) {
    const buscada = normalizarClave(clave)
    if (!buscada) throw new Error(`Clave de configuracion desconocida: "${clave}"`)
    const indice = filas.findIndex(
      (fila, i) => !usadas.has(i) && normalizarClave(fila[0] ?? '') === buscada,
    )
    if (indice === -1) {
      faltantes.push(clave)
      continue
    }
    usadas.add(indice)
    data.push({
      range: `${comillasA1(tituloConfig)}!B${indice + 1}`,
      values: [[String(valor)]],
    })
  }

  return { data, faltantes }
}
