/*
 * OAuth de Google, una sola vez: `npm run google-auth`.
 *
 * Abre el navegador para autorizar Drive + Sheets con tu cuenta y guarda
 * GOOGLE_OAUTH_REFRESH_TOKEN en .env.local. Lo usa `npm run alta-express`.
 *
 * Requiere en .env.local:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 * (Credenciales > ID de cliente OAuth > App de escritorio en Google Cloud.)
 *
 * Nota: si la app de OAuth queda en modo "Testing", Google vence el refresh
 * token a los 7 días. En ese caso se vuelve a correr este comando.
 */

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { env, exit, platform } from 'node:process'

import { intercambiarCodigo, urlConsentimiento } from '../lib/google.ts'
import { upsertEnv } from '../lib/alta.ts'
import { existe } from '../lib/alta-io.ts'

const clientId = env.GOOGLE_OAUTH_CLIENT_ID
const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('\n✖ Faltan GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET en .env.local')
  console.error('  Google Cloud > Credenciales > Crear credenciales > ID de cliente OAuth > App de escritorio.\n')
  exit(1)
}

const PUERTO = Number(env.GOOGLE_OAUTH_PORT ?? 53682)
if (!Number.isInteger(PUERTO) || PUERTO < 1 || PUERTO > 65535) {
  console.error(`\n✖ GOOGLE_OAUTH_PORT invalido: ${env.GOOGLE_OAUTH_PORT}\n`)
  exit(1)
}
const REDIRECT_URI = `http://127.0.0.1:${PUERTO}`
const state = randomBytes(16).toString('hex')
const url = urlConsentimiento({ clientId, redirectUri: REDIRECT_URI, state })

console.log('\nAutorización de Google — cartelería de precios\n')
console.log('1. Abrí esta URL en el navegador y autorizá Drive + Sheets:\n')
console.log(`   ${url}\n`)
console.log('2. Si el navegador no se abrió solo, copiá la URL a mano.')
console.log(`3. Esperando el callback en ${REDIRECT_URI} …\n`)

const comando =
  platform === 'win32' ? `start "" "${url}"` : platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`
exec(comando, () => {
  /* si falla, la URL ya esta impresa */
})

function html(res: import('node:http').ServerResponse, status: number, texto: string) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(
    `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:2rem">${texto}</body>`,
  )
}

const escaparHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

const server = createServer(async (req, res) => {
  const pedido = new URL(req.url ?? '/', REDIRECT_URI)
  if (pedido.pathname !== '/') {
    html(res, 404, 'Not found')
    return
  }

  const error = pedido.searchParams.get('error')
  if (error) {
    html(res, 400, `Google rechazó la autorización: ${escaparHtml(error)}`)
    console.error(`\n✖ Google rechazó la autorización: ${error}`)
    setTimeout(() => exit(1), 300)
    return
  }

  if (pedido.searchParams.get('state') !== state) {
    html(res, 400, 'State inválido. Volvé a correr el comando.')
    console.error('\n✖ State inválido (posible CSRF). Volvé a correr el comando.')
    setTimeout(() => exit(1), 300)
    return
  }

  const code = pedido.searchParams.get('code')
  if (!code) {
    html(res, 400, 'Falta el código de autorización.')
    console.error('\n✖ Falta el código de autorización.')
    setTimeout(() => exit(1), 300)
    return
  }

  try {
    const { refreshToken } = await intercambiarCodigo({ clientId, clientSecret }, code, REDIRECT_URI)
    const ruta = '.env.local'
    const actual = (await existe(ruta)) ? await readFile(ruta, 'utf8') : ''
    await writeFile(ruta, upsertEnv(actual, 'GOOGLE_OAUTH_REFRESH_TOKEN', refreshToken), 'utf8')
    html(res, 200, '<h2>Listo</h2><p>Refresh token guardado en <code>.env.local</code>. Podés cerrar esta pestaña.</p>')
    console.log('✓ GOOGLE_OAUTH_REFRESH_TOKEN guardado en .env.local\n')
    setTimeout(() => {
      server.close()
      exit(0)
    }, 300)
  } catch (e) {
    const mensaje = (e as Error).message
    html(res, 500, `Error: ${escaparHtml(mensaje)}`)
    console.error(`\n✖ ${mensaje}`)
    setTimeout(() => exit(1), 300)
  }
})

server.on('error', (e) => {
  console.error(`\n✖ No pude escuchar en ${REDIRECT_URI}: ${e.message}`)
  console.error('  Probá con otro puerto: GOOGLE_OAUTH_PORT=53683 npm run google-auth\n')
  exit(1)
})

server.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Escuchando en ${REDIRECT_URI} (Ctrl+C para cancelar)\n`)
})

setTimeout(() => {
  console.error('\n✖ Pasaron 5 minutos sin autorización. Volvé a correr el comando.\n')
  server.close()
  exit(1)
}, 5 * 60 * 1000)
