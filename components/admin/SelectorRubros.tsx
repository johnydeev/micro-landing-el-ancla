'use client'

import { useId } from 'react'

import styles from './acciones.module.css'

interface Props {
  /* Rubros de la planilla del cliente (canonicos). */
  opciones: string[]
  /* Marcados; [] = Todo. */
  valor: string[]
  onChange: (rubros: string[]) => void
  disabled?: boolean
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/*
 * Casillas de rubros + "Todo" excluyente: marcar "Todo" desmarca el resto;
 * marcar un rubro desmarca "Todo"; ninguno marcado = Todo.
 */
export default function SelectorRubros({ opciones, valor, onChange, disabled }: Props) {
  const base = useId()
  /* Un rubro guardado que ya no esta en la planilla se sigue mostrando (no se pierde en silencio). */
  const todas = [...new Set([...opciones, ...valor])].sort((a, b) => a.localeCompare(b, 'es'))
  const esTodo = valor.length === 0

  function alternar(rubro: string, marcado: boolean) {
    onChange(marcado ? [...valor, rubro] : valor.filter((r) => r !== rubro))
  }

  return (
    <fieldset className={styles.rubros} disabled={disabled}>
      <legend>Qué muestra</legend>
      <label className={styles.casilla} htmlFor={`${base}-todo`}>
        <input id={`${base}-todo`} type="checkbox" checked={esTodo} onChange={() => onChange([])} />
        Todo
      </label>
      {todas.map((rubro, i) => (
        <label key={rubro} className={styles.casilla} htmlFor={`${base}-${i}`}>
          <input
            id={`${base}-${i}`}
            type="checkbox"
            checked={valor.includes(rubro)}
            onChange={(e) => alternar(rubro, e.target.checked)}
          />
          {capitalizar(rubro)}
        </label>
      ))}
      {opciones.length === 0 && <p className={styles.nota}>No se pudo leer la planilla: solo &quot;Todo&quot;.</p>}
    </fieldset>
  )
}
