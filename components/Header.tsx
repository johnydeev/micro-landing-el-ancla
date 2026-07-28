'use client'

import { memo, useState } from 'react'
import { negocioConfig } from '@/config/negocio'
import styles from './Header.module.css'

// Sin props: siempre renderiza igual. `memo` evita que el rotador de
// PantallaRotativa (tick cada 3-12s, horas seguidas) vuelva a ejecutar y
// reconciliar este subarbol en cada cambio de indice de la rotacion.
function Header() {
  const [imgError, setImgError] = useState(false)

  return (
    <header className={styles.header} style={{ background: negocioConfig.colores.primario }}>
      <div className={styles.brandRow}>
        <div
          style={{
            background: 'white',
            borderRadius: '8px',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {imgError ? null : (
            <img
              src={negocioConfig.logo}
              alt={negocioConfig.nombre}
              width={100}
              height={100}
              style={{ height: 'clamp(50px, 8vh, 100px)', width: 'auto' }}
              onError={() => setImgError(true)}
            />
          )}
        </div>
        <div className={styles.brandCopy}>
          <span className={styles.brandName}>{negocioConfig.nombre}</span>
          <span className={styles.brandTagline}>{negocioConfig.eslogan}</span>
        </div>
      </div>
    </header>
  )
}

export default memo(Header)
