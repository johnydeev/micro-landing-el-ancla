/*
 * Estado de la rotacion entre tabla de precios y cartel de oferta,
 * manejado con useReducer para tener una sola transicion atomica por
 * tick. Antes usabamos 3 useState separados (modo, listaIndex,
 * cartelIndex) y las transiciones entre modos requerian llamar a un
 * setter dentro del updater de otro setter — anti-patron de React que
 * puede causar dispatches duplicados o estados inconsistentes
 * acumulativos. El reducer resuelve todo en una sola actualizacion.
 *
 * Vive fuera de components/PantallaRotativa.tsx para poder testearlo con
 * `node --test`.
 */
export type RotationState = {
  modo: 'tabla' | 'cartel'
  listaIndex: number
  cartelIndex: number
}

export type RotationAction = {
  type: 'tick'
  listasCount: number
  ofertasCount: number
}

/*
 * Una pantalla filtrada por rubro puede tener ofertas y ninguna lista. En
 * ese caso arranca y se queda en modo cartel: si pasara por tabla
 * mostraria el empty state ("Estamos actualizando...") entre ofertas.
 */
function soloCarteles(listasCount: number, ofertasCount: number): boolean {
  return listasCount === 0 && ofertasCount > 0
}

export function estadoInicialRotacion(listasCount: number, ofertasCount: number): RotationState {
  return {
    modo: soloCarteles(listasCount, ofertasCount) ? 'cartel' : 'tabla',
    listaIndex: 0,
    cartelIndex: 0,
  }
}

export function rotationReducer(state: RotationState, action: RotationAction): RotationState {
  const { listasCount, ofertasCount } = action

  if (soloCarteles(listasCount, ofertasCount)) {
    const siguiente =
      state.modo === 'cartel' && state.cartelIndex < ofertasCount - 1 ? state.cartelIndex + 1 : 0
    return { modo: 'cartel', listaIndex: 0, cartelIndex: siguiente }
  }

  if (state.modo === 'tabla') {
    if (state.listaIndex < listasCount - 1) {
      return { ...state, listaIndex: state.listaIndex + 1 }
    }
    if (ofertasCount > 0) {
      return { modo: 'cartel', listaIndex: 0, cartelIndex: 0 }
    }
    return { ...state, listaIndex: 0 }
  }

  // modo === 'cartel'
  if (state.cartelIndex < ofertasCount - 1) {
    return { ...state, cartelIndex: state.cartelIndex + 1 }
  }
  return { modo: 'tabla', listaIndex: 0, cartelIndex: 0 }
}
