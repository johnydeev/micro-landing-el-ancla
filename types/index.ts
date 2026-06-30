export interface Producto {
  nombre: string
  precio: string
  unidad: string
}

export interface ListaPrecios {
  titulo: string
  productos: Producto[]
}

export interface Oferta {
  nombre: string
  precio: string
  imagen: string
  estado: 'ACTIVO' | 'INACTIVO'
  /**
   * Tamano de la imagen dentro del cartel, en escala 1-10.
   * 1 = 55% del wrapper (mas chica), 10 = 120% (excede el wrapper).
   * 6 (=91%) es el default y se aplica si la columna falta o el valor
   * no es valido. Parseo en lib/sheets.ts -> parseTamanoOferta, mapeo a
   * porcentaje en components/PantallaRotativa.tsx -> TAMANO_OFERTA_A_ESCALA.
   */
  tamano: number
}

export interface ConfigNegocio {
  segundosCartel?: number
  segundosTabla?: number
  minutosActualizacion?: number
  horarios?: string
  whatsapp?: string
  instagram?: string
  /**
   * Hora (formato 24hs, "HH" o "HH:MM") en que empieza el atenuado de
   * pantalla. Ej: "13" o "13:00". Si falta atenuarDesde o atenuarHasta,
   * la atenuacion queda desactivada. Ver components/DimOverlay.tsx.
   */
  atenuarDesde?: string
  /** Hora (formato 24hs, "HH" o "HH:MM") en que termina el atenuado. Ej: "16". */
  atenuarHasta?: string
}
