import { redirect } from 'next/navigation'

import { haySesion } from '@/lib/admin-auth'

import FormLogin from './FormLogin'

export default async function LoginPage() {
  if (await haySesion()) redirect('/admin')
  return <FormLogin />
}
