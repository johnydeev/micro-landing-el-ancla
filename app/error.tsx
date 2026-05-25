'use client'

import { useEffect } from 'react'

import { negocioConfig } from '@/config/negocio'

// Boundary de errores no controlados. Por contrato de Next, debe ser Client
// Component. Recibe `reset` para reintentar el render del segmento.
// Mostramos branding + datos de contacto fijos (desde config/negocio.ts) en
// vez de un stack trace, porque la pantalla se ve en la vidriera del local
// y la audiencia es publico final.
interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log local para diagnostico; en produccion lo recoge Vercel.
    console.error('[micro-landing] error boundary:', error)
  }, [error])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          maxWidth: 'calc(100vh * 16 / 9)',
          maxHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: negocioConfig.colores.primario,
          color: '#fff',
          gap: '2vh',
          padding: '4vh',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: 'clamp(28px, 4vw, 64px)',
            fontWeight: 800,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          {negocioConfig.nombre}
        </span>
        <span
          style={{
            fontSize: 'clamp(16px, 2vw, 30px)',
            opacity: 0.95,
            maxWidth: '70%',
          }}
        >
          Estamos actualizando los precios. Volvé en unos minutos.
        </span>
        <div
          style={{
            marginTop: '3vh',
            fontSize: 'clamp(14px, 1.6vw, 22px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8vh',
            opacity: 0.95,
          }}
        >
          <span>📞 {negocioConfig.whatsapp ?? negocioConfig.telefono}</span>
          <span>📷 {negocioConfig.instagram}</span>
          <span>🕐 {negocioConfig.horarios}</span>
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '3vh',
            padding: '12px 28px',
            borderRadius: 12,
            border: 'none',
            background: '#fff',
            color: negocioConfig.colores.primario,
            fontSize: 'clamp(14px, 1.4vw, 20px)',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Reintentar
        </button>
      </div>
    </main>
  )
}
