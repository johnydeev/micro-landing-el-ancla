import type { CSSProperties } from 'react'

import AutoRefresh from '@/components/AutoRefresh'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import { negocioConfig } from '@/config/negocio'
import { getProductos } from '@/lib/sheets'
import styles from './page.module.css'

function formatPrecio(precio: string): string {
  const num = Number(precio)
  if (isNaN(num)) return `$${precio}`
  return `$${num.toLocaleString('es-AR')}`
}

export default async function Home() {
  const productos = await getProductos()
  const tableFontVars = {
    '--table-font-scale': `${negocioConfig.tipografia.tabla / 100}`,
  } as CSSProperties

  return (
    <main className={styles.pageShell}>
      <AutoRefresh />
      <div className={styles.screen} style={tableFontVars}>
        <Header />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.headRow}>
                <th className={styles.headCell}>Descripción</th>
                <th className={`${styles.headCell} ${styles.priceHead}`}>Precio</th>
              </tr>
            </thead>
            <tbody>
              {productos.length > 0 ? (
                productos.map((producto, i) => (
                  <tr key={`${producto.categoria}-${producto.nombre}-${i}`} className={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                    <td className={`${styles.cellBase} ${styles.descriptionCell}`}>{producto.nombre}</td>
                    <td className={`${styles.cellBase} ${styles.priceCell}`}>
                      <span className={styles.priceValue}>{formatPrecio(producto.precio)}</span>
                      {producto.unidad && <span className={styles.unitValue}>por {producto.unidad}</span>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className={`${styles.cellBase} ${styles.emptyState}`}>
                    Sin productos disponibles
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Footer />
      </div>
    </main>
  )
}
