import { Producto } from '@/types'

interface ProductCardProps {
  producto?: Producto
  loading?: boolean
}

export default function ProductCard({ producto, loading }: ProductCardProps) {
  if (loading || !producto) {
    return (
      <div className="relative flex flex-col items-center justify-center bg-white h-full p-[1vw]">
        <div className="animate-pulse flex flex-col items-center gap-[1vh] w-full">
          <div className="h-[2vw] w-3/4 rounded" style={{ backgroundColor: '#e0e0e0' }} />
          <div className="h-[1.5vw] w-1/2 rounded" style={{ backgroundColor: '#e0e0e0' }} />
          <div
            className="rounded-full"
            style={{ width: '8vw', height: '8vw', backgroundColor: '#e0e0e0' }}
          />
          <div
            className="rounded-full"
            style={{ width: '10vw', height: '10vw', backgroundColor: '#e0e0e0' }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col items-center justify-between bg-white h-full overflow-hidden p-[1vw]">
      {/* Triángulo con etiqueta */}
      {producto.etiqueta && (
        <div className="absolute top-0 left-0" style={{ width: '8vw', height: '8vw' }}>
          <div
            className="absolute top-0 left-0"
            style={{
              width: 0,
              height: 0,
              borderLeft: '8vw solid #E31E24',
              borderBottom: '8vw solid transparent',
            }}
          />
          <span
            className="absolute text-white font-bold uppercase"
            style={{
              fontSize: 'clamp(6px, 0.8vw, 14px)',
              top: '1.8vw',
              left: '0.4vw',
              transform: 'rotate(-45deg)',
              transformOrigin: 'center',
            }}
          >
            {producto.etiqueta}
          </span>
        </div>
      )}

      {/* Nombre */}
      <h2
        className="font-bold uppercase text-center mt-[2vw]"
        style={{
          color: '#1E3A8A',
          fontSize: 'clamp(10px, 1.8vw, 28px)',
          lineHeight: 1.2,
        }}
      >
        {producto.nombre}
      </h2>

      {/* Detalle */}
      {producto.detalle && (
        <span
          className="text-gray-500 text-center"
          style={{ fontSize: 'clamp(8px, 1.1vw, 18px)' }}
        >
          {producto.detalle}
        </span>
      )}

      {/* Emoji decorativo */}
      <span style={{ fontSize: 'clamp(24px, 4vw, 64px)' }}>🥩</span>

      {/* Burbuja de precio */}
      <div
        className="rounded-full flex flex-col items-center justify-center text-white"
        style={{
          backgroundColor: '#1E3A8A',
          width: 'clamp(60px, 10vw, 160px)',
          height: 'clamp(60px, 10vw, 160px)',
        }}
      >
        <span
          className="font-black leading-none"
          style={{ fontSize: 'clamp(14px, 2.6vw, 42px)' }}
        >
          ${producto.precio}
        </span>
        <span
          className="opacity-80"
          style={{ fontSize: 'clamp(6px, 0.8vw, 14px)' }}
        >
          {producto.unidad}
        </span>
      </div>
    </div>
  )
}
