'use client'

import { useActionState } from 'react'

import BotonAccion from '@/components/BotonAccion'

import styles from '../admin.module.css'
import { entrar, type EstadoLogin } from './actions'

const INICIAL: EstadoLogin = { error: null }

export default function FormLogin() {
  const [estado, accion, pendiente] = useActionState(entrar, INICIAL)
  return (
    <form action={accion} className={styles.tarjeta}>
      <h1 className={styles.titulo}>Panel</h1>
      <div className={styles.campo}>
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
      </div>
      {estado.error && (
        <p role="alert" className={styles.error}>
          {estado.error}
        </p>
      )}
      <BotonAccion type="submit" pendiente={pendiente}>
        Entrar
      </BotonAccion>
    </form>
  )
}
