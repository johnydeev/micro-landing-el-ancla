/*
 * Alta express de un cliente: `npm run alta-express -- cliente.json`.
 *
 * Hace lo mismo que `npm run alta`, pero sin tocar Google Sheets a mano:
 *   1. Copia la planilla modelo con Drive API (OAuth del dueño).
 *   2. La comparte como "cualquiera con el link" (para el CSV sin auth).
 *   3. Escribe en Configuracion los valores del JSON (horarios, whatsapp...).
 *   4. Resuelve los gids de ofertas/config desde la API de Sheets.
 *   5. Sube el logo a Cloudinary.
 *   6. Escribe tenants/<slug>.ts, lo registra, crea la env en Vercel y
 *      .env.local, y crea la fila en `comercios` (requiere_activacion true).
 *   7. Corre los tests.
 *
 * En el camino feliz, lo unico manual que queda: el commit + push (deploya
 * para todos) y activar las teles desde /admin. Si se saltea el logo, falla
 * Supabase o IMPORTRANGE pide permiso, hay pasos extra (los imprime el script).
 *
 * Secretos en .env.local:
 *   GOOGLE_OAUTH_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN
 *     (ver `npm run google-auth`)
 *   GOOGLE_TEMPLATE_SHEET_ID      id de la planilla modelo (si no va en el JSON)
 *   CLOUDINARY_* / VERCEL_* / SUPABASE_*  igual que `npm run alta`
 *
 * Flags: --force, --sin-logo, --sin-vercel, --sin-supabase.
 * Ejemplo de JSON: scripts/cliente.ejemplo.json
 */

import { readFile } from 'node:fs/promises'
import { argv, env } from 'node:process'
import { execSync } from 'node:child_process'
import path from 'node:path'

import {
  slugificar,
  SLUG_RE,
  slugReservado,
  elegirGids,
  derivarPaleta,
  envKeyCsv,
  type Gids,
} from '../lib/alta.ts'
import {
  parsearClienteExpress,
  urlExportCsv,
  armarEscriturasConfig,
  comillasA1,
  elegirGidListas,
  pareceHtml,
  type ClienteExpress,
} from '../lib/alta-express.ts'
import { leerListas, leerOfertas } from '../lib/planilla.ts'
import {
  tokenGoogle,
  copiarPlanilla,
  compartirLecturaPublica,
  pestanasPlanilla,
  leerRango,
  escribirRangos,
  type CredencialesGoogle,
} from '../lib/google.ts'
import { subirLogoCloudinary } from '../lib/logo-cloudinary.ts'
import {
  existe,
  verificarVercel,
  subirEnvCsvVercel,
  escribirArchivosTenant,
  crearFilaComercio,
  type Vercel,
} from '../lib/alta-io.ts'

const args = argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const FORCE = flags.has('--force')
const SIN_LOGO = flags.has('--sin-logo')
const SIN_VERCEL = flags.has('--sin-vercel')
const SIN_SUPABASE = flags.has('--sin-supabase')
const rutaJson = args.find((a) => !a.startsWith('--'))

/*
 * Corta el alta. Tira en vez de llamar a exit(): en Windows, exit() con un
 * fetch recien cerrado dispara un assert de libuv (UV_HANDLE_CLOSING) y el
 * proceso sale con 127. main().catch imprime y deja exitCode = 1.
 */
class Abortar extends Error {}

function fail(msg: string): never {
  throw new Abortar(msg)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function cargarCredenciales(): CredencialesGoogle {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    fail(
      'Faltan credenciales de Google en .env.local. Cargá GOOGLE_OAUTH_CLIENT_ID y ' +
        'GOOGLE_OAUTH_CLIENT_SECRET (ID de cliente OAuth, App de escritorio) y corré ' +
        '`npm run google-auth` para generar GOOGLE_OAUTH_REFRESH_TOKEN.',
    )
  }
  return { clientId, clientSecret, refreshToken }
}

