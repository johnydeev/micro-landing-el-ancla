'use client'

import { useEffect, useState } from 'react'
import { Producto } from '@/types'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

function formatPrecio(precio: string): string {
  const num = Number(precio)
  if (isNaN(num)) return `$${precio}`
  return `$${num.toLocaleString('es-AR')}`
}

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

        {/* Tabla de precios */}
        <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ backgroundColor: '#1E3A8A' }}>
                <th
                  className="text-white font-bold uppercase text-left"
                  style={{
                    fontSize: 'clamp(14px, 1.8vw, 28px)',
                    padding: 'clamp(8px, 1.2vh, 20px) 0 clamp(8px, 1.2vh, 20px) clamp(16px, 2vw, 40px)',
                  }}
                >
                  Descripción
                </th>
                <th
                  className="text-white font-bold uppercase text-right"
                  style={{
                    fontSize: 'clamp(14px, 1.8vw, 28px)',
                    padding: 'clamp(8px, 1.2vh, 20px) clamp(16px, 2vw, 40px) clamp(8px, 1.2vh, 20px) 0',
                    width: '25%',
                  }}
                >
                  Precio
                </th>
              </tr>
            </thead>
          </table>

          <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '75%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="text-center"
                      style={{
                        color: '#9ca3af',
                        fontSize: 'clamp(12px, 1.6vw, 26px)',
                        padding: 'clamp(20px, 4vh, 60px) 0',
                      }}
                    >
                      Cargando precios...
                    </td>
                  </tr>
                ) : productos.length > 0 ? (
                  productos.map((producto, i) => (
                    <tr
                      key={i}
                      style={{
                        backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FFF0F0',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      <td
                        className="uppercase"
                        style={{
                          color: '#1E3A8A',
                          fontWeight: 600,
                          fontSize: 'clamp(12px, 1.6vw, 26px)',
                          padding: 'clamp(6px, 1vh, 16px) 0 clamp(6px, 1vh, 16px) clamp(16px, 2vw, 40px)',
                        }}
                      >
                        {producto.nombre}
                      </td>
                      <td
                        className="text-right align-middle"
                        style={{
                          padding: 'clamp(6px, 1vh, 16px) clamp(16px, 2vw, 40px) clamp(6px, 1vh, 16px) 0',
                        }}
                      >
                        <span
                          className="font-bold block leading-tight"
                          style={{
                            color: '#E31E24',
                            fontSize: 'clamp(14px, 1.8vw, 28px)',
                          }}
                        >
                          {formatPrecio(producto.precio)}
                        </span>
                        {producto.unidad && (
                          <span
                            className="block leading-tight"
                            style={{
                              color: '#6b7280',
                              fontSize: 'clamp(8px, 0.9vw, 14px)',
                            }}
                          >
                            por {producto.unidad}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={2}
                      className="text-center"
                      style={{
                        color: '#9ca3af',
                        fontSize: 'clamp(12px, 1.6vw, 26px)',
                        padding: 'clamp(20px, 4vh, 60px) 0',
                      }}
                    >
                      Sin productos disponibles
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Footer />
      </div>
    </main>
  )
}
