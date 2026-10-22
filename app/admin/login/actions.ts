'use server'

import { redirect } from 'next/navigation'

import { abrirSesion, exigirPassword } from '@/lib/admin-auth'

export type EstadoLogin = { error: string | null }

export async function entrar(_previo: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const password = formData.get('password')
  if (typeof password !== 'string' || !(await exigirPassword(password))) {
    return { error: 'Contraseña incorrecta' }
  }
  if (!(await abrirSesion())) return { error: 'El panel no está configurado' }
  // redirect lanza una excepcion interna: va fuera de cualquier try/catch.
  redirect('/admin')
}