/*
 * Baja el CSV de una pestaña. `propagando`: la planilla se acaba de compartir
 * y Google puede tardar unos segundos (401/404 o la pagina de login), asi que
 * se reintenta. Con una planilla existente esos errores son definitivos y se
 * corta enseguida; solo se reintentan 5xx, 429 y errores de red.
 */
async function bajarCsv(url: string, etiqueta: string, propagando: boolean): Promise<string> {
  let ultimo = 'sin respuesta'
  for (let intento = 0; intento < 8; intento += 1) {
    let definitivo = false
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) {
        const texto = await res.text()
        if (pareceHtml(res.headers.get('content-type'), texto)) {
          ultimo = 'Google devolvió una página de login: la planilla no está compartida por link'
          definitivo = !propagando
        } else if (texto.trim() !== '') {
          return texto
        } else {
          ultimo = 'CSV vacio'
        }
      } else {
        ultimo = `HTTP ${res.status}`
        definitivo = !propagando && res.status >= 400 && res.status < 500 && res.status !== 429
      }
    } catch (e) {
      ultimo = (e as Error).message
    }
    if (definitivo) break
    await sleep(2000)
  }
  fail(
    `Google no devolvió CSV para ${etiqueta} (${ultimo}). ` +
      'Revisá que la planilla esté compartida como "Cualquiera con el link" (Lector).',
  )
}

