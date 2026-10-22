import type { ClienteAdmin } from '@/lib/admin-datos'
import { avisoPago, ordenarAvisos } from '@/lib/panel'

import styles from './panel.module.css'

function plural(dias: number): string {
  return dias === 1 ? '1 día' : `${dias} días`
}

/* Avisos de pago arriba del panel. Sin avisos no se muestra nada. */
export default function Avisos({ clientes, ahoraMs }: { clientes: ClienteAdmin[]; ahoraMs: number }) {
  const avisos = ordenarAvisos(
    clientes.flatMap((c) => {
      const aviso = avisoPago(c.pagadoHasta, ahoraMs)
      return aviso ? [{ cliente: c, aviso }] : []
    }),
  )
  if (avisos.length === 0) return null

  return (
    <section className={styles.avisos} aria-label="Avisos de pago">
      <ul>
        {avisos.map(({ cliente, aviso }) => (
          <li key={cliente.slug} className={styles.aviso} data-tipo={aviso.tipo}>
            <strong>{cliente.nombre}</strong>{' '}
            {aviso.tipo === 'vencido'
              ? `venció hace ${plural(aviso.dias)}`
              : aviso.dias === 0
                ? 'vence hoy'
                : `vence en ${plural(aviso.dias)}`}
          </li>
        ))}
      </ul>
    </section>
  )
}
