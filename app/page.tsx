'use client'

// IMPORTANTE: agregar GOOGLE_SHEETS_CSV_URL_OFERTAS al .env.local y en Vercel,
// igual que GOOGLE_SHEETS_CSV_URL.

import { useEffect, useState, type CSSProperties } from 'react'

import AutoRefresh from '@/components/AutoRefresh'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import { negocioConfig } from '@/config/negocio'
import type { Oferta, Producto } from '@/types'
import styles from './page.module.css'

const CARTEL_DURACION_MS = negocioConfig.segundosCartel * 1000
const TABLA_DURACION_MS = negocioConfig.segundosTabla * 1000
const REFETCH_INTERVAL_MS = negocioConfig.minutosActualizacion * 60 * 1000

function formatPrecio(precio: string): string {
  const num = Number(precio)
  if (isNaN(num)) return `$${precio}`
  return `$${num.toLocaleString('es-AR')}`
}

function slugifyNombre(nombre: string): string {
  return nombre.toLowerCase().split(' ').join('-')
}

export default function Home() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [ofertas, setOfertas] = useState<Oferta[]>([])
  const [modo, setModo] = useState<'cartel' | 'tabla'>('tabla')
  const [cartelIndex, setCartelIndex] = useState(0)

  useEffect(() => {
    let cancelled = false

    const cargar = async () => {
      try {
        const [resProductos, resOfertas] = await Promise.all([
          fetch('/api/productos', { cache: 'no-store' }),
          fetch('/api/ofertas', { cache: 'no-store' }),
        ])
        if (cancelled) return
        if (resProductos.ok) {
          setProductos(await resProductos.json())
        }
        if (resOfertas.ok) {
          setOfertas(await resOfertas.json())
        }
      } catch (error) {
        console.error('Error cargando datos:', error)
      }
    }

    cargar()
    const intervalId = window.setInterval(cargar, REFETCH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (ofertas.length === 0) return

    let timeoutId: number

    if (modo === 'tabla') {
      timeoutId = window.setTimeout(() => {
        setCartelIndex(0)
        setModo('cartel')
      }, TABLA_DURACION_MS)
    } else {
      timeoutId = window.setTimeout(() => {
        if (cartelIndex < ofertas.length - 1) {
          setCartelIndex(cartelIndex + 1)
        } else {
          setModo('tabla')
        }
      }, CARTEL_DURACION_MS)
    }

    return () => window.clearTimeout(timeoutId)
  }, [modo, cartelIndex, ofertas])

  const tableFontVars = {
    '--table-font-scale': `${negocioConfig.tipografia.tabla / 100}`,
  } as CSSProperties

  const ofertaActual = modo === 'cartel' ? ofertas[cartelIndex] : null

  return (
    <main className={styles.pageShell}>
      <AutoRefresh />
      <div className={styles.screen} style={tableFontVars}>
        <Header />
        {ofertaActual ? (
          <CartelOferta key={ofertaActual.nombre} oferta={ofertaActual} />
        ) : (
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
                        <div className={styles.priceInline}>
                          <span className={styles.priceValue}>{formatPrecio(producto.precio)}</span>
                          {producto.unidad && <span className={styles.unitValue}>por {producto.unidad}</span>}
                        </div>
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
        )}
        <Footer />
      </div>
    </main>
  )
}

function CartelOferta({ oferta }: { oferta: Oferta }) {
  const [imgError, setImgError] = useState(false)
  const slug = slugifyNombre(oferta.nombre)

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: '38%',
          background: '#E31E24',
          clipPath: 'polygon(0 0, 100% 0, 72% 100%, 0% 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: '8%',
          left: '3%',
          background: '#1E3A8A',
          color: '#fff',
          borderRadius: 16,
          padding: '20px 30px',
          fontSize: 'clamp(20px, 2.5vw, 38px)',
          fontWeight: 'bold',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        SUPER OFERTA
      </div>

      {imgError ? (
        <div
          style={{
            position: 'absolute',
            right: '5%',
            top: '10%',
            height: '70%',
            width: 'auto',
          }}
        />
      ) : (
        <img
          src={`/ofertas/${slug}.png`}
          alt={oferta.nombre}
          onError={() => setImgError(true)}
          style={{
            position: 'absolute',
            right: '5%',
            top: '10%',
            height: '70%',
            width: 'auto',
            objectFit: 'contain',
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          left: '36%',
          top: '20%',
          fontSize: 'clamp(36px, 6vw, 90px)',
          color: '#1E3A8A',
          fontWeight: 'bold',
          maxWidth: '40%',
          lineHeight: 1.1,
        }}
      >
        {oferta.nombre}
      </div>

      <div
        style={{
          position: 'absolute',
          right: '5%',
          bottom: '5%',
          width: 'clamp(160px, 18vw, 280px)',
          aspectRatio: '1',
          background: '#1E3A8A',
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          color: '#fff',
          textAlign: 'center',
          padding: '0 8%',
        }}
      >
        <span style={{ fontSize: 'clamp(22px, 3vw, 48px)', fontWeight: 'bold' }}>
          {formatPrecio(oferta.precio)}
        </span>
        {oferta.unidad && (
          <span style={{ fontSize: 'clamp(12px, 1.5vw, 24px)' }}>{oferta.unidad}</span>
        )}
      </div>

    </div>
  )
}
