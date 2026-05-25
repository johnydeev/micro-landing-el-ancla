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

  // Inyectamos los colores de marca y el factor de tipografia como CSS custom
  // properties en el contenedor `.screen`. El CSS module los consume via
  // `var(--c-*)`. Asi el JSX no carga inline styles y el CSS queda estatico.
  const screenVars = {
    '--c-primario': negocioConfig.colores.primario,
    '--c-secundario': negocioConfig.colores.secundario,
    '--c-fondo': negocioConfig.colores.fondo,
    '--c-texto-primario': negocioConfig.colores.textoPrimario,
    '--c-texto-secundario': negocioConfig.colores.textoSecundario,
    '--c-fila-impar': negocioConfig.colores.filaImpar,
    '--table-font-scale': `${negocioConfig.tipografia.tabla / 100}`,
  } as CSSProperties

  const ofertaActual = modo === 'cartel' ? ofertas[cartelIndex] : null
  const listaActual = listas[listaIndex] ?? null
  const productosActuales = listaActual?.productos ?? []

  return (
    <main className={styles.pageShell}>
      <div className={styles.screen} style={screenVars}>
        <Header />
        {ofertaActual ? (
          <CartelOferta key={ofertaActual.nombre} oferta={ofertaActual} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.headRow}>
                  <th className={styles.superHeadCell} colSpan={2}>
                    {listaActual?.titulo ?? 'Lista de Precios'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {productosActuales.length > 0 ? (
                  productosActuales.map((producto, i) => (
                    <tr key={`${producto.nombre}-${i}`} className={styles.row}>
                      <td className={`${styles.cellBase} ${styles.descriptionCell}`}>
                        {producto.nombre}
                      </td>
                      <td className={`${styles.cellBase} ${styles.priceCell}`}>
                        <div className={styles.priceInline}>
                          <span className={styles.priceValue}>{formatPrecio(producto.precio)}</span>
                          {producto.unidad && (
                            <span className={styles.unitValue}>por {producto.unidad}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className={`${styles.cellBase} ${styles.emptyState}`}>
                      <div>Estamos actualizando la lista de precios.</div>
                      <div className={styles.emptyStateContact}>
                        Consultá por {configRemota.whatsapp ?? negocioConfig.whatsapp ?? negocioConfig.telefono}
                      </div>
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

  // La columna del CSV ya se llama "slug imagen" — el contrato con el cliente
  // es cargar un slug, no un nombre con espacios o mayusculas. Aun asi
  // re-slugificamos para que la pantalla del local no se rompa si el cliente
  // se equivoca. Lo loguearmos solo en dev para detectar el patron sin
  // ensuciar la consola en produccion.
  const slug = oferta.imagen
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
  if (process.env.NODE_ENV !== 'production' && slug !== oferta.imagen) {
    console.warn(
      `[ofertas] "${oferta.imagen}" se re-slugify como "${slug}". ` +
        `Cargar el slug correcto en la planilla (columna "slug imagen").`,
    )
  }

  // Todo el layout vive en page.module.css. Los colores entran via CSS vars
  // inyectadas en `.screen`, por lo que aca solo manejamos:
  //   1. el slug dinamico de la imagen,
  //   2. el fallback cuando la imagen no existe (imgError),
  //   3. las clases combinadas para sumar animaciones de entrada.
  return (
    <div className={styles.cartel}>
      <div className={styles.cartelDiagonal} />

      <div className={`${styles.cartelBadge} ${styles.pulseSuperOferta}`}>
        SUPER
        <br />
        OFERTA
      </div>

      <div className={styles.cartelTitleWrap}>
        <div className={styles.cartelTitle}>{oferta.nombre}</div>
      </div>

      {!imgError && (
        <div className={styles.cartelImageWrap}>
          <img
            src={`/ofertas/${slug}.png`}
            alt={oferta.nombre}
            onError={() => setImgError(true)}
            className={`${styles.cartelImage} ${styles.pulseImage}`}
          />
        </div>
      )}

      <div className={`${styles.cartelPrice} ${styles.pulsePrice}`}>
        <span className={styles.cartelPriceText}>{formatPrecio(oferta.precio)}</span>
      </div>
    </div>
  )
}