async function main() {
  if (!rutaJson) {
    fail('Uso: npm run alta-express -- cliente.json [--force] [--sin-logo] [--sin-vercel] [--sin-supabase]')
  }

  console.log('\nAlta express — cartelería de precios\n')

  // ---- 1. JSON del cliente -------------------------------------------------
  let cliente: ClienteExpress
  try {
    const texto = (await readFile(rutaJson, 'utf8')).replace(/^\uFEFF/, '')
    cliente = parsearClienteExpress(JSON.parse(texto))
  } catch (e) {
    fail(`No pude leer ${rutaJson}: ${(e as Error).message}`)
  }

  const slug = cliente.slug ?? slugificar(cliente.nombre)
  if (!SLUG_RE.test(slug)) fail(`Slug invalido: "${slug}"`)
  if (slugReservado(slug)) fail(`Slug reservado: "${slug}". No puede empezar con api, admin o activar.`)

  const tenantPath = path.join('tenants', `${slug}.ts`)
  if ((await existe(tenantPath)) && !FORCE) {
    fail(`Ya existe ${tenantPath}. Usá --force para sobreescribirlo.`)
  }

  // Preflight: validar logo y Vercel antes de copiar la planilla, para no
  // dejar una copia huerfana si falta un secreto o el archivo.
  let rutaLogo: string | null = null
  if (!SIN_LOGO && cliente.logo) {
    if (!env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      fail('Faltan NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET en .env.local')
    }
    // Las rutas relativas se resuelven contra la carpeta del JSON.
    rutaLogo = path.isAbsolute(cliente.logo) ? cliente.logo : path.resolve(path.dirname(rutaJson), cliente.logo)
    if (!(await existe(rutaLogo))) fail(`No existe el logo: ${rutaLogo}`)
  }
  let vercel: Vercel | null = null
  if (!SIN_VERCEL) {
    if (!env.VERCEL_TOKEN || !env.VERCEL_PROJECT_ID) {
      fail('Faltan VERCEL_TOKEN / VERCEL_PROJECT_ID en .env.local (o usá --sin-vercel)')
    }
    vercel = { token: env.VERCEL_TOKEN, projectId: env.VERCEL_PROJECT_ID, teamId: env.VERCEL_TEAM_ID }
    // Que el token sirva, no solo que exista: un token vencido cortaba el
    // alta despues de copiar la planilla y escribir archivos.
    await verificarVercel(vercel)
  }

  // ---- 2. Copia de la planilla --------------------------------------------
  const credenciales = cargarCredenciales()
  const token = await tokenGoogle(credenciales)
  console.log('→ Google: OAuth OK')

  let sheetId = cliente.planilla.sheetId
  const copiada = !sheetId
  if (sheetId) {
    console.log(`→ Planilla existente: ${sheetId} (no se copia)`)
  } else {
    const templateId = cliente.planilla.templateId || env.GOOGLE_TEMPLATE_SHEET_ID
    if (!templateId) fail('Falta "planilla.templateId" en el JSON o GOOGLE_TEMPLATE_SHEET_ID en .env.local')
    const titulo = cliente.planilla.titulo?.trim() || `Precios ${cliente.nombre}`
    console.log(`→ Copiando la planilla modelo…`)
    try {
      sheetId = await copiarPlanilla(token, templateId, titulo)
    } catch (e) {
      fail(
        `${(e as Error).message}. Revisá que la planilla modelo exista y que la cuenta ` +
          'autorizada tenga permiso de lectura sobre ella.',
      )
    }
    console.log(`  ✓ ${titulo}: ${sheetId}`)
  }

  // Recien compartida: Google tarda en exponer el CSV y conviene reintentar.
  const propagando = copiada || cliente.planilla.compartir === true
  if (propagando) {
    console.log('→ Compartiendo la planilla por link (lectura)…')
    try {
      await compartirLecturaPublica(token, sheetId)
      console.log('  ✓ cualquiera con el link puede leer')
    } catch (e) {
      console.log(`  ! No pude cambiar los permisos: ${(e as Error).message}`)
      console.log('    Si el CSV de abajo falla, compartila a mano como "Cualquiera con el link".')
    }
  } else {
    console.log('→ Permisos: no se tocan (planilla existente). Se asume que ya está compartida por link.')
  }

  // ---- 3. Pestañas y configuracion ----------------------------------------
  const pestanas = await pestanasPlanilla(token, sheetId)
  if (pestanas.length === 0) fail('La planilla no tiene pestañas visibles para la API')
  let gids: Gids
  try {
    gids = elegirGids(pestanas)
  } catch (e) {
    fail((e as Error).message)
  }
  console.log(`  ✓ ofertas gid=${gids.gidOfertas}, config gid=${gids.gidConfig}`)

  const configPestana = pestanas.find((p) => p.gid === gids.gidConfig)
  if (!configPestana) fail('No pude ubicar la pestaña de configuracion')

  const hayConfig = !!cliente.planilla.config && Object.keys(cliente.planilla.config).length > 0
  if (hayConfig && !copiada && cliente.planilla.escribirConfig !== true) {
    console.log('→ Configuracion: no se toca (planilla existente). Usá "planilla.escribirConfig": true para escribirla.')
  } else if (hayConfig && cliente.planilla.config) {
    console.log('→ Escribiendo la configuracion en la planilla…')
    const filas = await leerRango(token, sheetId, `${comillasA1(configPestana.nombre)}!A1:B200`)
    const { data, faltantes } = armarEscriturasConfig(filas, cliente.planilla.config, configPestana.nombre)
    await escribirRangos(token, sheetId, data)
    console.log(`  ✓ ${data.length} valores escritos`)
    if (faltantes.length > 0) {
      console.log(`  ! No encontré fila para: ${faltantes.join(', ')}. Editalas a mano en la planilla.`)
    }
  }

  // ---- 4. URL del CSV ------------------------------------------------------
  const gidListas = elegirGidListas(pestanas, gids)
  const csvUrl = urlExportCsv(sheetId, gidListas)
  console.log('→ Verificando el CSV público…')

  const csvListas = await bajarCsv(csvUrl, 'la lista de precios', propagando)
  if (!leerListas(csvListas).ok) {
    fail(
      'El CSV de la lista de precios no tiene la fila de encabezados (Categoria/Nombre/Precio/Unidad). ' +
        'Revisá que la pestaña elegida sea la de listas.',
    )
  }

  const csvOfertas = await bajarCsv(urlExportCsv(sheetId, gids.gidOfertas), 'ofertas', propagando)
  if (!leerOfertas(csvOfertas).ok) {
    fail('El CSV de ofertas no tiene los encabezados (titulo/precio/slug imagen/estado).')
  }

  await bajarCsv(urlExportCsv(sheetId, gids.gidConfig), 'configuracion', propagando)
  console.log('  ✓ CSV accesible y con los encabezados esperados')

  // ---- 5. Logo -------------------------------------------------------------
  if (!rutaLogo) {
    console.log(`→ Logo: saltado. Subilo después como logos/${slug}`)
  } else {
    const cloud = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!
    const apiKey = env.CLOUDINARY_API_KEY!
    const apiSecret = env.CLOUDINARY_API_SECRET!

    console.log('→ Subiendo el logo a Cloudinary…')
    try {
      const publicId = await subirLogoCloudinary({ cloud, apiKey, apiSecret, slug, ruta: rutaLogo })
      console.log(`  ✓ ${publicId}`)
    } catch (e) {
      fail((e as Error).message)
    }
  }

  // ---- 6. Env en Vercel ----------------------------------------------------
  // Antes de escribir archivos: si Vercel falla, el repo queda sin tocar.
  const key = envKeyCsv(slug)
  if (!vercel) {
    console.log(`→ Vercel: saltado (--sin-vercel). Cargá a mano ${key}`)
  } else {
    console.log('→ Creando la variable en Vercel…')
    try {
      await subirEnvCsvVercel(vercel, slug, csvUrl, `CSV de ${cliente.nombre} (npm run alta-express)`)
    } catch (e) {
      fail(
        `${(e as Error).message}. No se escribió nada en el repo. ` +
          `Reintentá con "planilla.sheetId": "${sheetId}" para no copiar de nuevo.`,
      )
    }
    console.log(`  ✓ ${key} en Vercel (production, preview, development)`)
  }

  // ---- 7. Archivos del repo y .env.local ----------------------------------
  const contacto = cliente.contacto ?? {}
  const instagramRaw = contacto.instagram ?? ''
  await escribirArchivosTenant(
    {
      slug,
      nombre: cliente.nombre,
      eslogan: cliente.eslogan ?? '',
      badgeOferta: cliente.badgeOferta ?? 'OFERTA',
      whatsapp: contacto.whatsapp ?? '',
      instagram: instagramRaw && !instagramRaw.startsWith('@') ? `@${instagramRaw}` : instagramRaw,
      horarios: contacto.horarios ?? '',
      paleta: derivarPaleta(cliente.colores.primario, cliente.colores.secundario),
      gids,
    },
    csvUrl,
  )
  console.log(`→ Escrito ${tenantPath}, registrado en tenants/index.ts y ${key} en .env.local`)

  // ---- 8. Fila del cliente en Supabase ------------------------------------
  if (SIN_SUPABASE) {
    console.log(`→ Supabase: saltado (--sin-supabase). Cargá la fila (slug ${slug}, requiere_activacion true)`)
  } else {
    console.log('→ Creando la fila en comercios…')
    const { ok, mensaje } = await crearFilaComercio({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }, slug)
    console.log(`  ${ok ? '✓' : '✖'} ${mensaje}`)
  }

  // ---- 9. Tests ------------------------------------------------------------
  console.log('\n→ npm test')
  try {
    execSync('npm test', { stdio: 'inherit' })
  } catch {
    fail('Los tests fallaron. Revisá el archivo generado antes de commitear.')
  }

  const base = env.URL_PUBLICA ?? 'https://tv-precios.vercel.app'
  console.log(`
✓ Alta lista: ${cliente.nombre} (${slug})

  Planilla:   https://docs.google.com/spreadsheets/d/${sheetId}/edit
  CSV:        ${csvUrl}
  Archivos:   ${tenantPath}, tenants/index.ts
  URL de TV:  ${base}/${slug}
  API:        ${base}/api/${slug}/ofertas

Listo para commitear. El push deploya para todos los comercios: hacelo fuera
del horario de atención. Después, activá las teles desde /admin.
`)
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}`)
  process.exitCode = 1
})
