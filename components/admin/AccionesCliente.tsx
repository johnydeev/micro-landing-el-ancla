'use client'

import { useId, useState } from 'react'

import { cambiarFechaPago, cambiarTodas, darDeBaja, nuevaTele, registrarPago } from '@/app/admin/actions'
import BotonAccion from '@/components/BotonAccion'

import styles from './acciones.module.css'
import SelectorRubros from './SelectorRubros'
import { useAccion } from './useAccion'

interface Props {
  slug: string
  nombre: string
  pagadoHasta: string | null
  cantidadTeles: number
  algunaPrendida: boolean
  opciones: string[]
}

type Panel = 'nueva' | 'baja' | null

/* Acciones de un cliente activo: fecha de pago, Pago, Apagar/Prender todas, Nueva tele, Dar de baja. */
export default function AccionesCliente({ slug, nombre, pagadoHasta, cantidadTeles, algunaPrendida, opciones }: Props) {
  const fecha = useAccion()
  const pago = useAccion()
  const todas = useAccion()
  const [panel, setPanel] = useState<Panel>(null)
  const idFecha = useId()

  function guardarFecha(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const valor = new FormData(e.currentTarget).get('fecha')
    fecha.correr(() => cambiarFechaPago(slug, typeof valor === 'string' ? valor : ''))
  }

  function alternarPanel(p: Exclude<Panel, null>) {
    setPanel((actual) => (actual === p ? null : p))
  }

  const errorPago = fecha.error ?? pago.error

  return (
    <div className={styles.accionesCliente}>
      {/* key: al cambiar la fecha en la base, el campo toma el valor nuevo. */}
      <form key={pagadoHasta ?? ''} className={styles.fila} onSubmit={guardarFecha}>
        <label htmlFor={idFecha} className={styles.etiquetaFecha}>
          Fecha de pago
        </label>
        <input
          id={idFecha}
          name="fecha"
          type="date"
          required
          defaultValue={pagadoHasta ?? ''}
          className={styles.inputFecha}
          disabled={fecha.pendiente}
        />
        <BotonAccion type="submit" pendiente={fecha.pendiente}>
          Guardar fecha
        </BotonAccion>
        <BotonAccion
          pendiente={pago.pendiente}
          onClick={() => pago.correr(() => registrarPago(slug))}
        >
          Pagó
        </BotonAccion>
      </form>
      {errorPago && (
        <p role="alert" className={styles.error}>
          {errorPago}
        </p>
      )}

      <div className={styles.fila}>
        {cantidadTeles > 0 && (
          <BotonAccion
            pendiente={todas.pendiente}
            onClick={() => todas.correr(() => cambiarTodas(slug, !algunaPrendida))}
          >
            {algunaPrendida ? 'Apagar todas' : 'Prender todas'}
          </BotonAccion>
        )}
        <button
          type="button"
          className={styles.secundario}
          aria-expanded={panel === 'nueva'}
          onClick={() => alternarPanel('nueva')}
        >
          Nueva tele
        </button>
        <button
          type="button"
          className={`${styles.secundario} ${styles.peligro}`}
          aria-expanded={panel === 'baja'}
          onClick={() => alternarPanel('baja')}
        >
          Dar de baja
        </button>
      </div>
      {todas.error && (
        <p role="alert" className={styles.error}>
          {todas.error}
        </p>
      )}

      {panel === 'nueva' && <PanelNuevaTele slug={slug} opciones={opciones} alCerrar={() => setPanel(null)} />}
      {panel === 'baja' && <PanelBaja slug={slug} nombre={nombre} alCerrar={() => setPanel(null)} />}
    </div>
  )
}

function PanelNuevaTele({ slug, opciones, alCerrar }: { slug: string; opciones: string[]; alCerrar: () => void }) {
  const alta = useAccion()
  const [codigo, setCodigo] = useState('')
  const [elegidos, setElegidos] = useState<string[]>([])
  const idCodigo = useId()

  function activar(e: React.FormEvent) {
    e.preventDefault()
    alta.correr(() => nuevaTele(slug, codigo, elegidos), alCerrar)
  }

  return (
    <form className={styles.panel} onSubmit={activar}>
      <div className={styles.campo}>
        <label htmlFor={idCodigo}>Código que muestra la tele</label>
        <input
          id={idCodigo}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="K7M-2QX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          required
          className={styles.inputCodigo}
          disabled={alta.pendiente}
        />
      </div>
      <SelectorRubros opciones={opciones} valor={elegidos} onChange={setElegidos} disabled={alta.pendiente} />
      {alta.error && (
        <p role="alert" className={styles.error}>
          {alta.error}
        </p>
      )}
      <div className={styles.fila}>
        <BotonAccion type="submit" pendiente={alta.pendiente}>
          Activar tele
        </BotonAccion>
        <button type="button" className={styles.secundario} onClick={alCerrar} disabled={alta.pendiente}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function PanelBaja({ slug, nombre, alCerrar }: { slug: string; nombre: string; alCerrar: () => void }) {
  const baja = useAccion()
  const [password, setPassword] = useState('')
  const idPassword = useId()

  function confirmar(e: React.FormEvent) {
    e.preventDefault()
    baja.correr(() => darDeBaja(slug, password))
  }

  return (
    <form className={styles.panel} onSubmit={confirmar}>
      <p className={styles.nota}>
        {nombre}{' '}pasa a Bajas y sus teles muestran &quot;Pantalla no habilitada&quot;. Se puede reactivar.
      </p>
      <div className={styles.campo}>
        <label htmlFor={idPassword}>Contraseña</label>
        <input
          id={idPassword}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={baja.pendiente}
        />
      </div>
      {baja.error && (
        <p role="alert" className={styles.error}>
          {baja.error}
        </p>
      )}
      <div className={styles.fila}>
        <BotonAccion type="submit" pendiente={baja.pendiente} className={styles.botonPeligro}>
          Confirmar baja
        </BotonAccion>
        <button type="button" className={styles.secundario} onClick={alCerrar} disabled={baja.pendiente}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
