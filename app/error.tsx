'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'

import { getTenant } from '@/tenants'

// Boundary de errores no controlados. Por contrato de Next, debe ser Client
// Component. Recibe `reset` para reintentar el render del segmento.
// Mostramos branding + datos de contacto (desde el registro de tenants, via
// useParams) en
// vez de un stack trace, porque la pantalla se ve en la vidriera del local
// y la audiencia es publico final.
interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  // Client Component: el tenant se resuelve del path. Si por algun motivo el
  // slug no esta en el registro (no deberia: el layout ya hizo 404), se cae a
  // valores neutros para no romper el boundary de errores.
  // Copia de app/[tenant]/error.tsx para la ruta "/": ahi useParams no trae
  // tenant, asi que se cae al DEFAULT_TENANT (expuesto como NEXT_PUBLIC_).
  const params = useParams<{ tenant?: string }>()
  const slugDefault = process.env.NEXT_PUBLIC_DEFAULT_TENANT
  const tenant = getTenant(params?.tenant ?? slugDefault ?? '')
  const primario = tenant?.paleta.primario ?? '#222'
  const nombre = tenant?.nombre ?? 'Precios'
  const whatsapp = tenant?.defaults.whatsapp ?? ''
  const instagram = tenant?.defaults.instagram ?? ''
  const horarios = tenant?.defaults.horarios ?? ''

  useEffect(() => {
    // Log local para diagnostico; en produccion lo recoge Vercel.
    console.error('[micro-landing] error boundary:', error)
  }, [error])

  // Auto-retry cada 10s. La pantalla se ve en la vidriera del local sin
  // operador cerca, asi que el boton "Reintentar" tiene que activarse solo.
  // Si la red sigue caida, reset() vuelve a fallar y entramos de nuevo al
  // boundary — comportamiento aceptable, no se rompe nada. Cuando vuelve
  // la red, el siguiente intento se renderiza la pantalla normal.
  useEffect(() => {
    const id = window.setInterval(() => {
      reset()
    }, 10_000)
    return () => window.clearInterval(id)
  }, [reset])

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
          background: primario,
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
          {nombre}
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
          <span>📞 {whatsapp}</span>
          <span>📷 {instagram}</span>
          <span>🕐 {horarios}</span>
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
            color: primario,
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
