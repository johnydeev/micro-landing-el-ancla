/*
 * Subida del logo a Cloudinary, compartida por `npm run alta` y
 * `npm run alta-express`. Firma el upload con sha1 (ver firmaCloudinary en
 * lib/alta.ts) y lo deja en `logos/<slug>` con overwrite.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { firmaCloudinary } from './alta.ts'

export interface DatosLogo {
  cloud: string
  apiKey: string
  apiSecret: string
  slug: string
  ruta: string
}

export async function subirLogoCloudinary({ cloud, apiKey, apiSecret, slug, ruta }: DatosLogo): Promise<string> {
  const publicId = `logos/${slug}`
  const timestamp = Math.floor(Date.now() / 1000)
  const params = { public_id: publicId, overwrite: true, timestamp }

  const form = new FormData()
  form.set('file', new Blob([await readFile(ruta)]), path.basename(ruta))
  form.set('api_key', apiKey)
  form.set('timestamp', String(timestamp))
  form.set('public_id', publicId)
  form.set('overwrite', 'true')
  form.set('signature', firmaCloudinary(params, apiSecret))

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form })
  const body = (await res.json()) as { public_id?: string; error?: { message: string } }
  if (!res.ok || !body.public_id) {
    throw new Error(`Cloudinary: ${body.error?.message ?? res.status}`)
  }
  return body.public_id
}
