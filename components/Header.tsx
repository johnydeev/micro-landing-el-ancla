import LogoSVG from './LogoSVG'

export default function Header() {
  return (
    <header
      className="flex items-center justify-between px-[2vw]"
      style={{ height: '16%', backgroundColor: '#E31E24' }}
    >
      {/* Izquierda: Logo + texto */}
      <div className="flex items-center gap-[1.5vw]">
        <LogoSVG className="h-[10vh] w-auto" />
        <div className="flex flex-col">
          <span
            className="font-bold text-white uppercase tracking-wider"
            style={{ fontSize: 'clamp(14px, 2.2vw, 36px)' }}
          >
            Granja El Ancla
          </span>
          <span
            className="text-white/90 italic"
            style={{ fontSize: 'clamp(8px, 1vw, 18px)' }}
          >
            Desde 1984, una tradición en Florencio Varela
          </span>
        </div>
      </div>

      {/* Derecha: Ofertas */}
      <div className="flex flex-col items-end text-white">
        <span
          className="tracking-wide"
          style={{ fontSize: 'clamp(8px, 1.2vw, 20px)' }}
        >
          ✦ Hoy en oferta ✦
        </span>
        <span
          className="font-black uppercase"
          style={{ fontSize: 'clamp(16px, 3.2vw, 52px)', lineHeight: 1 }}
        >
          SUPER OFERTAS
        </span>
      </div>
    </header>
  )
}
