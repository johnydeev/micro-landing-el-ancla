export function formatPrecio(precio: string): string {
  // El cliente carga precios en Sheets, y puede usar formato AR ("1.500,50",
  // con punto de miles y coma decimal) o formato JS/US ("1500.50"). Si lo
  // pasaramos directo a Number() perderiamos los miles: Number("1.500") === 1.5.
  // Convencion: si hay coma, asumimos formato AR y reemplazamos puntos por
  // nada (miles) y la coma por punto (decimal). Si no hay coma, lo dejamos
  // como esta — funciona igual para "1500" y para "1500.50".
  const limpio = precio.trim()
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio
  const num = Number(normalizado)
  if (Number.isNaN(num)) return `$${precio}`
  return `$${num.toLocaleString('es-AR')}`
}
