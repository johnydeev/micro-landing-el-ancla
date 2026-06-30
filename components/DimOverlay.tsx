'use client'

import { useCallback, useSyncExternalStore } from 'react'

/*
 * Overlay de atenuado horario.
 *
 * Durante el rango [atenuarDesde, atenuarHasta) (configurable desde la
 * pestana CONFIG del Sheets, formato 24hs "HH" o "HH:MM"), muestra un
 * velo negro casi opaco encima de toda la pantalla. Fuera del rango, el
 * velo es transparente. La transicion es suave (2s) para que no sea un
 * corte brusco.
 *
 * Caso de uso: el local quiere "bajar" la pantalla en las horas muertas
 * (ej. la siesta del mediodia) sin apagarla del todo. Ver nota sobre
 * ahorro de energia en docs/decisiones.md — en TVs LED/LCD el overlay
 * oscurece pero NO apaga el backlight, asi que el ahorro real es bajo;
 * en OLED si ahorra.
 *
 * La hora se toma del reloj del dispositivo (Stick TV / browser). Asume
 * que el dispositivo tiene la hora bien configurada (Android la sincroniza
 * por NTP). Soporta rangos que cruzan medianoche (ej. 23 a 06).
 */

// "Lo mas oscura posible" sin parecer una pantalla rota/apagada. 0.94 deja
// un dejo minimo de contenido visible. Subir a 1 = negro total. Ajustar aca.
const OPACIDAD_ATENUADO = 0.94

// Cada cuanto se re-evalua si estamos dentro del rango de atenuado.
const CHECK_INTERVAL_MS = 30 * 1000

/*
 * Parsea "HH" o "HH:MM" (24hs) a minutos desde medianoche.
 * Devuelve null si el formato es invalido o el valor esta fuera de rango.
 */
function parseHora(raw?: string): number | null {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/*
 * True si `ahora` (minutos desde medianoche) cae dentro de [desde, hasta).
 * Maneja rangos que cruzan medianoche: si desde > hasta, el rango es
 * [desde, 24h) U [0, hasta).
 */
function estaEnRango(ahora: number, desde: number, hasta: number): boolean {
  if (desde === hasta) return false // rango vacio = nunca atenuar
  if (desde < hasta) return ahora >= desde && ahora < hasta
  return ahora >= desde || ahora < hasta
}

/*
 * Hook que devuelve si la pantalla deberia estar atenuada AHORA.
 * Usa useSyncExternalStore (en vez de useState + useEffect) para evitar
 * el lint set-state-in-effect de React 19 y porque es el patron correcto
 * para suscribirse a una fuente externa que cambia con el tiempo (el reloj).
 */
function useAtenuado(desdeMin: number | null, hastaMin: number | null): boolean {
  const subscribe = useCallback((callback: () => void) => {
    const id = window.setInterval(callback, CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  const getSnapshot = useCallback(() => {
    if (desdeMin === null || hastaMin === null) return false
    const ahora = new Date()
    const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes()
    return estaEnRango(ahoraMin, desdeMin, hastaMin)
  }, [desdeMin, hastaMin])

  // En SSR no atenuamos (getServerSnapshot = false). Evita mismatch de
  // hidratacion: el server no conoce la hora local del dispositivo.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

interface DimOverlayProps {
  desde?: string
  hasta?: string
}

export default function DimOverlay({ desde, hasta }: DimOverlayProps) {
  const desdeMin = parseHora(desde)
  const hastaMin = parseHora(hasta)
  const atenuado = useAtenuado(desdeMin, hastaMin)

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background: '#000',
        opacity: atenuado ? OPACIDAD_ATENUADO : 0,
        transition: 'opacity 2s ease',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    />
  )
}
