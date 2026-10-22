'use client'

import { reactivar } from '@/app/admin/actions'
import BotonAccion from '@/components/BotonAccion'

import styles from './acciones.module.css'
import { useAccion } from './useAccion'

/* Vista Bajas: un clic, sin contrasena (dado_de_baja = false; todo vuelve como estaba). */
export default function BotonReactivar({ slug }: { slug: string }) {
  const accion = useAccion()
  return (
    <div className={styles.accionesCliente}>
      <div className={styles.fila}>
        <BotonAccion pendiente={accion.pendiente} onClick={() => accion.correr(() => reactivar(slug))}>
          Reactivar
        </BotonAccion>
      </div>
      {accion.error && (
        <p role="alert" className={styles.error}>
          {accion.error}
        </p>
      )}
    </div>
  )
}
