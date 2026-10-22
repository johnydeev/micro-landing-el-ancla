import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import {
  COOKIE_ADMIN,
  SESION_ADMIN_MS,
  firmarSesion,
  passwordCorrecta,
  verificarSesion,
} from '@/lib/admin-sesion'

/*
 * Sesion y contrasena del panel /admin. Sin ACTIVACION_SECRET o sin
 * ADMIN_PASSWORD nadie entra (a diferencia de las teles, aca ante la duda se
 * niega: es el panel, no una pantalla de precios).
 */

export const OPCIONES_COOKIE_ADMIN = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/admin',
  maxAge: SESION_ADMIN_MS / 1000,
}

const ESPERA_FALLO_MS = 1000

/* Hay sesion valida? (sin redirigir) */
export async function haySesion(): Promise<boolean> {
  const secreto = process.env.ACTIVACION_SECRET
  if (!secreto || !process.env.ADMIN_PASSWORD) return false
  const valor = (await cookies()).get(COOKIE_ADMIN)?.value
  return verificarSesion(valor, Date.now(), secreto, process.env.ADMIN_PASSWORD)
}

/* Pages y CADA Server Action del panel la llaman primero. */
export async function exigirSesion(): Promise<void> {
  if (!(await haySesion())) redirect('/admin/login')
}

/* Verifica ADMIN_PASSWORD; si falla, espera 1 s (frena fuerza bruta). */
export async function exigirPassword(input: string): Promise<boolean> {
  if (passwordCorrecta(input, process.env.ADMIN_PASSWORD)) return true
  await new Promise((r) => setTimeout(r, ESPERA_FALLO_MS))
  return false
}

/* Crea la cookie de sesion. Devuelve false si no hay con que firmar. */
export async function abrirSesion(): Promise<boolean> {
  const secreto = process.env.ACTIVACION_SECRET
  const password = process.env.ADMIN_PASSWORD
  if (!secreto || !password) return false
  const jar = await cookies()
  jar.set(COOKIE_ADMIN, firmarSesion(Date.now(), secreto, password), OPCIONES_COOKIE_ADMIN)
  return true
}
