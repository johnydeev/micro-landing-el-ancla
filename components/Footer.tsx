import type { CSSProperties } from 'react'

import { negocioConfig } from '@/config/negocio'
import styles from './Footer.module.css'

export default function Footer() {
  const footerFontVars = {
    '--footer-font-scale': `${negocioConfig.tipografia.footer / 100}`,
  } as CSSProperties

  return (
    <footer className={styles.footer}>
      <div className={styles.content} style={footerFontVars}>
        <span>📞 {negocioConfig.telefono}</span>
        <span className={styles.divider}>|</span>
        <span>📍 {negocioConfig.direccion}</span>
        <span className={styles.divider}>|</span>
        <span>🕐 {negocioConfig.horarios}</span>
      </div>
    </footer>
  )
}
