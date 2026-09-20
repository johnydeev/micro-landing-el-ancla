'use client'

import type { ListaPrecios } from '@/types'
import { formatPrecio } from '@/lib/precio'
import styles from '@/app/page.module.css'

export interface TablaProps {
  lista: ListaPrecios | null
  /** Primera linea del empty state (tenant.textos.sinDatos). */
  textoSinDatos: string
  /** WhatsApp a mostrar en el empty state. */
  whatsapp: string
}

/*
 * Unico diseno de tabla del catalogo. Sin colores fijos: todo entra por las
 * CSS vars (--c-*) que PantallaRotativa inyecta en .screen desde la paleta
 * del tenant. Mismo componente, otra paleta = otro cliente.
 */
export default function TablaClasica({ lista, textoSinDatos, whatsapp }: TablaProps) {
  const productos = lista?.productos ?? []

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headRow}>
            <th className={styles.superHeadCell} colSpan={2}>
              {lista?.titulo ?? 'Lista de Precios'}
            </th>
          </tr>
        </thead>
        <tbody>
          {productos.length > 0 ? (
            productos.map((producto, i) => (
              <tr key={`${producto.nombre}-${i}`} className={styles.row}>
                <td className={`${styles.cellBase} ${styles.descriptionCell}`}>
                  {producto.nombre}
                </td>
                <td className={`${styles.cellBase} ${styles.priceCell}`}>
                  <div className={styles.priceInline}>
                    <span className={styles.priceValue}>{formatPrecio(producto.precio)}</span>
                    {producto.unidad && (
                      <span className={styles.unitValue}>por {producto.unidad}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={2} className={`${styles.cellBase} ${styles.emptyState}`}>
                <div>{textoSinDatos}</div>
                <div className={styles.emptyStateContact}>Consultá por {whatsapp}</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
