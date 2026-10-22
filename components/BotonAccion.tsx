'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

import styles from './BotonAccion.module.css'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode
  pendiente: boolean
  /* Boton de solo icono: mientras corre, el spinner REEMPLAZA al contenido. */
  soloIcono?: boolean
}

/*
 * Boton para toda accion asincrona del panel: spinner + disabled mientras
 * `pendiente`. Con texto, el spinner va al lado del texto; de solo icono,
 * reemplaza el icono.
 */
export default function BotonAccion({
  children,
  pendiente,
  soloIcono = false,
  disabled,
  className,
  type = 'button',
  ...resto
}: Props) {
  const clases = [styles.boton, soloIcono ? styles.soloIcono : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <button {...resto} type={type} className={clases} disabled={disabled || pendiente} aria-busy={pendiente}>
      {pendiente && <span className={styles.spinner} aria-hidden="true" />}
      {!(pendiente && soloIcono) && children}
    </button>
  )
}
