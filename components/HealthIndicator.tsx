'use client'

import { useSyncExternalStore } from 'react'

/*
 * Indicador visual del estado de conectividad de la pantalla.
 *
 * Aparece arriba a la derecha del `.screen`, chico y semi-transparente
 * para que no compita con el contenido. El publico que mira la pantalla
 * casi no lo nota; el operador del local lo usa como diagnostico rapido.
 *
 * Estados:
 *   verde    — online: navigator.onLine === true
 *   rojo     — offline: navigator.onLine === false
 *   gris     — inicial: durante SSR / antes de hidratar
 *
 * navigator.onLine no es 100% confiable cuando dice true (puede haber
 * wifi sin internet real), pero cuando dice false es de fiar. Para el
 * caso de uso (saber "tenes red o no?"), es suficiente.
 *
 * No hacemos polling de ningun endpoint para chequear el estado —
 * eso contradeciria la decision de sesion 10 de eliminar polling.
 * El estado se actualiza por eventos `online`/`offline` del browser
 * via useSyncExternalStore (patron moderno de React 18+ para
 * suscribirse a estado externo del browser sin setState-in-effect).
 */

type EstadoSalud = 'inicial' | 'online' | 'offline'

const COLORES: Record<EstadoSalud, string> = {
  inicial: '#9ca3af', // gris
  online: '#22c55e',  // verde
  offline: '#ef4444', // rojo
}

const TITULOS: Record<EstadoSalud, string> = {
  inicial: 'Estado: cargando',
  online: 'Estado: conectado',
  offline: 'Estado: sin conexion',
}

function obtenerEstadoCliente(): EstadoSalud {
  return navigator.onLine ? 'online' : 'offline'
}

function obtenerEstadoServidor(): EstadoSalud {
  return 'inicial'
}

function suscribirEventosRed(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export default function HealthIndicator() {
  const estado = useSyncExternalStore(
    suscribirEventosRed,
    obtenerEstadoCliente,
    obtenerEstadoServidor,
  )

  return (
    <div
      aria-label={TITULOS[estado]}
      title={TITULOS[estado]}
      style={{
        position: 'absolute',
        top: '0.8vh',
        right: '0.8vh',
        width: 'clamp(8px, 0.9vw, 14px)',
        height: 'clamp(8px, 0.9vw, 14px)',
        borderRadius: '50%',
        background: COLORES[estado],
        opacity: 0.6,
        boxShadow: `0 0 4px ${COLORES[estado]}`,
        zIndex: 10,
        pointerEvents: 'none',
        transition: 'background 0.3s ease, box-shadow 0.3s ease',
      }}
    />
  )
}
