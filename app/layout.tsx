import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
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
      <body className="m-0 p-0 overflow-hidden" style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
