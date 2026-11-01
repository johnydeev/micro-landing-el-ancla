/*
 * Cliente minimo de Google Drive + Sheets con OAuth (refresh token).
 *
 * Sin dependencias (`googleapis` pesa ~50 MB): las llamadas son fetch a las
 * APIs REST. Lo usa scripts/alta-express.mts para copiar la planilla modelo,
 * compartirla por link, leer sus pestañas y escribir la configuracion.
 *
 * Por que OAuth y no service account: una service account no tiene cuota de
 * Drive, asi que no puede ser dueña de la copia de la planilla ("Service
 * Accounts do not have storage quota"). Con el refresh token del dueño, la
 * copia queda en su Drive y no hay problema de cuota.
 *
 * Setup (una sola vez):
 *   1. Google Cloud > APIs y servicios: habilitar Drive API y Sheets API.
 *   2. Credenciales > Crear credenciales > ID de cliente OAuth > App de
 *      escritorio. Copiar client id y secret a .env.local.
 *   3. `npm run google-auth` (abre el navegador y guarda el refresh token).
 */

export interface CredencialesGoogle {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export interface PestanaPlanilla {
  nombre: string
  gid: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
]
const TIMEOUT_MS = 20_000

/* URL de consentimiento que abre scripts/google-auth.mts. Exportada para tests. */
export function urlConsentimiento({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

async function tokenRequest(body: URLSearchParams): Promise<{
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error_description?: string
  error?: string
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error_description?: string
    error?: string
  }
}

/* Canjea el codigo del callback por tokens (lo usa scripts/google-auth.mts). */
export async function intercambiarCodigo(
  cred: Pick<CredencialesGoogle, 'clientId' | 'clientSecret'>,
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string }> {
  const body = await tokenRequest(
    new URLSearchParams({
      code,
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  )
  if (!body.refresh_token) {
    throw new Error(`Google OAuth: ${body.error_description ?? body.error ?? 'no devolvio refresh_token'}`)
  }
  return { refreshToken: body.refresh_token }
}

export async function tokenGoogle(cred: CredencialesGoogle): Promise<string> {
  const body = await tokenRequest(
    new URLSearchParams({
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      refresh_token: cred.refreshToken,
      grant_type: 'refresh_token',
    }),
  )
  if (!body.access_token) {
    throw new Error(
      `Google OAuth: ${body.error_description ?? body.error ?? 'no devolvio access_token'}. ` +
        'Si el refresh token venció (apps en modo Testing duran 7 días), corré npm run google-auth.',
    )
  }
  return body.access_token
}

async function pedir<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const texto = await res.text()
  let body: unknown = null
  try {
    body = texto ? JSON.parse(texto) : null
  } catch {
    body = texto
  }
  if (!res.ok) {
    const mensaje =
      typeof body === 'object' && body !== null && 'error' in body
        ? JSON.stringify((body as { error: unknown }).error)
        : texto || String(res.status)
    throw new Error(`Google API ${res.status}: ${mensaje}`)
  }
  return body as T
}

/* Copia una planilla. La copia queda en el Drive del dueño del refresh token. */
export async function copiarPlanilla(token: string, templateId: string, nombre: string): Promise<string> {
  const body = await pedir<{ id?: string }>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(templateId)}/copy?supportsAllDrives=true&fields=id`,
    token,
    { method: 'POST', body: JSON.stringify({ name: nombre }) },
  )
  if (!body.id) throw new Error('Drive no devolvio el id de la copia')
  return body.id
}

/* Cualquiera con el link puede leer: lo necesita el fetch del CSV sin auth. */
export async function compartirLecturaPublica(token: string, fileId: string): Promise<void> {
  await pedir(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }),
    },
  )
}

/* Pestañas con su gid (sheetId de la API), en el orden del documento. */
export async function pestanasPlanilla(token: string, spreadsheetId: string): Promise<PestanaPlanilla[]> {
  const body = await pedir<{ sheets?: { properties?: { sheetId?: number; title?: string } }[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`,
    token,
  )
  return (body.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is { sheetId: number; title: string } => typeof p?.sheetId === 'number' && typeof p.title === 'string')
    .map((p) => ({ nombre: p.title, gid: String(p.sheetId) }))
}

/* Filas de un rango A1 (sin la fila de encabezados de la API). */
export async function leerRango(token: string, spreadsheetId: string, rango: string): Promise<string[][]> {
  const body = await pedir<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(rango)}`,
    token,
  )
  return body.values ?? []
}

/* Escritura multiple: [{ range: "Configuracion!B2", values: [["..."]] }] */
export async function escribirRangos(
  token: string,
  spreadsheetId: string,
  data: { range: string; values: string[][] }[],
): Promise<void> {
  if (data.length === 0) return
  await pedir(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
    },
  )
}
