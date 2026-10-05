import { test } from 'node:test'
import assert from 'node:assert/strict'

import { estadoInicialRotacion, rotationReducer, type RotationState } from './rotacion.ts'

const tick = (listasCount: number, ofertasCount: number) => ({ type: 'tick' as const, listasCount, ofertasCount })

function recorrer(inicial: RotationState, listas: number, ofertas: number, pasos: number): string[] {
  const vistos: string[] = []
  let s = inicial
  for (let i = 0; i < pasos; i += 1) {
    vistos.push(s.modo === 'tabla' ? `T${s.listaIndex}` : `C${s.cartelIndex}`)
    s = rotationReducer(s, tick(listas, ofertas))
  }
  return vistos
}

test('estado inicial: tabla si hay listas, cartel si solo hay ofertas', () => {
  assert.equal(estadoInicialRotacion(2, 3).modo, 'tabla')
  assert.equal(estadoInicialRotacion(2, 0).modo, 'tabla')
  assert.equal(estadoInicialRotacion(0, 3).modo, 'cartel')
  assert.equal(estadoInicialRotacion(0, 0).modo, 'tabla')
})

test('listas y ofertas: recorre todas las listas, todos los carteles y vuelve (comportamiento actual)', () => {
  assert.deepEqual(recorrer(estadoInicialRotacion(2, 2), 2, 2, 6), ['T0', 'T1', 'C0', 'C1', 'T0', 'T1'])
})

test('solo listas: rota entre listas', () => {
  assert.deepEqual(recorrer(estadoInicialRotacion(3, 0), 3, 0, 5), ['T0', 'T1', 'T2', 'T0', 'T1'])
})

test('solo ofertas: nunca pasa a tabla', () => {
  assert.deepEqual(recorrer(estadoInicialRotacion(0, 3), 0, 3, 7), ['C0', 'C1', 'C2', 'C0', 'C1', 'C2', 'C0'])
})

test('solo ofertas: si el estado venia en tabla, salta a cartel', () => {
  const s = rotationReducer({ modo: 'tabla', listaIndex: 0, cartelIndex: 0 }, tick(0, 2))
  assert.deepEqual(s, { modo: 'cartel', listaIndex: 0, cartelIndex: 0 })
})
