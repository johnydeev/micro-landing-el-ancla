import Link from 'next/link'

import styles from './panel.module.css'

/* Navegacion entre Clientes y Bajas. */
export default function NavAdmin({ actual }: { actual: 'clientes' | 'bajas' }) {
  return (
    <nav className={styles.nav} aria-label="Secciones del panel">
      <Link href="/admin" className={styles.navLink} aria-current={actual === 'clientes' ? 'page' : undefined}>
        Clientes
      </Link>
      <Link
        href="/admin/bajas"
        className={styles.navLink}
        aria-current={actual === 'bajas' ? 'page' : undefined}
      >
        Bajas
      </Link>
    </nav>
  )
}
