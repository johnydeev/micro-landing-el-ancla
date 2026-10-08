'use client'

import { useEffect, useMemo, useReducer, useSyncExternalStore, type CSSProperties } from 'react'

import DimOverlay from '@/components/DimOverlay'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import HealthIndicator from '@/components/HealthIndicator'
import TablaClasica from '@/templates/tabla/Clasica'
import { CATALOGO_CARTELES } from '@/templates'
import { estadoInicialRotacion, rotationReducer } from '@/lib/rotacion'
import { leerGuardado, resolver } from '@/lib/ultimo-dato-bueno'
import type { ConfigNegocio, EstadoPantalla, ListaPrecios, Oferta } from '@/types'
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
 * 10 min (sesion 24; 5 min en sesion 23, 30 min antes y 1h hasta sesion
 * 11): la mitad de pedidos a Google que con 5 min (~145 reloads/dia por
 * pantalla, 3 fetch cada uno), que es la dependencia sin limite publicado.
 * Un precio corregido llega a la TV en ~15 min como maximo (4-5 de
 * publicacion de Google + hasta 10 de espera). No se baja de ~5: cada
 * reload reinicia la rotacion, y una vuelta completa en El Ancla dura
 * ~3,5 min. Si Google falla, la TV muestra el ultimo dato bueno
 * (lib/ultimo-dato-bueno.ts) y reintenta en cada reload.
 *
 * Como esto corre en el main thread, no es recovery: si el thread ya esta
 * muerto, el setInterval no se ejecuta. Para esos casos
 * tenemos el watchdog en el Service Worker (ver sendHeartbeat abajo).
 */
const RELOAD_INTERVAL_MS = 10 * 60 * 1000

/*
 * Cada cuanto el main thread le manda un heartbeat al SW. El SW tiene
 * un timeout de 60s — si pasa mas sin recibir heartbeat, asume que el
 * main thread esta freezado y fuerza un reload via client.navigate().
 * 20s entre heartbeats da 3 oportunidades antes de que el SW asuma muerte:
 * cubre los hipos cortos sin disparar falsos positivos.
 */
const HEARTBEAT_INTERVAL_MS = 20 * 1000

interface PantallaRotativaProps {
  tenant: Tenant
  listas: ListaPrecios[]
  ofertas: Oferta[]
  configRemota: ConfigNegocio
  /** Estado de lectura de cada parte (lib/sheets.ts -> getPantallaData). */
  estado: EstadoPantalla
  /** Date.now() del server al armar la pagina. */
  generadoEn: number
  /** Clave de localStorage de esta TV (claveGuardado(slug, rubros)). */
  claveGuardado: string
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

/*
 * localStorage via useSyncExternalStore: en SSR (y durante la hidratacion)
 * no hay nada guardado (null); en el cliente se lee el string crudo. Un
 * string es comparable por valor, asi que no hay loop de re-render. Sin
 * suscripcion: solo esta TV escribe su clave. try/catch: si el storage esta
 * bloqueado o falla, la pantalla sigue como si no hubiera nada guardado.
 */
function sinSuscripcion(): () => void {
  return () => {}
}

function leerStorage(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave)
  } catch {
    return null
  }
}

export default function PantallaRotativa({
  tenant,
  listas: listasRecibidas,
  ofertas: ofertasRecibidas,
  configRemota: configRecibida,
  estado,
  generadoEn,
  claveGuardado,
  modoFijo,
  indiceFijo = 0,
}: PantallaRotativaProps) {
  // Ultimo dato bueno: si alguna parte llego con `error`, se muestra lo
  // guardado en esta TV (hasta 2 h). Ver lib/ultimo-dato-bueno.ts.
  // `undefined` = todavia no se leyo (SSR y render de hidratacion);
  // `null` = se leyo y no hay nada guardado. La distincion importa para la
  // escritura: ver el effect de abajo.
  const crudo = useSyncExternalStore<string | null | undefined>(
    sinSuscripcion,
    () => leerStorage(claveGuardado),
    () => undefined,
  )
  const { mostrar, guardar, usandoGuardado } = useMemo(
    () =>
      resolver(
        { listas: listasRecibidas, ofertas: ofertasRecibidas, configRemota: configRecibida, estado, generadoEn },
        leerGuardado(crudo ?? null),
      ),
    [listasRecibidas, ofertasRecibidas, configRecibida, estado, generadoEn, crudo],
  )
  const { listas, ofertas, configRemota } = mostrar

  // Escritura del ultimo dato bueno. Effect sin setState (solo storage).
  // No se escribe mientras `crudo` es `undefined`: en el render de
  // hidratacion todavia no se leyo lo guardado, y `guardar` saldria sin las
  // copias de las partes con error -> borraria el ultimo dato bueno justo
  // cuando hace falta.
  // Memo: la rotacion re-renderiza cada pocos segundos; serializar solo
  // cuando cambia lo que hay que guardar (el Fire TV es hardware chico).
  const guardarJson = useMemo(() => JSON.stringify(guardar), [guardar])
  useEffect(() => {
    if (crudo === undefined || guardarJson === crudo) return
    try {
      window.localStorage.setItem(claveGuardado, guardarJson)
    } catch {
      // Storage lleno o bloqueado: seguimos sin guardar.
    }
  }, [claveGuardado, guardarJson, crudo])
  // Los datos vienen de props del Server Component (o, si Google fallo, de
  // lo guardado en esta TV: ver `mostrar` arriba). No hay polling
  // client-side: cada `RELOAD_INTERVAL_MS` la pantalla se reloadea completa
  // y el Server Component vuelve a SSR con datos frescos. Bajamos de ~4300
  // peticiones/dia (polling cada 1min) a ~25/dia. Ademas el reload completo
  // resetea cualquier acumulacion de memoria/listeners en el browser.
  const [{ modo, listaIndex, cartelIndex }, dispatchRotation] = useReducer(
    rotationReducer,
    undefined,
    () =>
      modoFijo
        ? {
            modo: modoFijo,
            listaIndex: modoFijo === 'tabla' ? indiceFijo : 0,
            cartelIndex: modoFijo === 'cartel' ? indiceFijo : 0,
          }
        : estadoInicialRotacion(listas.length, ofertas.length),
  )

  const segundosCartel = configRemota.segundosCartel ?? tenant.defaults.segundosCartel
  const segundosTabla = configRemota.segundosTabla ?? tenant.defaults.segundosTabla

  // Reload completo periodico (cada RELOAD_INTERVAL_MS = 10 min).
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
    '--c-acento': tenant.paleta.acento ?? tenant.paleta.secundario,
    '--c-texto-acento': tenant.paleta.textoAcento ?? '#fff',
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
        <HealthIndicator usandoGuardado={usandoGuardado} />
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
