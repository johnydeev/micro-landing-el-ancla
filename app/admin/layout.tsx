import type { Metadata } from 'next'

import styles from './admin.module.css'

/* Panel privado: sin indexar y siempre dinamico (cookies() en cada page). */
export const metadata: Metadata = {
  title: 'Panel',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/* El body global es overflow:hidden (pantallas de TV): el panel scrollea en su propio contenedor. */
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.raiz}>
      <div className={styles.contenido}>{children}</div>
    </div>
  )
}
