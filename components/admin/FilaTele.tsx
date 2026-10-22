import type { ReactNode } from 'react'

import type { TeleAdmin } from '@/lib/admin-datos'
import { type ColorBadge, colorBadge, etiquetaRubros, haceCuanto } from '@/lib/panel'

import styles from './panel.module.css'

const TEXTO_BADGE: Record<ColorBadge, string> = {
  verde: 'Conectada',
  ambar: 'Demorada',
  rojo: 'Sin conexión',
  gris: 'Apagada',
}

interface Props {
  tele: TeleAdmin
  ahoraMs: number
  /* Dos teles del cliente muestran lo mismo: se agrega el id corto para distinguirlas. */
  mostrarId: boolean
  /* Switch y "Cambiar rubros". */
  controles?: ReactNode
}

/* Una tele: que muestra, badge de conexion y hace cuanto se conecto. */
export default function FilaTele({ tele, ahoraMs, mostrarId, controles }: Props) {
  const color = colorBadge(tele, ahoraMs)
  return (
    <li className={styles.tele}>
      <div className={styles.teleInfo}>
        <span className={styles.teleRubros}>{etiquetaRubros(tele.rubros)}</span>
        {mostrarId && <span className={styles.teleId}>{tele.id}</span>}
      </div>
      <div className={styles.teleEstado}>
        <span className={styles.badge} data-color={color}>
          <span className={styles.punto} aria-hidden="true" />
          {TEXTO_BADGE[color]}
        </span>
        <span className={styles.hace}>{haceCuanto(tele.ultimaConexion, ahoraMs)}</span>
      </div>
      {controles && <div className={styles.teleControles}>{controles}</div>}
    </li>
  )
}
