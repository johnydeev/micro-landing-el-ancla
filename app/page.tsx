'use client'

import { useEffect, useState } from 'react'
import { Producto } from '@/types'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ProductCard from '@/components/ProductCard'

export default function Home() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)

  const fetchProductos = async () => {
    try {
      const res = await fetch('/api/productos')
      const data = await res.json()
      setProductos(data)
    } catch (error) {
      console.error('Error fetching productos:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProductos()
    const interval = setInterval(fetchProductos, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      <div
        className="w-full flex flex-col overflow-hidden"
        style={{
          aspectRatio: '16/9',
          maxWidth: 'calc(100vh * 16 / 9)',
          maxHeight: '100vh',
        }}
      >
        <Header />

        {/* Grid de productos */}
        <div className="flex-1 grid grid-cols-4" style={{ backgroundColor: '#f0f0f0', gap: '3px' }}>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <ProductCard key={i} loading />
              ))
            : productos.length > 0
              ? productos.map((producto, i) => (
                  <ProductCard key={i} producto={producto} />
                ))
              : Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white flex items-center justify-center">
                    <span
                      className="text-gray-400"
                      style={{ fontSize: 'clamp(10px, 1.4vw, 22px)' }}
                    >
                      Sin productos
                    </span>
                  </div>
                ))
          }
        </div>

        <Footer />
      </div>
    </main>
  )
}
