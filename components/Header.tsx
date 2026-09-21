'use client'

import { memo, useState } from 'react'

import type { Tenant } from '@/types/tenant'
import { urlLogo } from '@/lib/cloudinary'
import styles from './Header.module.css'

interface HeaderProps {
  tenant: Tenant
}

// `tenant` llega con la misma referencia en cada tick de la rotacion (solo
// cambia tras un reload completo). `memo` evita que el rotador de
// PantallaRotativa (tick cada 3-12s, horas seguidas) vuelva a reconciliar
// este subarbol en cada cambio de indice.
function Header({ tenant }: HeaderProps) {
  const [imgError, setImgError] = useState(false)

  return (
    <header className={styles.header} style={{ background: tenant.paleta.primario }}>
      <div className={styles.brandRow}>
        {/* Sin logo (no subido a Cloudinary, o URL vacia): se oculta el
            recuadro blanco entero, no solo la imagen. */}
        {imgError ? null : (
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
            <img
              src={urlLogo(tenant.logo)}
              alt={tenant.nombre}
              width={100}
              height={100}
              crossOrigin="anonymous"
              style={{ height: 'clamp(50px, 8vh, 100px)', width: 'auto' }}
              onError={() => setImgError(true)}
            />
          </div>
        )}
        <div className={styles.brandCopy}>
          <span className={styles.brandName}>{tenant.nombre}</span>
          <span className={styles.brandTagline}>{tenant.eslogan}</span>
        </div>
      </div>
    </header>
  )
}

export default memo(Header)
