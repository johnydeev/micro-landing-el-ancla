'use client'

import { useEffect, useReducer, type CSSProperties } from 'react'

import DimOverlay from '@/components/DimOverlay'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import HealthIndicator from '@/components/HealthIndicator'
import TablaClasica from '@/templates/tabla/Clasica'
import { CATALOGO_CARTELES } from '@/templates'
import type { ConfigNegocio, ListaPrecios, Oferta } from '@/types'
import type { Tenant } from '@/types/tenant'
import styles from '@/app/page.module.css'

/*
 * Cada cuanto la pantalla se reloadea completa. El reload completo es
 * nuestro mecanismo unico de actualizacion de datos (no hay polling).
 * Cada reload re-ejecuta el Server Component que va a Sheets (sin cache
 * desde sesion 19) y obtiene la version mas fresca. Ademas resetea
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

interface PantallaRotativaProps {
  tenant: Tenant
  listas: ListaPrecios[]
  ofertas: Oferta[]
  configRemota: ConfigNegocio
  /**
   * Modo desarrollador: si esta definido, la pantalla arranca fija en ese
   * modo y la rotacion NO corre (sin setInterval, sin reload periodico).
   * Usado por las rutas /vistaCartel y /vistaLista para iterar sobre el
   * diseno sin esperar el timer. La ruta `/` (cliente final) no pasa esta
   * prop, asi que su comportamiento no cambia.
   */
  modoFijo?: 'tabla' | 'cartel'
  /** Indice de lista/oferta a mostrar cuando `modoFijo` esta definido. Default 0. */
  indiceFijo?: number
}

export default function PantallaRotativa({
  tenant,
  listas,
  ofertas,
  configRemota,
  modoFijo,
  indiceFijo = 0,
}: PantallaRotativaProps) {
  // Los datos vienen DIRECTO de props del Server Component. No hay polling
  // client-side: cada `RELOAD_INTERVAL_MS` la pantalla se reloadea completa
  // y el Server Component vuelve a SSR con datos frescos. Bajamos de ~4300
  // peticiones/dia (polling cada 1min) a ~25/dia. Ademas el reload completo
  // resetea cualquier acumulacion de memoria/listeners en el browser.
  const [{ modo, listaIndex, cartelIndex }, dispatchRotation] = useReducer(
    rotationReducer,
    ROTATION_INITIAL,
    (initial) =>
      modoFijo
        ? {
            modo: modoFijo,
            listaIndex: modoFijo === 'tabla' ? indiceFijo : 0,
            cartelIndex: modoFijo === 'cartel' ? indiceFijo : 0,
          }
        : initial,
  )

  const segundosCartel = configRemota.segundosCartel ?? tenant.defaults.segundosCartel
  const segundosTabla = configRemota.segundosTabla ?? tenant.defaults.segundosTabla

  // Reload completo periodico (cada RELOAD_INTERVAL_MS = 30 min).
  // Refresca datos via SSR y resetea cualquier acumulacion del browser.
  // PREVENCION del freeze — si el main thread ya esta muerto, no corre.
  // Para recovery cuando el main thread muere, el watchdog del SW
  // (ver useEffect siguiente) toma el relevo.
  useEffect(() => {
    if (modoFijo) return // modo dev: sin reload periodico
    const id = window.setInterval(() => {
      window.location.reload()
    }, RELOAD_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [modoFijo])

  // Heartbeat al Service Worker. El SW tiene logica de watchdog:
  // si pasa mas de 60s sin recibir un heartbeat de un cliente, asume
  // que ese cliente esta freezado y fuerza un client.navigate() para
  // recargarlo. Esto SI puede ejecutarse aunque el main thread este
  // muerto, porque el SW corre en otro thread.
  //
  // Mandamos cada HEARTBEAT_INTERVAL_MS = 20s. El SW espera 60s antes
  // de declarar muerto — da 3 oportunidades antes del reload forzado.
  useEffect(() => {
    if (modoFijo) return // modo dev: sin heartbeat, no hay watchdog que alimentar
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
  }, [modoFijo])

  // Rotacion entre tabla y cartel. Un solo dispatch por tick — el reducer
  // se encarga de calcular el nuevo estado atomicamente. Sin nested setters.
  useEffect(() => {
    if (modoFijo) return // modo dev: pantalla fija, sin rotacion
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
  }, [modoFijo, modo, listas.length, ofertas.length, segundosCartel, segundosTabla])

  // Paleta del tenant como CSS custom properties en `.screen`. Los templates
  // y el CSS module consumen `var(--c-*)`: mismo template, otra paleta =
  // otro cliente, sin tocar componentes.
  const screenVars = {
    '--c-primario': tenant.paleta.primario,
    '--c-secundario': tenant.paleta.secundario,
    '--c-fondo': tenant.paleta.fondo,
    '--c-texto-primario': tenant.paleta.textoPrimario,
    '--c-texto-secundario': tenant.paleta.textoSecundario,
    '--c-fila-impar': tenant.paleta.filaImpar,
    '--table-font-scale': `${tenant.tipografia.tabla / 100}`,
  } as CSSProperties

  const ofertaActual = modo === 'cartel' ? ofertas[cartelIndex] : null
  const listaActual = listas[listaIndex] ?? null
  const Cartel = ofertaActual
    ? CATALOGO_CARTELES[ofertaActual.plantilla ?? tenant.plantillaCartelDefault]
    : null

  return (
    <main className={styles.pageShell}>
      <div className={styles.screen} style={screenVars}>
        <DimOverlay desde={configRemota.atenuarDesde} hasta={configRemota.atenuarHasta} />
        <HealthIndicator />
        <Header tenant={tenant} />
        {ofertaActual && Cartel ? (
          // key por nombre: el remount dispara la animacion de entrada.
          <Cartel key={ofertaActual.nombre} oferta={ofertaActual} textos={tenant.textos} />
        ) : (
          <TablaClasica
            lista={listaActual}
            textoSinDatos={tenant.textos.sinDatos}
            whatsapp={configRemota.whatsapp ?? tenant.defaults.whatsapp}
          />
        )}
        <Footer tenant={tenant} config={configRemota} />
      </div>
    </main>
  )
}
