import type { Tenant } from '@/types/tenant'

import CodigoAlta from './CodigoAlta'

import styles from './PantallaBloqueada.module.css'

const TEXTOS = {
  'no-habilitada': 'Pantalla no habilitada',
  desactivada: 'Pantalla desactivada',
} as const

/*
 * Lo que ve una tele sin activar, apagada desde la base o de un comercio dado
 * de baja. Se recarga sola cada 10 min: al activarla o prender su switch
 * (`teles.activa`) vuelve sin que nadie toque el Fire TV.
 */
export default function PantallaBloqueada({
  tenant,
  motivo,
  slug,
  conCodigo,
}: {
  tenant: Tenant
  motivo: keyof typeof TEXTOS
  /* Tenant de la pagina y si corresponde ofrecer codigo de alta (no si el comercio esta de baja). */
  slug: string
  conCodigo: boolean
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
      {motivo === 'no-habilitada' && conCodigo && <CodigoAlta slug={slug} />}
    </main>
  )
}
