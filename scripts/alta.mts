/*
 * Alta de un cliente desde un solo lugar: `npm run alta`.
 *
 * Pregunta los datos del comercio, resuelve los gids de su planilla a partir
 * de la URL publicada, sube el logo a Cloudinary, escribe tenants/<slug>.ts,
 * lo registra en tenants/index.ts, crea la env TENANT_<SLUG>_CSV_URL en
 * Vercel y en .env.local, y corre los tests. Lo unico que no hace: crear la
 * planilla (copia de la planilla modelo) y el commit.
 *
 * Secretos: solo en .env.local (CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
 * VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID opcional). El script corre
 * con `node --env-file=.env.local`.
 *
 * Flags: --force (sobreescribir un tenant existente), --sin-logo,
 * --sin-vercel (no toca Vercel; util sin token).
 *
 * Spec: docs/superpowers/specs/2026-09-20-alta-de-cliente-design.md
 */

import { readFile, writeFile, access } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout, argv, env, exit } from 'node:process'
import { execSync } from 'node:child_process'
import path from 'node:path'

import {
  slugificar,
  SLUG_RE,
  HEX_RE,
  pubhtmlUrl,
  csvUrlBase,
  parsearPestanas,
  elegirGids,
  derivarPaleta,
  generarTenantTs,
  insertarEnRegistro,
  firmaCloudinary,
  envKeyCsv,
  upsertEnv,
} from '../lib/alta.ts'

const flags = new Set(argv.slice(2))
const FORCE = flags.has('--force')
const SIN_LOGO = flags.has('--sin-logo')
const SIN_VERCEL = flags.has('--sin-vercel')

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

async function existe(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log('\nAlta de cliente — cartelería de precios\n')

  // ---- 1. Datos -----------------------------------------------------------
  const nombre = await preguntar('Nombre del comercio', { validar: (v) => (v ? null : 'No puede estar vacío') })
  const slug = await preguntar('Slug (URL)', {
    def: slugificar(nombre),
    validar: (v) => (SLUG_RE.test(v) ? null : 'Solo minúsculas, números y guiones'),
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
    const publicId = `logos/${slug}`
    const timestamp = Math.floor(Date.now() / 1000)
    const params = { public_id: publicId, overwrite: true, timestamp }
    const form = new FormData()
    form.set('file', new Blob([await readFile(logoPath)]), path.basename(logoPath))
    form.set('api_key', apiKey)
    form.set('timestamp', String(timestamp))
    form.set('public_id', publicId)
    form.set('overwrite', 'true')
    form.set('signature', firmaCloudinary(params, apiSecret))
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form })
    const body = (await res.json()) as { public_id?: string; error?: { message: string } }
    if (!res.ok || !body.public_id) fail(`Cloudinary: ${body.error?.message ?? res.status}`)
    console.log(`  ✓ ${body.public_id}`)
  } else {
    console.log('→ Logo: saltado. Subilo después como logos/' + slug)
  }

  // ---- 4. Archivos del repo ------------------------------------------------
  const paleta = derivarPaleta(primario, secundario)
  await writeFile(
    tenantPath,
    generarTenantTs({ slug, nombre, eslogan, badgeOferta, whatsapp, instagram, horarios, paleta, gids }),
    'utf8',
  )
  const indexPath = path.join('tenants', 'index.ts')
  await writeFile(indexPath, insertarEnRegistro(await readFile(indexPath, 'utf8'), slug), 'utf8')
  console.log(`→ Escrito ${tenantPath} y registrado en ${indexPath}`)

  // ---- 5. Env: .env.local + Vercel -----------------------------------------
  const key = envKeyCsv(slug)
  const envLocalPath = '.env.local'
  const envLocal = (await existe(envLocalPath)) ? await readFile(envLocalPath, 'utf8') : ''
  await writeFile(envLocalPath, upsertEnv(envLocal, key, csvUrl), 'utf8')
  console.log(`→ ${key} agregada a .env.local`)

  if (SIN_VERCEL) {
    console.log(`→ Vercel: saltado (--sin-vercel). Cargá a mano ${key}`)
  } else {
    const token = env.VERCEL_TOKEN
    const project = env.VERCEL_PROJECT_ID
    if (!token || !project) fail('Faltan VERCEL_TOKEN / VERCEL_PROJECT_ID en .env.local (o usá --sin-vercel)')
    console.log('→ Creando la variable en Vercel…')
    const team = env.VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : ''
    const res = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/env?upsert=true${team}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        value: csvUrl,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
        comment: `CSV publicado de ${nombre} (npm run alta)`,
      }),
    })
    const body = (await res.json()) as { error?: { message: string }; failed?: unknown[] }
    if (!res.ok || (body.failed && body.failed.length > 0)) {
      fail(`Vercel: ${body.error?.message ?? JSON.stringify(body.failed) ?? res.status}`)
    }
    console.log(`  ✓ ${key} en Vercel (production, preview, development)`)
  }

  // ---- 6. Tests -----------------------------------------------------------
  console.log('\n→ npm test')
  try {
    execSync('npm test', { stdio: 'inherit' })
  } catch {
    fail('Los tests fallaron. Revisá el archivo generado antes de commitear.')
  }

  console.log(`
✓ Alta lista: ${nombre} (${slug})

  Archivos:   ${tenantPath}, tenants/index.ts
  URL de TV:  https://<dominio>/${slug}
  API:        https://<dominio>/api/${slug}/ofertas

Listo para commitear. Recordá: el push deploya al instante para todos los
comercios — fuera del horario de atención si alguno ya está en producción.
`)
}

main().catch((e) => fail((e as Error).message))
