import type { ComponentType } from 'react'

import type { PlantillaCartelId } from '@/lib/plantillas'
import CartelClasico, { type CartelProps } from './cartel/Clasico'

export type { CartelProps }

/*
 * Catalogo de plantillas de cartel. Tipado contra PlantillaCartelId
 * (lib/plantillas.ts): agregar un id alla sin agregar el componente aca no
 * compila, y viceversa.
 */
export const CATALOGO_CARTELES: Record<PlantillaCartelId, ComponentType<CartelProps>> = {
  clasico: CartelClasico,
}
