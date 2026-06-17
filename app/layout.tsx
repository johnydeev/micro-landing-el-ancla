import type { Metadata } from 'next'
import { Geist } from 'next/font/google'

import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Granja El Ancla - Ofertas',
  description: 'Pantalla de ofertas de Granja El Ancla - Desde 1984, una tradición en Florencio Varela',
}

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
