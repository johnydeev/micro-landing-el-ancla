/*
 * Alta de un cliente desde un solo lugar: `npm run alta`.
 *
 * Pregunta los datos del comercio, resuelve los gids de su planilla a partir
 * de la URL publicada, sube el logo a Cloudinary, escribe tenants/<slug>.ts,
 * lo registra en tenants/index.ts, crea la env TENANT_<SLUG>_CSV_URL en
 * Vercel y en .env.local, crea la fila del cliente en `comercios` (Supabase,
 * con requiere_activacion = true) y corre los tests. Lo unico que no hace:
 * crear la planilla (copia de la planilla modelo) y el commit.
 *
 * Secretos: solo en .env.local (CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
 * VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID opcional, SUPABASE_URL y
 * SUPABASE_SERVICE_ROLE_KEY). El script corre
 * con `node --env-file=.env.local`.
 *
 * Flags: --force (sobreescribir un tenant existente), --sin-logo,
 * --sin-vercel (no toca Vercel; util sin token), --sin-supabase (no crea la
 * fila en comercios; hay que cargarla a mano).
 *
 * Spec: docs/superpowers/specs/2026-09-20-alta-de-cliente-design.md
 */

import { createInterface } from 'node:readline/promises'
import { stdin, stdout, argv, env, exit } from 'node:process'
import { execSync } from 'node:child_process'
import path from 'node:path'

import {
  slugificar,
  SLUG_RE,
  slugReservado,
  HEX_RE,
  pubhtmlUrl,
  csvUrlBase,
  parsearPestanas,
  elegirGids,
  derivarPaleta,
  envKeyCsv,
} from '../lib/alta.ts'
import { subirLogoCloudinary } from '../lib/logo-cloudinary.ts'
import { existe, subirEnvCsvVercel, escribirArchivosTenant, crearFilaComercio } from '../lib/alta-io.ts'

const flags = new Set(argv.slice(2))
const FORCE = flags.has('--force')
const SIN_LOGO = flags.has('--sin-logo')
const SIN_VERCEL = flags.has('--sin-vercel')
const SIN_SUPABASE = flags.has('--sin-supabase')

/*
 * Entrada: interactiva (TTY) o por pipe (`npm run alta < respuestas.txt`, una
 * respuesta por linea, en el mismo orden que las preguntas). Con pipe no se
 * puede usar rl.question directo: readline emite todas las lineas de golpe y
 * las que llegan sin una pregunta pendiente se pierden. Se bufferean.
 */
const rl = createInterface({ input: stdin, output: stdout })
const esTTY = Boolean(stdin.isTTY)
const cola: string[] = []
let entradaCerrada = false
if (!esTTY) {
  rl.on('line', (l) => cola.push(l))
  rl.on('close', () => {
    entradaCerrada = true
  })
}

async function leerLinea(prompt: string): Promise<string> {
  if (esTTY) return rl.question(prompt)
  while (cola.length === 0 && !entradaCerrada) await new Promise((r) => setTimeout(r, 10))
  if (cola.length === 0) fail(`Se acabaron las respuestas antes de "${prompt.trim()}"`)
  const l = cola.shift()!
  stdout.write(`${prompt}${l}
`)
  return l
}

async function preguntar(label: string, opts: { def?: string; validar?: (v: string) => string | null } = {}): Promise<string> {
  for (;;) {
    const sufijo = opts.def !== undefined && opts.def !== '' ? ` [${opts.def}]` : ''
    const raw = (await leerLinea(`${label}${sufijo}: `)).trim()
    const valor = raw === '' && opts.def !== undefined ? opts.def : raw
    const error = opts.validar?.(valor) ?? null
    if (!error) return valor
    console.log(`  ✖ ${error}`)
  }
}

function fail(msg: string): never {
  console.error(`\n✖ ${msg}`)
  exit(1)
}

