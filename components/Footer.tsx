import { negocioConfig } from '@/config/negocio'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <span>📞 {negocioConfig.telefono}</span>
        <span className={styles.divider}>|</span>
        <span>📍 {negocioConfig.direccion}</span>
        <span className={styles.divider}>|</span>
        <span>🕐 {negocioConfig.horarios}</span>
      </div>
    </footer>
  )
}
