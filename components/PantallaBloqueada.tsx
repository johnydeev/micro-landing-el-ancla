import type { Tenant } from '@/types/tenant'

import styles from './PantallaBloqueada.module.css'

const TEXTOS = {
  'no-habilitada': 'Pantalla no habilitada',
  suspendida: 'Servicio suspendido',
} as const

/*
 * Lo que ve una tele sin activar o de un comercio con el pago vencido. Se
 * recarga sola cada 10 min: al activarla o al correr `pagadoHasta`, vuelve
 * sin que nadie toque el Fire TV.
 */
export default function PantallaBloqueada({
  tenant,
  motivo,
}: {
  tenant: Tenant
  motivo: keyof typeof TEXTOS
}) {
  const soporte = process.env.SOPORTE_CONTACTO

  return (
    <main
      className={styles.pantalla}
      style={{ background: tenant.paleta.primario, color: '#fff' }}
    >
      <meta httpEquiv="refresh" content="600" />
      <p className={styles.nombre}>{tenant.nombre}</p>
      <h1 className={styles.titulo}>{TEXTOS[motivo]}</h1>
      <p className={styles.detalle}>
        Comunicate con el proveedor del sistema{soporte ? `: ${soporte}` : '.'}
      </p>
    </main>
  )
}
