import Image from 'next/image'
import { negocioConfig } from '@/config/negocio'
import styles from './Header.module.css'

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.brandRow}>
        <Image
          src={negocioConfig.logo}
          alt={negocioConfig.nombre}
          width={730}
          height={619}
          priority
          unoptimized
          className={styles.logo}
        />
        <div className={styles.brandCopy}>
          <span className={styles.brandName}>{negocioConfig.nombre}</span>
          <span className={styles.brandTagline}>{negocioConfig.eslogan}</span>
        </div>
      </div>
    </header>
  )
}
