/*
 * Ids de las plantillas de cartel de oferta.
 *
 * Viven aca (y no en templates/index.ts) a proposito: este modulo no importa
 * React ni componentes .tsx, asi que lo pueden usar lib/sheets.ts (server) y
 * los tests de `node --test` (que no compilan JSX). templates/index.ts se
 * tipa contra PlantillaCartelId, asi que agregar un id aca sin agregar el
 * componente al catalogo no compila.
 *
 * Agregar una plantilla = 1) id aca, 2) componente en templates/cartel/,
 * 3) entrada en CATALOGO_CARTELES. Y agregar el id al desplegable de la
 * columna "plantilla" en la planilla de cada cliente que la quiera usar.
 */
export const PLANTILLAS_CARTEL = ['clasico'] as const

export type PlantillaCartelId = (typeof PLANTILLAS_CARTEL)[number]

const COMBINING_DIACRITICS = new RegExp('[\u0300-\u036f]', 'g')

/*
 * Lo que el cliente escribe en el desplegable -> forma canonica de un id:
 * minusculas, sin acentos, espacios a guiones ("Clásico" -> "clasico",
 * "Foto grande" -> "foto-grande"). No valida contra el catalogo.
 */
export function slugificarPlantilla(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/\s+/g, '-')
}

/*
 * Normaliza y valida contra el catalogo. Devuelve undefined si esta vacio o
 * no coincide con ningun id: el caller cae al default del tenant.
 */
export function normalizarPlantilla(raw: string): PlantillaCartelId | undefined {
  const id = slugificarPlantilla(raw)
  if (id === '') return undefined
  return (PLANTILLAS_CARTEL as readonly string[]).includes(id)
    ? (id as PlantillaCartelId)
    : undefined
}
