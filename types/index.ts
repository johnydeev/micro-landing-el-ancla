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
}
