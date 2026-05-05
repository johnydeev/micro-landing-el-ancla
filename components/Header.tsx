'use client'

import { useState } from 'react'
import { negocioConfig } from '@/config/negocio'
import styles from './Header.module.css'

export default function Header() {
  const [imgError, setImgError] = useState(false)

  return (
    <header className={styles.header} style={{ background: negocioConfig.colores.primario }}>
      <div className={styles.brandRow}>
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '6px',
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
