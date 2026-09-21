/*
 * Helpers puros del alta de cliente (`npm run alta`, scripts/alta.ts).
 *
 * Sin Next, sin React, sin fs ni red: todo lo que toca el mundo exterior vive
 * en el script. Aca solo transformaciones testeables con `node --test`.
 * Ver docs/superpowers/specs/2026-09-20-alta-de-cliente-design.md.
 */

import { createHash } from 'node:crypto'

const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

function sinAcentos(raw: string): string {
  return raw.normalize('NFD').replace(COMBINING_DIACRITICS, '')
}

/* "Carnicería López" -> "carniceria-lopez" */
export function slugificar(raw: string): string {
  return sinAcentos(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/* "carniceria-lopez" -> "carniceriaLopez" (nombre del export en tenants/) */
export function camelCase(slug: string): string {
  return slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Google Sheets publicado: de la URL del CSV a los gids de las pestanas
// ---------------------------------------------------------------------------

/*
 * La URL que el usuario copia de "Publicar en la web" es
 *   https://docs.google.com/spreadsheets/d/e/<ID>/pub?output=csv
 * Google publica ademas /pubhtml, una pagina que lista TODAS las pestanas con
 * su gid. Es lo que nos evita pedirle al usuario que copie gids a mano.
 */
export function pubhtmlUrl(csvUrl: string): string {
  const m = csvUrl.match(/^(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)\/pub(\?.*)?$/)
  if (!m) {
    throw new Error(
      'La URL tiene que ser la de "Publicar en la web" de Google Sheets: ' +
        'https://docs.google.com/spreadsheets/d/e/<ID>/pub?output=csv',
    )
  }
  return `${m[1]}/pubhtml`
}

/* La URL base del CSV, sin gid ni parametros extra (lo que va a la env). */
export function csvUrlBase(csvUrl: string): string {
  const base = pubhtmlUrl(csvUrl).replace(/\/pubhtml$/, '')
  return `${base}/pub?output=csv`
}

export interface Pestana {
  nombre: string
  gid: string
}

/*
 * /pubhtml trae, dentro de un <script>, una lista de la forma:
 *   items.push({name: "Ofertas", pageUrl: "...gid=2121126279", gid: "2121126279", ...})
 * Extraemos nombre + gid de cada una. Los nombres vienen escapados como en
 * JS (\x27, é): se desescapan lo minimo necesario.
 */
export function parsearPestanas(html: string): Pestana[] {
  const re = /items\.push\(\{name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*?gid=(\d+)/g
  const out: Pestana[] = []
  for (const m of html.matchAll(re)) {
    const nombre = m[1]
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\(.)/g, '$1')
    out.push({ nombre, gid: m[2] })
  }
  return out
}

export interface Gids {
  gidOfertas: string
  gidConfig: string
}

/*
 * Elige las pestanas por nombre, tolerante a acentos y mayusculas:
 * ofertas = contiene "oferta"; config = contiene "config".
 */
export function elegirGids(pestanas: Pestana[]): Gids {
  const norm = (s: string) => sinAcentos(s).toLowerCase()
  const ofertas = pestanas.find((p) => norm(p.nombre).includes('oferta'))
  const config = pestanas.find((p) => norm(p.nombre).includes('config'))
  const lista = pestanas.map((p) => `"${p.nombre}" (gid ${p.gid})`).join(', ')
  if (!ofertas) throw new Error(`No encontre una pestana de ofertas. Pestanas: ${lista}`)
  if (!config) throw new Error(`No encontre una pestana de configuracion. Pestanas: ${lista}`)
  return { gidOfertas: ofertas.gid, gidConfig: config.gid }
}

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

export interface Paleta {
  primario: string
  secundario: string
  fondo: string
  textoPrimario: string
  textoSecundario: string
  filaImpar: string
}

/* Mezcla un color con blanco: t=0 -> color, t=1 -> blanco. */
function tinte(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16)
  const canal = (shift: number) => {
    const c = (n >> shift) & 0xff
    return Math.round(c + (255 - c) * t)
  }
  const toHex = (v: number) => v.toString(16).padStart(2, '0').toUpperCase()
  return `#${toHex(canal(16))}${toHex(canal(8))}${toHex(canal(0))}`
}

/*
 * De dos colores a la paleta completa. Mismos roles que tenia El Ancla
 * (rojo/azul): el secundario es tambien el color de texto principal, y la
 * fila impar de la tabla es un tinte muy claro del primario.
 */
export function derivarPaleta(primario: string, secundario: string): Paleta {
  for (const c of [primario, secundario]) {
    if (!HEX_RE.test(c)) throw new Error(`Color invalido: "${c}". Formato: #rrggbb`)
  }
  return {
    primario: primario.toUpperCase(),
    secundario: secundario.toUpperCase(),
    fondo: '#FFFFFF',
    textoPrimario: secundario.toUpperCase(),
    textoSecundario: '#6B7280',
    filaImpar: tinte(primario, 0.92),
  }
}

// ---------------------------------------------------------------------------
// Archivos del repo
// ---------------------------------------------------------------------------

export interface DatosTenant {
  slug: string
  nombre: string
  eslogan: string
  badgeOferta: string
  whatsapp: string
  instagram: string
  horarios: string
  paleta: Paleta
  gids: Gids
}

/* String literal con comillas simples, como usa el repo. */
function lit(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/* Genera el contenido de tenants/<slug>.ts con la misma forma que granja-elancla.ts. */
export function generarTenantTs(d: DatosTenant): string {
  const p = d.paleta
  return `import type { Tenant } from '@/types/tenant'

// Generado por \`npm run alta\` el ${new Date().toISOString().slice(0, 10)}. Editable a mano.
export const ${camelCase(d.slug)}: Tenant = {
  slug: ${lit(d.slug)},
  nombre: ${lit(d.nombre)},
  eslogan: ${lit(d.eslogan)},
  logo: ${lit(`logos/${d.slug}`)},

  textos: {
    badgeOferta: ${lit(d.badgeOferta)},
    sinDatos: 'Estamos actualizando la lista de precios.',
  },

  paleta: {
    primario: ${lit(p.primario)},
    secundario: ${lit(p.secundario)},
    fondo: ${lit(p.fondo)},
    textoPrimario: ${lit(p.textoPrimario)},
    textoSecundario: ${lit(p.textoSecundario)},
    filaImpar: ${lit(p.filaImpar)},
  },

  tipografia: {
    tabla: 230,
    footer: 135,
  },

  plantillaCartelDefault: 'clasico',

  sheets: {
    gidOfertas: ${lit(d.gids.gidOfertas)},
    gidConfig: ${lit(d.gids.gidConfig)},
  },

  defaults: {
    segundosCartel: 3,
    segundosTabla: 3,
    horarios: ${lit(d.horarios)},
    whatsapp: ${lit(d.whatsapp)},
    instagram: ${lit(d.instagram)},
  },
}
`
}

/*
 * Inserta el import y la entrada del tenant en tenants/index.ts. Idempotente:
 * si ya estan, devuelve el mismo contenido. Mantiene los imports y las
 * entradas en orden alfabetico por slug.
 */
export function insertarEnRegistro(indexTs: string, slug: string): string {
  const nombre = camelCase(slug)
  const importLine = `import { ${nombre} } from './${slug}.ts'`
  const entryLine = `  '${slug}': ${nombre},`

  let out = indexTs
  if (!out.includes(importLine)) {
    const imports = [...out.matchAll(/^import \{ \w+ \} from '\.\/[a-z0-9-]+\.ts'$/gm)]
    if (imports.length === 0) throw new Error('tenants/index.ts: no encontre imports de tenants')
    const lines = imports.map((m) => m[0]).concat(importLine).sort()
    const first = imports[0].index!
    const last = imports[imports.length - 1]
    const end = last.index! + last[0].length
    out = out.slice(0, first) + lines.join('\n') + out.slice(end)
  }
  if (!out.includes(entryLine)) {
    const m = out.match(/export const TENANTS: Record<string, Tenant> = \{\n([\s\S]*?)\n\}/)
    if (!m) throw new Error('tenants/index.ts: no encontre el objeto TENANTS')
    const entries = m[1].split('\n').filter((l) => l.trim()).concat(entryLine).sort()
    out = out.replace(m[0], `export const TENANTS: Record<string, Tenant> = {\n${entries.join('\n')}\n}`)
  }
  return out
}

// ---------------------------------------------------------------------------
// Cloudinary: firma del upload
// ---------------------------------------------------------------------------

/*
 * Cloudinary firma los uploads con sha1 de los parametros ordenados por
 * clave (formato querystring, sin api_key ni file) + el api_secret.
 * https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
 */
export function firmaCloudinary(params: Record<string, string | number | boolean>, apiSecret: string): string {
  const query = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(query + apiSecret).digest('hex')
}

/* Nombre de la env del CSV, igual que lib/tenant-env.ts (duplicado a proposito: sin imports cruzados). */
export function envKeyCsv(slug: string): string {
  return `TENANT_${slug.toUpperCase().replace(/-/g, '_')}_CSV_URL`
}

/* Agrega o reemplaza KEY=value en un .env. */
export function upsertEnv(envText: string, key: string, value: string): string {
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(envText)) return envText.replace(re, line)
  const sep = envText.length === 0 || envText.endsWith('\n') ? '' : '\n'
  return `${envText}${sep}${line}\n`
}
