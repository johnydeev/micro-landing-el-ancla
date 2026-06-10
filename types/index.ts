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
   * Tamano de la imagen dentro del cartel, en escala 1-5.
   * 1 = 60% del wrapper (mas chica), 5 = 100% (llena el wrapper).
   * 3 (=80%) es el default y se aplica si la columna falta o el valor
   * no es valido. Definido en lib/sheets.ts -> parseTamanoOferta.
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
}
