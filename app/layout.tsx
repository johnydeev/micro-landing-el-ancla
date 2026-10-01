import type { Metadata } from 'next'
import { Geist } from 'next/font/google'

import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Cartelería de precios',
  description: 'Pantalla de precios y ofertas para comercios',
}

// NO hay app/icon.png ni app/apple-icon.png: eran el logo del primer comercio y,
// al ser globales, se colaban como miniatura al compartir el link de cualquier
// otro (WhatsApp cae al apple-touch-icon cuando no hay Open Graph). Icono,
// manifest, theme-color y preview son por tenant:
// app/[tenant]/layout.tsx y app/[tenant]/manifest.webmanifest/route.ts.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${geistSans.variable}`}>
      {/* Reset (margin/padding/overflow) vive en app/globals.css para no
          depender de utilidades de Tailwind v4 que podrian cambiar de API. */}
      <body style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  )
}
