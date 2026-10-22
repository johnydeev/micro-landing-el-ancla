'use client'

import { useEffect, useState } from 'react'

import { codigoGuardado, formatearCodigo, type CodigoGuardado } from '@/lib/codigo-alta'

import styles from './CodigoAlta.module.css'

const CICLO_MS = 5000

/* localStorage puede tirar (modo privado, storage bloqueado): sin el, el codigo vive solo en memoria. */
function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function guardar(clave: string, codigo: CodigoGuardado | null): void {
  try {
    if (codigo) storage()?.setItem(clave, JSON.stringify(codigo))
    else storage()?.removeItem(clave)
  } catch {
    /* sin storage: se sigue con el codigo en memoria */
  }
}

/*
 * Codigo de alta en la tele sin activar (spec 2026-10-19, "Alta de una tele
 * con codigo"). Reusa el codigo guardado (la pantalla se recarga cada 10
 * min) y el servidor decide si sigue valido, nunca el reloj de la tele; si no hay, pide uno a POST /api/alta. Cada 5 s
 * pregunta GET /api/alta: vencido/invalido -> pide otro; activada -> el
 * servidor ya puso la cookie y se recarga. Una falla de red o de base no
 * borra el codigo de la pantalla: se reintenta en el proximo ciclo.
 */
export default function CodigoAlta({ slug }: { slug: string }) {
  const [codigo, setCodigo] = useState<CodigoGuardado | null>(null)
  /* 409: comercio sin fila o dado de baja. No hay codigo que mostrar. */
  const [sinAlta, setSinAlta] = useState(false)

  useEffect(() => {
    const clave = `codigo-alta:${slug}`
    let actual: CodigoGuardado | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let vivo = true

    function poner(nuevo: CodigoGuardado | null): void {
      actual = nuevo
      guardar(clave, nuevo)
      if (vivo) setCodigo(nuevo)
    }

    async function pedirCodigo(): Promise<'ok' | 'sin-alta' | 'error'> {
      const r = await fetch('/api/alta', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      if (r.status === 409 || r.status === 404) return 'sin-alta'
      if (!r.ok) return 'error'
      poner((await r.json()) as CodigoGuardado)
      return 'ok'
    }

    async function consultar(c: CodigoGuardado): Promise<void> {
      const qs = new URLSearchParams({ codigo: c.codigo, nonce: c.nonce })
      const r = await fetch(`/api/alta?${qs}`, { cache: 'no-store' })
      if (!r.ok) return
      const { estado } = (await r.json()) as { estado?: string }
      if (estado === 'activada') {
        location.reload()
      } else if (estado === 'vencido' || estado === 'invalido') {
        poner(null)
        await pedirCodigo()
      }
    }

    async function ciclo(): Promise<void> {
      try {
        if (!actual) {
          const guardado = codigoGuardado(storage(), clave)
          if (guardado) {
            actual = guardado
            if (vivo) setCodigo(guardado)
            /* Aunque parezca vencido por el reloj local, decide el servidor. */
            await consultar(guardado)
          } else if ((await pedirCodigo()) === 'sin-alta') {
            if (vivo) setSinAlta(true)
            return
          }
        } else {
          await consultar(actual)
        }
      } catch (error) {
        console.error('[alta] fallo el ciclo, se reintenta', error)
      }
      if (vivo) timer = setTimeout(ciclo, CICLO_MS)
    }

    timer = setTimeout(ciclo, 0)
    return () => {
      vivo = false
      clearTimeout(timer)
    }
  }, [slug])

  if (sinAlta) return null

  return (
    <section className={styles.alta} aria-live="polite">
      <p className={styles.etiqueta}>Código de activación</p>
      <p className={styles.codigo}>{codigo ? formatearCodigo(codigo.codigo) : '···-···'}</p>
    </section>
  )
}
