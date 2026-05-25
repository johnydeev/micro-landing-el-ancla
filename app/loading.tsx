import { negocioConfig } from '@/config/negocio'

// Pantalla de carga inicial mientras se resuelven los fetch a Google Sheets
// en el Server Component. Mantiene el branding del local en vez de mostrar
// un placeholder generico.
export default function Loading() {
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
            fontSize: 'clamp(14px, 1.6vw, 24px)',
            opacity: 0.9,
          }}
        >
          Cargando ofertas…
        </span>
        <div
          aria-hidden
          style={{
            marginTop: '3vh',
            width: 'clamp(40px, 6vw, 80px)',
            height: 'clamp(40px, 6vw, 80px)',
            borderRadius: '50%',
            border: '4px solid rgba(255, 255, 255, 0.3)',
            borderTopColor: '#fff',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  )
}
