import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decidirAcceso, parsearEstado, type Acceso, type EstadoBase } from './acceso-decision.ts'

const AHORA = Date.parse('2026-10-20T12:00:00-03:00')
const TELE = { id: 'k3x9q2', tenant: 'el-latigo', rubros: ['vacuno'] }

const rubros = (acceso: Acceso) => {
  assert.equal(acceso.tipo, 'ok')
  return acceso.tipo === 'ok' && acceso.rubros ? [...acceso.rubros].sort() : null
}

const estado = (over: {
  comercio?: Partial<NonNullable<EstadoBase['comercio']>> | null
  tele?: Partial<NonNullable<EstadoBase['tele']>> | null
}): EstadoBase => ({
  comercio:
    over.comercio === null
      ? null
      : { requiereActivacion: false, pagadoHasta: null, ...over.comercio },
  tele: over.tele === null || over.tele === undefined ? null : { activa: true, rubros: null, ...over.tele },
})

const decidir = (
  e: EstadoBase | null,
  tele: typeof TELE | null = TELE,
  rubroParam: string | string[] | undefined = undefined,
) => decidirAcceso({ estado: e, tele, rubroParam, ahoraMs: AHORA })

test('estado null muestra con rubros de la cookie', () => {
  assert.deepEqual(rubros(decidir(null)), ['vacuno'])
  assert.deepEqual(rubros(decidir(null, null, 'cerdo')), ['cerdo'])
})

test('comercio null es sin control', () => {
  assert.equal(rubros(decidir(estado({ comercio: null }), null)), null)
})

test('pago vencido suspende', () => {
  assert.equal(decidir(estado({ comercio: { pagadoHasta: '2026-10-14' } })).tipo, 'suspendida')
  assert.equal(decidir(estado({ comercio: { pagadoHasta: '2026-10-15' } })).tipo, 'ok')
})

test('suspendida gana a todo', () => {
  const e = estado({ comercio: { pagadoHasta: '2026-10-01', requiereActivacion: true }, tele: { activa: false } })
  assert.equal(decidir(e).tipo, 'suspendida')
})

test('requiere sin tele no habilita', () => {
  assert.equal(decidir(estado({ comercio: { requiereActivacion: true } }), null).tipo, 'no-habilitada')
})

test('requiere con tele sin fila usa la cookie', () => {
  assert.deepEqual(rubros(decidir(estado({ comercio: { requiereActivacion: true } }))), ['vacuno'])
})

test('switch apagado', () => {
  const e = estado({ comercio: { requiereActivacion: true }, tele: { activa: false } })
  assert.equal(decidir(e).tipo, 'desactivada')
})

test('switch apagado sin requiere', () => {
  assert.equal(decidir(estado({ tele: { activa: false } })).tipo, 'desactivada')
})

test('rubros de la base ganan a la cookie', () => {
  assert.deepEqual(rubros(decidir(estado({ tele: { rubros: ['pollo', 'cerdo'] } }))), ['cerdo', 'pollo'])
})

test('rubros null de la base = todo', () => {
  assert.equal(rubros(decidir(estado({ tele: { rubros: null } }))), null)
})

test('rubros vacios de la base = todo', () => {
  assert.equal(rubros(decidir(estado({ tele: { rubros: [] } }))), null)
})

test('rubros de la base cargados a mano se normalizan', () => {
  assert.deepEqual(rubros(decidir(estado({ tele: { rubros: ['Cerdo', ' POLLO '] } }))), ['cerdo', 'pollo'])
  assert.deepEqual(rubros(decidir(estado({ tele: { rubros: ['res'] } }))), ['vacuno'])
  assert.equal(rubros(decidir(estado({ tele: { rubros: [''] } }))), null)
})

test('sin cookie usa el param', () => {
  assert.deepEqual(rubros(decidir(estado({}), null, 'cerdo')), ['cerdo'])
})

test('parsearEstado acepta la respuesta de la RPC', () => {
  assert.deepEqual(
    parsearEstado({
      comercio: { requiere_activacion: true, pagado_hasta: '2026-10-31' },
      tele: { activa: false, rubros: ['cerdo'] },
    }),
    {
      comercio: { requiereActivacion: true, pagadoHasta: '2026-10-31' },
      tele: { activa: false, rubros: ['cerdo'] },
    },
  )
  assert.deepEqual(parsearEstado({ comercio: null, tele: null }), { comercio: null, tele: null })
  assert.deepEqual(
    parsearEstado({ comercio: { requiere_activacion: false, pagado_hasta: null }, tele: { activa: true, rubros: null } }),
    { comercio: { requiereActivacion: false, pagadoHasta: null }, tele: { activa: true, rubros: null } },
  )
})

test('parsearEstado rechaza basura', () => {
  for (const basura of [
    null,
    'x',
    {},
    { comercio: { requiere_activacion: 'si' }, tele: null },
    { comercio: { requiere_activacion: true, pagado_hasta: 20261031 }, tele: null },
    { comercio: null, tele: 'x' },
    { comercio: null, tele: { activa: true, rubros: [1] } },
  ]) {
    assert.equal(parsearEstado(basura), null, JSON.stringify(basura))
  }
})
