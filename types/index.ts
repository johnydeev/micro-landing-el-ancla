export interface Producto {
  categoria: string
  nombre: string
  precio: string
  unidad: string
}

export interface Oferta {
  nombre: string
  precio: string
  imagen: string
  estado: 'ACTIVO' | 'INACTIVO'
}
