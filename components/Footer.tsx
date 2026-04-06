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
        <span>📞 11 6000 7394</span>
        <span className="opacity-60">|</span>
        <span>📍 Av. San Martín 3153, Florencio Varela</span>
        <span className="opacity-60">|</span>
        <span>🕐 Lun a Sáb: 8 a 13hs y 17 a 20hs</span>
      </div>
    </footer>
  )
}
