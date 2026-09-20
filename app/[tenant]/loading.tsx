// Pantalla de carga mientras se resuelven los fetch a Google Sheets. Es
// generica (sin nombre ni paleta): loading.tsx no recibe params en Next, asi
// que no puede saber el tenant. Dura ~1s al arrancar.
//
// Solo existe en este segmento, no en app/: un loading.tsx en la raiz crea un
// boundary de Suspense que hace que el notFound() de [tenant]/layout.tsx
// responda 200 en vez de 404 (la respuesta ya empezo a streamear). Verificado
// en sesion 21.
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
          background: '#222',
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
          Precios
        </span>
        <span
          style={{
            fontSize: 'clamp(14px, 1.6vw, 24px)',
            opacity: 0.9,
          }}
        >
          Cargando…
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
