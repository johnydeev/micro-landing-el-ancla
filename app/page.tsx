import AutoRefresh from '@/components/AutoRefresh'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getProductos } from '@/lib/sheets'

function formatPrecio(precio: string): string {
  const num = Number(precio)
  if (isNaN(num)) return `$${precio}`
  return `$${num.toLocaleString('es-AR')}`
}

export default async function Home() {
  const productos = await getProductos()
  const tdBase = {
    padding: '1vh 40px',
    borderBottom: '1px solid #e5e7eb',
  }

  return (
    <main style={{ minHeight: '100vh', background: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AutoRefresh />
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', aspectRatio: '16/9', maxWidth: 'calc(100vh * 16 / 9)', maxHeight: '100vh' }}>
        <Header />
        <div style={{ flex: 1, overflow: 'hidden', background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' as const }}>
            <thead>
              <tr style={{ backgroundColor: '#1E3A8A' }}>
                <th style={{ color: 'white', fontWeight: 'bold', textTransform: 'uppercase' as const, textAlign: 'left' as const, padding: '1.5vh 40px', fontSize: 'clamp(14px, 1.8vw, 28px)', width: '75%' }}>
                  Descripción
                </th>
                <th style={{ color: 'white', fontWeight: 'bold', textTransform: 'uppercase' as const, textAlign: 'right' as const, padding: '1.5vh 40px', fontSize: 'clamp(14px, 1.8vw, 28px)', width: '25%' }}>
                  Precio
                </th>
              </tr>
            </thead>
            <tbody>
              {productos.length > 0 ? (
                productos.map((producto, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FFF0F0' }}>
                    <td style={{ ...tdBase, color: '#1E3A8A', fontWeight: 600, textTransform: 'uppercase' as const, fontSize: 'clamp(12px, 1.6vw, 26px)' }}>
                      {producto.nombre}
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
                      <span style={{ color: '#E31E24', fontWeight: 'bold', fontSize: 'clamp(14px, 1.8vw, 28px)', display: 'block' }}>
                        {formatPrecio(producto.precio)}
                      </span>
                      {producto.unidad && (
                        <span style={{ color: '#6b7280', fontSize: 'clamp(8px, 0.9vw, 14px)', display: 'block' }}>
                          por {producto.unidad}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} style={{ ...tdBase, textAlign: 'center', color: '#9ca3af', fontSize: 'clamp(12px, 1.6vw, 26px)' }}>
                    Sin productos disponibles
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Footer />
      </div>
    </main>
  )
}
