import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  avisoPago,
  colorBadge,
  etiquetaRubros,
  etiquetasRepetidas,
  fechaArgentina,
  haceCuanto,
  ordenarAvisos,
  rubrosDeListas,
  siguienteMes,
} from './panel.ts'

const AHORA = Date.parse('2026-10-20T12:00:00-03:00')
const MIN = 60_000
const hace = (ms: number) => new Date(AHORA - ms).toISOString()

test('colorBadge: verde menos de 15 min', () => {
  assert.equal(colorBadge({ activa: true, ultimaConexion: hace(5 * MIN) }, AHORA), 'verde')
  assert.equal(colorBadge({ activa: true, ultimaConexion: hace(14 * MIN + 59_000) }, AHORA), 'verde')
})

test('colorBadge: ambar de 15 a 60 min', () => {
  assert.equal(colorBadge({ activa: true, ultimaConexion: hace(15 * MIN) }, AHORA), 'ambar')
  assert.equal(colorBadge({ activa: true, ultimaConexion: hace(59 * MIN) }, AHORA), 'ambar')
})

test('colorBadge: rojo pasados 60 min o nunca', () => {
  assert.equal(colorBadge({ activa: true, ultimaConexion: hace(61 * MIN) }, AHORA), 'rojo')
  assert.equal(colorBadge({ activa: true, ultimaConexion: null }, AHORA), 'rojo')
})

test('colorBadge: gris si esta dada de baja', () => {
  assert.equal(colorBadge({ activa: false, ultimaConexion: hace(MIN) }, AHORA), 'gris')
})

test('avisoPago', () => {
  assert.equal(avisoPago(null, AHORA), null)
  assert.equal(avisoPago('2026-10-30', AHORA), null)
  assert.deepEqual(avisoPago('2026-10-23', AHORA), { tipo: 'por-vencer', dias: 3 })
  assert.deepEqual(avisoPago('2026-10-20', AHORA), { tipo: 'por-vencer', dias: 0 })
  assert.deepEqual(avisoPago('2026-10-19', AHORA), { tipo: 'vencido', dias: 1 })
  assert.deepEqual(avisoPago('2026-10-10', AHORA), { tipo: 'vencido', dias: 10 })
})

test('siguienteMes', () => {
  assert.equal(siguienteMes('2026-10-10'), '2026-11-10')
  assert.equal(siguienteMes('2026-12-15'), '2027-01-15')
  assert.equal(siguienteMes('2026-01-31'), '2026-02-28')
  assert.equal(siguienteMes('2028-01-31'), '2028-02-29')
  assert.equal(siguienteMes('2026-03-31'), '2026-04-30')
})

test('etiquetaRubros', () => {
  assert.equal(etiquetaRubros(null), 'Todo')
  assert.equal(etiquetaRubros([]), 'Todo')
  assert.equal(etiquetaRubros(['vacuno']), 'Vacuno')
  assert.equal(etiquetaRubros(['pollo', 'cerdo']), 'Cerdo y pollo')
  assert.equal(etiquetaRubros(['vacuno', 'cerdo', 'pollo']), 'Cerdo, pollo y vacuno')
})

test('haceCuanto', () => {
  assert.equal(haceCuanto(null, AHORA), 'nunca')
  assert.equal(haceCuanto('basura', AHORA), 'nunca')
  assert.equal(haceCuanto(hace(30_000), AHORA), 'hace 0 min')
  assert.equal(haceCuanto(hace(5 * MIN), AHORA), 'hace 5 min')
  assert.equal(haceCuanto(hace(59 * MIN), AHORA), 'hace 59 min')
  assert.equal(haceCuanto(hace(120 * MIN), AHORA), 'hace 2 h')
  assert.equal(haceCuanto(hace(23 * 60 * MIN + 59 * MIN), AHORA), 'hace 23 h')
  assert.equal(haceCuanto(hace(3 * 24 * 60 * MIN), AHORA), 'hace 3 d')
  /* reloj adelantado del lado de la base: no mostrar negativo */
  assert.equal(haceCuanto(hace(-2 * MIN), AHORA), 'hace 0 min')
})

test('fechaArgentina', () => {
  assert.equal(fechaArgentina('2026-10-05'), '05/10/2026')
  assert.equal(fechaArgentina('cualquiera'), 'cualquiera')
})

test('ordenarAvisos: vencidos (mas atraso primero) y despues por vencer (menos dias primero)', () => {
  const orden = ordenarAvisos([
    { slug: 'a', aviso: { tipo: 'por-vencer', dias: 3 } },
    { slug: 'b', aviso: { tipo: 'vencido', dias: 2 } },
    { slug: 'c', aviso: { tipo: 'por-vencer', dias: 0 } },
    { slug: 'd', aviso: { tipo: 'vencido', dias: 10 } },
  ] satisfies { slug: string; aviso: { tipo: 'vencido' | 'por-vencer'; dias: number } }[])
  assert.deepEqual(orden.map((x) => x.slug), ['d', 'b', 'c', 'a'])
})

test('etiquetasRepetidas', () => {
  const r = etiquetasRepetidas([{ rubros: ['vacuno'] }, { rubros: null }, { rubros: ['vacuno'] }, { rubros: [] }])
  assert.deepEqual([...r].sort(), ['Todo', 'Vacuno'])
  assert.equal(etiquetasRepetidas([{ rubros: ['cerdo'] }, { rubros: ['pollo'] }]).size, 0)
})

test('rubrosDeListas: unicos, ordenados, sin vacios', () => {
  const listas = [
    { productos: [{ rubro: 'vacuno' }, { rubro: 'cerdo' }, {}] },
    { productos: [{ rubro: 'cerdo' }, { rubro: 'pollo' }] },
  ]
  assert.deepEqual(rubrosDeListas(listas), ['cerdo', 'pollo', 'vacuno'])
  assert.deepEqual(rubrosDeListas([]), [])
})
