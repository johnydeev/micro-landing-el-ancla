'use client'

import { startTransition, useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

import Footer from '@/components/Footer'
import Header from '@/components/Header'
import { negocioConfig } from '@/config/negocio'
import type { ConfigNegocio, ListaPrecios, Oferta } from '@/types'
import styles from '@/app/page.module.css'

function formatPrecio(precio: string): string {
  // El cliente carga precios en Sheets, y puede usar formato AR ("1.500,50",
  // con punto de miles y coma decimal) o formato JS/US ("1500.50"). Si lo
  // pasaramos directo a Number() perderiamos los miles: Number("1.500") === 1.5.
  // Convencion: si hay coma, asumimos formato AR y reemplazamos puntos por
  // nada (miles) y la coma por punto (decimal). Si no hay coma, lo dejamos
  // como esta — funciona igual para "1500" y para "1500.50".
  const limpio = precio.trim()
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio
  const num = Number(normalizado)
  if (Number.isNaN(num)) return `$${precio}`
  return `$${num.toLocaleString('es-AR')}`
}

interface PantallaRotativaProps {
  listas: ListaPrecios[]
  ofertas: Oferta[]
  configRemota: ConfigNegocio
}

export default function PantallaRotativa({ listas, ofertas, configRemota }: PantallaRotativaProps) {
  const router = useRouter()
  const [modo, setModo] = useState<'cartel' | 'tabla'>('tabla')
  const [cartelIndex, setCartelIndex] = useState(0)
  const [listaIndex, setListaIndex] = useState(0)

  const segundosCartel = configRemota.segundosCartel ?? negocioConfig.segundosCartel
  const segundosTabla = configRemota.segundosTabla ?? negocioConfig.segundosTabla
  const minutosActualizacion = configRemota.minutosActualizacion ?? negocioConfig.minutosActualizacion

  // Refresca los datos del Server Component periodicamente.
  // router.refresh() reusa el fetch cache del servidor (revalidate: 60),
  // por lo que las solicitudes nuevas a Google Sheets ocurren cuando expira la cache.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      startTransition(() => {
        router.refresh()
      })
    }, minutosActualizacion * 60 * 1000)
    return () => window.clearInterval(intervalId)
  }, [router, minutosActualizacion])

  // Rotacion entre tabla de precios y cartel de oferta.
  // Las dependencias se limitan a longitudes y duraciones para evitar reschedulings espurios;
  // los setters funcionales evitan closures rancias sin necesidad de listar los indices.
  useEffect(() => {
    if (listas.length === 0 && ofertas.length === 0) return

    const isTabla = modo === 'tabla'
    const ms = (isTabla ? segundosTabla : segundosCartel) * 1000

    const intervalId = window.setInterval(() => {
      if (isTabla) {
        setListaIndex((prev) => {
          if (prev < listas.length - 1) return prev + 1
          if (ofertas.length > 0) {
            setCartelIndex(0)
            setModo('cartel')
            return prev
          }
          return 0
        })
      } else {
        setCartelIndex((prev) => {
          if (prev < ofertas.length - 1) return prev + 1
          setListaIndex(0)
          setModo('tabla')
          return prev
        })
      }
    }, ms)

    return () => window.clearInterval(intervalId)
  }, [modo, listas.length, ofertas.length, segundosCartel, segundosTabla])

  const tableFontVars = {
    '--table-font-scale': `${negocioConfig.tipografia.tabla / 100}`,
  } as CSSProperties

  const ofertaActual = modo === 'cartel' ? ofertas[cartelIndex] : null
  const listaActual = listas[listaIndex] ?? null
  const productosActuales = listaActual?.productos ?? []

  return (
    <main className={styles.pageShell}>
      <div className={styles.screen} style={tableFontVars}>
        <Header />
        {ofertaActual ? (
          <CartelOferta key={ofertaActual.nombre} oferta={ofertaActual} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.headRow} style={{ background: negocioConfig.colores.secundario }}>
                  <th
                    className={styles.superHeadCell}
                    style={{ color: negocioConfig.colores.fondo, background: negocioConfig.colores.secundario }}
                    colSpan={2}
                  >
                    {listaActual?.titulo ?? 'Lista de Precios'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {productosActuales.length > 0 ? (
                  productosActuales.map((producto, i) => (
                    <tr
                      key={`${producto.nombre}-${i}`}
                      className={i % 2 === 0 ? styles.rowEven : styles.rowOdd}
                      style={{ background: i % 2 === 0 ? negocioConfig.colores.fondo : negocioConfig.colores.filaImpar }}
                    >
                      <td className={`${styles.cellBase} ${styles.descriptionCell}`} style={{ color: negocioConfig.colores.textoPrimario, borderBottom: '1px solid #e5e7eb' }}>{producto.nombre}</td>
                      <td className={`${styles.cellBase} ${styles.priceCell}`} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <div className={styles.priceInline}>
                          <span className={styles.priceValue} style={{ color: negocioConfig.colores.primario }}>{formatPrecio(producto.precio)}</span>
                          {producto.unidad && <span className={styles.unitValue} style={{ color: negocioConfig.colores.textoSecundario }}>por {producto.unidad}</span>}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className={`${styles.cellBase} ${styles.emptyState}`} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      Sin productos disponibles
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Footer config={configRemota} />
      </div>
    </main>
  )
}

function CartelOferta({ oferta }: { oferta: Oferta }) {
  const [imgError, setImgError] = useState(false)
  const slug = oferta.imagen
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')

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
          width: '22%',
          background: negocioConfig.colores.secundario,
          clipPath: 'polygon(0 0, 100% 0, 55% 100%, 0% 100%)',
        }}
      />

      <div
        className={styles.pulseSuperOferta}
        style={{
          position: 'absolute',
          top: '3%',
          left: '8%',
          background: negocioConfig.colores.primario,
          color: '#fff',
          borderRadius: 16,
          padding: '24px 40px',
          fontSize: 'clamp(28px, 4vw, 60px)',
          fontWeight: 'bold',
          textAlign: 'center',
          lineHeight: 1.2,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        SUPER
        <br />
        OFERTA
      </div>

      <div
        style={{
          position: 'absolute',
          left: '33%', //LIMITE IZQUIERDO DE LA ZONA DE CENTRADO (borde derecho del cartel SUPER OFERTA)
          right: '5%', //LIMITE DERECHO DE LA ZONA DE CENTRADO
          top: '3%',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(36px, 6vw, 90px)', //TAMAÑO DEL NOMBRE DE LA OFERTA
            background: negocioConfig.colores.secundario,
            color: '#FFFFFF',
            borderRadius: '16px',
            padding: '16px 28px',
            fontWeight: 'bold',
            maxWidth: '100%',
            textAlign: 'center',
            boxSizing: 'border-box',
            lineHeight: 1.1,
          }}
        >
          {oferta.nombre}
        </div>
      </div>

      {!imgError && (
        <div
          style={{
            position: 'absolute',
            left: '10%',
            right: '18%',
            top: '16%',
            bottom: '0%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={`/ofertas/${slug}.png`}
            alt={oferta.nombre}
            onError={() => setImgError(true)}
            className={styles.pulseImage}
            style={{
              height: '80%',
              width: '80%',
              objectFit: 'contain',
            }}
          />
        </div>
      )}

      <div
        className={styles.pulsePrice}
        style={{
          position: 'absolute',
          right: '5%',
          bottom: '5%',
          ['--circle-size' as string]: 'clamp(180px, 20vw, 320px)',
          width: 'var(--circle-size)',
          aspectRatio: '1',
          background: negocioConfig.colores.secundario,
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          color: '#fff',
          textAlign: 'center',
          padding: '0 8%',
          fontSize: 'calc(var(--circle-size) * 0.25)', //TAMAÑO DEL PRECIO EN EL CIRCULO, 25% del tamaño del circulo
        }}
      >
        <span style={{ fontWeight: 'bold' }}>
          {formatPrecio(oferta.precio)}
        </span>
      </div>

    </div>
  )
}
