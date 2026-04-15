import { negocioConfig } from '@/config/negocio'

export default function Footer() {
  return (
    <footer
      className="flex items-center justify-center text-white"
      style={{ height: '10%', backgroundColor: '#E31E24' }}
    >
      <div
        className="flex items-center gap-[1.5vw] text-center"
        style={{ fontSize: 'clamp(8px, 1.3vw, 22px)' }}
      >
        <span>📞 {negocioConfig.telefono}</span>
        <span className="opacity-60">|</span>
        <span>📍 {negocioConfig.direccion}</span>
        <span className="opacity-60">|</span>
        <span>🕐 {negocioConfig.horarios}</span>
      </div>
    </footer>
  )
}
