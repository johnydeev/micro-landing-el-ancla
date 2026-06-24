'use client'

import { useEffect, useReducer, useState, type CSSProperties } from 'react'

import Footer from '@/components/Footer'
import Header from '@/components/Header'
import HealthIndicator from '@/components/HealthIndicator'
import { negocioConfig } from '@/config/negocio'
import type { ConfigNegocio, ListaPrecios, Oferta } from '@/types'
import styles from '@/app/page.module.css'

/*
 * Cada cuanto la pantalla se reloadea completa. El reload completo es
 * nuestro mecanismo unico de actualizacion de datos (no hay polling).
 * Cada reload re-ejecuta el Server Component que va a Sheets (cache de
 * 60s en lib/sheets.ts) y obtiene la version mas fresca. Ademas resetea
 * cualquier acumulacion de memoria/estado del browser — funciona como
 * PREVENCION del freeze del Stick TV.
 *
 * 30 min (bajado de 1h en sesion 11) reduce la ventana de exposicion
 * al freeze. Como esto corre en el main thread, no es recovery: si el
 * thread ya esta muerto, el setInterval no se ejecuta. Para esos casos
 * tenemos el watchdog en el Service Worker (ver sendHeartbeat abajo).
 */
const RELOAD_INTERVAL_MS = 30 * 60 * 1000

/*
 * Cada cuanto el main thread le manda un heartbeat al SW. El SW tiene
 * un timeout de 60s — si pasa mas sin recibir heartbeat, asume que el
 * main thread esta freezado y fuerza un reload via client.navigate().
 * 20s entre heartbeats da 3 oportunidades antes de que el SW asuma muerte:
 * cubre los hipos cortos sin disparar falsos positivos.
 */
const HEARTBEAT_INTERVAL_MS = 20 * 1000

/*
 * Estado de la rotacion entre tabla de precios y cartel de oferta,
 * manejado con useReducer para tener una sola transicion atomica por
 * tick. Antes usabamos 3 useState separados (modo, listaIndex,
 * cartelIndex) y las transiciones entre modos requerian llamar a un
 * setter dentro del updater de otro setter — anti-patron de React que
 * puede causar dispatches duplicados o estados inconsistentes
 * acumulativos. El reducer resuelve todo en una sola actualizacion.
 */
type RotationState = {
  modo: 'tabla' | 'cartel'
  listaIndex: number
  cartelIndex: number
}

type RotationAction = {
  type: 'tick'
  listasCount: number
  ofertasCount: number
}

function rotationReducer(state: RotationState, action: RotationAction): RotationState {
  const { listasCount, ofertasCount } = action

  if (state.modo === 'tabla') {
    if (state.listaIndex < listasCount - 1) {
      return { ...state, listaIndex: state.listaIndex + 1 }
    }
    if (ofertasCount > 0) {
      return { modo: 'cartel', listaIndex: 0, cartelIndex: 0 }
    }
    return { ...state, listaIndex: 0 }
  }

  // modo === 'cartel'
  if (state.cartelIndex < ofertasCount - 1) {
    return { ...state, cartelIndex: state.cartelIndex + 1 }
  }
  return { modo: 'tabla', listaIndex: 0, cartelIndex: 0 }
}

const ROTATION_INITIAL: RotationState = {
  modo: 'tabla',
  listaIndex: 0,
  cartelIndex: 0,
}

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

export default function PantallaRotativa({
  listas,
  ofertas,
  configRemota,
}: PantallaRotativaProps) {
  // Los datos vienen DIRECTO de props del Server Component. No hay polling
  // client-side: cada `RELOAD_INTERVAL_MS` la pantalla se reloadea completa
  // y el Server Component vuelve a SSR con datos frescos. Bajamos de ~4300
  // peticiones/dia (polling cada 1min) a ~25/dia. Ademas el reload completo
  // resetea cualquier acumulacion de memoria/listeners en el browser.
  const [{ modo, listaIndex, cartelIndex }, dispatchRotation] = useReducer(
    rotationReducer,
    ROTATION_INITIAL,
  )

  const segundosCartel = configRemota.segundosCartel ?? negocioConfig.segundosCartel
  const segundosTabla = configRemota.segundosTabla ?? negocioConfig.segundosTabla

  // Reload completo periodico (cada RELOAD_INTERVAL_MS = 30 min).
  // Refresca datos via SSR y resetea cualquier acumulacion del browser.
  // PREVENCION del freeze — si el main thread ya esta muerto, no corre.
  // Para recovery cuando el main thread muere, el watchdog del SW
  // (ver useEffect siguiente) toma el relevo.
  useEffect(() => {
    const id = window.setInterval(() => {
      window.location.reload()
    }, RELOAD_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  // Heartbeat al Service Worker. El SW tiene logica de watchdog:
  // si pasa mas de 60s sin recibir un heartbeat de un cliente, asume
  // que ese cliente esta freezado y fuerza un client.navigate() para
  // recargarlo. Esto SI puede ejecutarse aunque el main thread este
  // muerto, porque el SW corre en otro thread.
  //
  // Mandamos cada HEARTBEAT_INTERVAL_MS = 20s. El SW espera 60s antes
  // de declarar muerto — da 3 oportunidades antes del reload forzado.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    let cancelled = false

    const sendHeartbeat = async () => {
      if (cancelled) return
      try {
        const registration = await navigator.serviceWorker.ready
        registration.active?.postMessage({ type: 'heartbeat' })
      } catch {
        // SW no disponible — sin watchdog, pero el reload preventivo
        // sigue activo. No es critico que esto falle.
      }
    }

    // Primer heartbeat inmediato para que el SW arranque su timer cuanto antes.
    sendHeartbeat()

    const id = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  // Rotacion entre tabla y cartel. Un solo dispatch por tick — el reducer
  // se encarga de calcular el nuevo estado atomicamente. Sin nested setters.
  useEffect(() => {
    if (listas.length === 0 && ofertas.length === 0) return

    const ms = (modo === 'tabla' ? segundosTabla : segundosCartel) * 1000

    const intervalId = window.setInterval(() => {
      dispatchRotation({
        type: 'tick',
        listasCount: listas.length,
        ofertasCount: ofertas.length,
      })
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
        <HealthIndicator />
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
