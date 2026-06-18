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
  //
  // Skip cuando `navigator.onLine === false`: si la wifi del local cayo,
  // disparar el refresh igual genera un RSC fetch que va a fallar, y queremos
  // evitar cualquier ciclo de errores en el cliente Next. Cuando la red
  // vuelva, el listener `online` (mas abajo) hace el refresh inmediato.
  // navigator.onLine no es 100% confiable (a veces dice true sin internet),
  // pero cuando dice false podemos confiar.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      startTransition(() => {
        router.refresh()
      })
    }, minutosActualizacion * 60 * 1000)
    return () => window.clearInterval(intervalId)
  }, [router, minutosActualizacion])

  // Cuando la wifi del local se cae y vuelve sin matar la app (caso comun
  // en el Stick TV), forzamos un refresh para sincronizar datos en vez de
  // esperar al proximo tick del intervalo. Combina con el Service Worker:
  // el SW evita que se vea la pantalla blanca del browser, este listener
  // se asegura de que apenas vuelva la red la data se actualice.
  useEffect(() => {
    const handleOnline = () => {
      startTransition(() => {
        router.refresh()
      })
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [router])

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

/*
 * Mapeo de la escala 1-5 de la columna "tamano" del Sheets a un porcentaje
 * concreto del wrapper de la imagen. El default (3 = 80%) coincide con el
 * comportamiento previo a la feature, para que las ofertas existentes sin
 * la columna no cambien visualmente. Si en el futuro se quiere mas
 * granularidad (1-10) o ajustar valores, este es el unico lugar a tocar.
 */
const TAMANO_OFERTA_A_ESCALA: Record<number, string> = {
  1: '60%',
  2: '70%',
  3: '80%',
  4: '90%',
  5: '100%',
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

  // Tamano por-oferta via CSS variable. El parser de lib/sheets.ts ya
  // garantiza que `tamano` esta en el rango 1-5, asi que el fallback
  // a TAMANO_OFERTA_A_ESCALA[3] solo se usaria si alguien rompe el contrato.
  const escalaImagen = TAMANO_OFERTA_A_ESCALA[oferta.tamano] ?? TAMANO_OFERTA_A_ESCALA[3]
  const imageVars = { '--cartel-image-scale': escalaImagen } as CSSProperties

  // Todo el layout vive en page.module.css. Los colores entran via CSS vars
  // inyectadas en `.screen`, por lo que aca solo manejamos:
  //   1. el slug dinamico de la imagen,
  //   2. el fallback cuando la imagen no existe (imgError),
  //   3. la escala por-oferta via CSS variable,
  //   4. las clases combinadas para sumar animaciones de entrada.
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
            style={imageVars}
          />
        </div>
      )}

      <div className={`${styles.cartelPrice} ${styles.pulsePrice}`}>
        <span className={styles.cartelPriceText}>{formatPrecio(oferta.precio)}</span>
      </div>
    </div>
  )
}
