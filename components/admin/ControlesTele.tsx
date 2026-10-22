'use client'

import { useId, useState } from 'react'

import { cambiarRubros, cambiarSwitch } from '@/app/admin/actions'
import BotonAccion from '@/components/BotonAccion'

import styles from './acciones.module.css'
import SelectorRubros from './SelectorRubros'
import { useAccion } from './useAccion'

interface Props {
  teleId: string
  activa: boolean
  rubros: string[] | null
  /* "Vacuno", "Todo"... para el nombre accesible del switch. */
  etiqueta: string
  opciones: string[]
}

/* Switch prendida/apagada y "Cambiar rubros" (pide contrasena) de una tele. */
export default function ControlesTele({ teleId, activa, rubros, etiqueta, opciones }: Props) {
  const sw = useAccion()
  const cambio = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [elegidos, setElegidos] = useState<string[]>(rubros ?? [])
  const [password, setPassword] = useState('')
  const idPassword = useId()

  function abrir() {
    setElegidos(rubros ?? [])
    setPassword('')
    cambio.limpiarError()
    setAbierto((a) => !a)
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault()
    cambio.correr(
      () => cambiarRubros(teleId, elegidos, password),
      () => {
        setAbierto(false)
        setPassword('')
      },
    )
  }

  return (
    <div className={styles.controlesTele}>
      <div className={styles.fila}>
        <BotonAccion
          role="switch"
          aria-checked={activa}
          aria-label={`Tele ${etiqueta} (${teleId}) prendida`}
          pendiente={sw.pendiente}
          className={styles.switch}
          data-activa={activa}
          onClick={() => sw.correr(() => cambiarSwitch(teleId, !activa))}
        >
          <span className={styles.pista} aria-hidden="true">
            <span className={styles.perilla} />
          </span>
          <span aria-hidden="true">{activa ? 'Prendida' : 'Apagada'}</span>
        </BotonAccion>
        <button type="button" className={styles.secundario} aria-expanded={abierto} onClick={abrir}>
          Cambiar rubros
        </button>
      </div>
      {sw.error && (
        <p role="alert" className={styles.error}>
          {sw.error}
        </p>
      )}

      {abierto && (
        <form className={styles.panel} onSubmit={guardar}>
          <SelectorRubros opciones={opciones} valor={elegidos} onChange={setElegidos} disabled={cambio.pendiente} />
          <div className={styles.campo}>
            <label htmlFor={idPassword}>Contraseña</label>
            <input
              id={idPassword}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={cambio.pendiente}
            />
          </div>
          {cambio.error && (
            <p role="alert" className={styles.error}>
              {cambio.error}
            </p>
          )}
          <div className={styles.fila}>
            <BotonAccion type="submit" pendiente={cambio.pendiente}>
              Guardar rubros
            </BotonAccion>
            <button
              type="button"
              className={styles.secundario}
              onClick={() => setAbierto(false)}
              disabled={cambio.pendiente}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
