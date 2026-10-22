import type { ReactNode } from 'react'

import type { ClienteAdmin, TeleAdmin } from '@/lib/admin-datos'
import { etiquetaRubros, etiquetasRepetidas, fechaArgentina } from '@/lib/panel'

import FilaTele from './FilaTele'
import styles from './panel.module.css'

interface Props {
  cliente: ClienteAdmin
  ahoraMs: number
  /* Pago, fecha, Apagar/Prender todas, Nueva tele, Dar de baja / Reactivar. */
  acciones?: ReactNode
  /* Controles de cada tele (switch, Cambiar rubros). */
  controlesTele?: (tele: TeleAdmin) => ReactNode
}

/* Tarjeta de un cliente con sus teles. Solo muestra; las acciones llegan por props. */
export default function TarjetaCliente({ cliente, ahoraMs, acciones, controlesTele }: Props) {
  const repetidas = etiquetasRepetidas(cliente.teles)
  return (
    <article className={styles.cliente}>
      <header className={styles.clienteCabecera}>
        <h2 className={styles.clienteNombre}>{cliente.nombre}</h2>
        <p className={styles.pago}>
          Pagado hasta:{' '}
          <strong>{cliente.pagadoHasta ? fechaArgentina(cliente.pagadoHasta) : 'sin fecha'}</strong>
        </p>
      </header>

      {acciones && <div className={styles.acciones}>{acciones}</div>}

      {cliente.teles.length === 0 ? (
        <p className={styles.vacio}>Sin teles todavía.</p>
      ) : (
        <ul className={styles.teles}>
          {cliente.teles.map((tele) => (
            <FilaTele
              key={tele.id}
              tele={tele}
              ahoraMs={ahoraMs}
              mostrarId={repetidas.has(etiquetaRubros(tele.rubros))}
              controles={controlesTele?.(tele)}
            />
          ))}
        </ul>
      )}
    </article>
  )
}