async function main() {
  console.log('\nAlta de cliente — cartelería de precios\n')

  // ---- 1. Datos -----------------------------------------------------------
  const nombre = await preguntar('Nombre del comercio', { validar: (v) => (v ? null : 'No puede estar vacío') })
  const slug = await preguntar('Slug (URL)', {
    def: slugificar(nombre),
    validar: (v) =>
      !SLUG_RE.test(v)
        ? 'Solo minúsculas, números y guiones'
        : slugReservado(v)
          ? 'No puede empezar con api, admin o activar'
          : null,
  })

  const tenantPath = path.join('tenants', `${slug}.ts`)
  if ((await existe(tenantPath)) && !FORCE) {
    fail(`Ya existe ${tenantPath}. Usá --force para sobreescribirlo.`)
  }

  const eslogan = await preguntar('Eslogan', { def: '' })
  const hexValidar = (v: string) => (HEX_RE.test(v) ? null : 'Formato #rrggbb')
  const primario = await preguntar('Color primario (hex)', { validar: hexValidar })
  const secundario = await preguntar('Color secundario (hex)', { validar: hexValidar })
  const badgeOferta = await preguntar('Texto del badge de oferta', { def: 'OFERTA' })
  const whatsapp = await preguntar('WhatsApp', { def: '' })
  const instagramRaw = await preguntar('Instagram', { def: '' })
  const instagram = instagramRaw && !instagramRaw.startsWith('@') ? `@${instagramRaw}` : instagramRaw
  const horarios = await preguntar('Horarios', { def: '' })
  const urlRaw = await preguntar('URL publicada de la planilla (…/pub?output=csv)', {
    validar: (v) => {
      try {
        pubhtmlUrl(v)
        return null
      } catch (e) {
        return (e as Error).message
      }
    },
  })
  const logoPath = SIN_LOGO
    ? ''
    : await preguntar('Ruta del logo (png/jpg/webp; vacío = saltar)', {
        def: '',
        validar: (v) => (v === '' ? null : /\.(png|jpe?g|webp)$/i.test(v) ? null : 'Tiene que ser png, jpg o webp'),
      })

  rl.close()

  // ---- 2. Gids desde /pubhtml ----------------------------------------------
  console.log('\n→ Leyendo las pestañas de la planilla…')
  const html = await fetch(pubhtmlUrl(urlRaw)).then((r) => {
    if (!r.ok) fail(`Google respondió ${r.status} al pedir /pubhtml. ¿La planilla está publicada en la web?`)
    return r.text()
  })
  const pestanas = parsearPestanas(html)
  if (pestanas.length === 0) fail('No encontré pestañas en /pubhtml. ¿La planilla está publicada con TODAS las pestañas?')
  let gids
  try {
    gids = elegirGids(pestanas)
  } catch (e) {
    fail((e as Error).message)
  }
  console.log(`  ✓ ofertas gid=${gids.gidOfertas}, config gid=${gids.gidConfig}`)
  const csvUrl = csvUrlBase(urlRaw)

  // ---- 3. Logo a Cloudinary ------------------------------------------------
  if (logoPath) {
    const cloud = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const apiKey = env.CLOUDINARY_API_KEY
    const apiSecret = env.CLOUDINARY_API_SECRET
    if (!cloud || !apiKey || !apiSecret) {
      fail('Faltan NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET en .env.local')
    }
    if (!(await existe(logoPath))) fail(`No existe el archivo ${logoPath}`)

    console.log('→ Subiendo el logo a Cloudinary…')
    const publicId = await subirLogoCloudinary({ cloud, apiKey, apiSecret, slug, ruta: logoPath })
    console.log(`  ✓ ${publicId}`)
  } else {
    console.log('→ Logo: saltado. Subilo después como logos/' + slug)
  }

  // ---- 4. Env en Vercel ----------------------------------------------------
  // Antes de escribir archivos: si Vercel falla, el repo queda sin tocar.
  const key = envKeyCsv(slug)
  if (SIN_VERCEL) {
    console.log(`→ Vercel: saltado (--sin-vercel). Cargá a mano ${key}`)
  } else {
    const token = env.VERCEL_TOKEN
    const projectId = env.VERCEL_PROJECT_ID
    if (!token || !projectId) fail('Faltan VERCEL_TOKEN / VERCEL_PROJECT_ID en .env.local (o usá --sin-vercel)')
    console.log('→ Creando la variable en Vercel…')
    try {
      await subirEnvCsvVercel({ token, projectId, teamId: env.VERCEL_TEAM_ID }, slug, csvUrl, `CSV publicado de ${nombre} (npm run alta)`)
    } catch (e) {
      fail(`${(e as Error).message}. No se escribió nada en el repo.`)
    }
    console.log(`  ✓ ${key} en Vercel (production, preview, development)`)
  }

  // ---- 5. Archivos del repo y .env.local ----------------------------------
  const paleta = derivarPaleta(primario, secundario)
  await escribirArchivosTenant({ slug, nombre, eslogan, badgeOferta, whatsapp, instagram, horarios, paleta, gids }, csvUrl)
  console.log(`→ Escrito ${tenantPath}, registrado en tenants/index.ts y ${key} en .env.local`)

  // ---- 6. Fila del cliente en Supabase -------------------------------------
  /*
   * Sin esta fila las teles del cliente no se registran ni se pueden bloquear.
   * Nace con requiere_activacion = true: el panel /admin ya puede darles de
   * alta con codigo. Si falla algo, no se corta el alta: se avisa y se sigue.
   */
  if (SIN_SUPABASE) {
    console.log(`→ Supabase: saltado (--sin-supabase). Cargá la fila en comercios a mano (slug ${slug}, requiere_activacion true)`)
  } else {
    console.log('→ Creando la fila en comercios…')
    const { ok, mensaje } = await crearFilaComercio({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }, slug)
    console.log(`  ${ok ? '✓' : '✖'} ${mensaje}`)
  }

  // ---- 7. Tests -----------------------------------------------------------
  console.log('\n→ npm test')
  try {
    execSync('npm test', { stdio: 'inherit' })
  } catch {
    fail('Los tests fallaron. Revisá el archivo generado antes de commitear.')
  }

  console.log(`
✓ Alta lista: ${nombre} (${slug})

  Archivos:   ${tenantPath}, tenants/index.ts
  URL de TV:  https://<dominio>/${slug}  (Start URL definitiva; la tele muestra el código)
  API:        https://<dominio>/api/${slug}/ofertas

Listo para commitear. Recordá: el push deploya al instante para todos los
comercios — fuera del horario de atención si alguno ya está en producción.
`)
}

main().catch((e) => fail((e as Error).message))
