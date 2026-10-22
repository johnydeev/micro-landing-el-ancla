'use client'

import { useState, useTransition } from 'react'

import type { ResultadoAccion } from '@/app/admin/actions'

/*
 * Corre una Server Action del panel: `pendiente` para el spinner/disabled y
 * `error` para mostrar al lado del control. Si la accion tira (red caida, o la
 * sesion vencio y redirige al login), se muestra un error generico: la
 * navegacion al login la hace Next igual.
 */
export function useAccion() {
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function correr(accion: () => Promise<ResultadoAccion>, alTerminarBien?: () => void) {
    setError(null)
    startTransition(async () => {
      try {
        const r = await accion()
        if (r.ok) alTerminarBien?.()
        else setError(r.error)
      } catch {
        setError('No se pudo. Probá de nuevo.')
      }
    })
  }

  return { pendiente, error, correr, limpiarError: () => setError(null) }
}
