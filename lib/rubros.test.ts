import { test } from 'node:test'
import assert from 'node:assert/strict'

import { esHeaderRubro, filtrarPorRubro, normalizarRubro, parseRubrosParam, quitarAcentos } from './rubros.ts'

test('quitarAcentos saca tildes y deja la letra base', () => {
  assert.equal(quitarAcentos('Categoría'), 'Categoria')
  assert.equal(quitarAcentos('FIAMBRERÍA'), 'FIAMBRERIA')
})

test('normalizarRubro: minusculas, sin acentos, espacios colapsados', () => {
  assert.equal(normalizarRubro('CERDO'), 'cerdo')
  assert.equal(normalizarRubro('  Pollo  '), 'pollo')
  assert.equal(normalizarRubro('Fiambrería'), 'fiambreria')
  assert.equal(normalizarRubro('carne   de  cerdo'), 'carne de cerdo')
})

test('normalizarRubro: RES y VACUNO son el mismo rubro', () => {
  assert.equal(normalizarRubro('RES'), 'vacuno')
  assert.equal(normalizarRubro('res'), 'vacuno')
  assert.equal(normalizarRubro('Vacuno'), 'vacuno')
})

test('normalizarRubro: vacio o solo espacios es null', () => {
  assert.equal(normalizarRubro(''), null)
  assert.equal(normalizarRubro('   '), null)
})

test('esHeaderRubro acepta Categoria y Rubro, con o sin acento', () => {
  assert.equal(esHeaderRubro('Categoria'), true)
  assert.equal(esHeaderRubro(' CATEGORÍA '), true)
  assert.equal(esHeaderRubro('Rubro'), true)
  assert.equal(esHeaderRubro('Nombre'), false)
  assert.equal(esHeaderRubro(''), false)
})

test('parseRubrosParam: sin param o vacio es null (sin filtro)', () => {
  assert.equal(parseRubrosParam(undefined), null)
  assert.equal(parseRubrosParam(''), null)
  assert.equal(parseRubrosParam(','), null)
  assert.equal(parseRubrosParam(' , ,'), null)
})

test('parseRubrosParam: uno, varios con coma y param repetido', () => {
  assert.deepEqual(parseRubrosParam('cerdo'), new Set(['cerdo']))
  assert.deepEqual(parseRubrosParam('Cerdo, POLLO'), new Set(['cerdo', 'pollo']))
  assert.deepEqual(parseRubrosParam(['cerdo', 'pollo']), new Set(['cerdo', 'pollo']))
  assert.deepEqual(parseRubrosParam('res,vacuno'), new Set(['vacuno']))
})

const oferta = (nombre: string, rubro?: string) => ({
  nombre,
  precio: '1000',
  imagen: 'x',
  estado: 'ACTIVO' as const,
  tamano: 6,
  descripcion: '',
  ...(rubro ? { rubro } : {}),
})

const data = {
  listas: [
    {
      titulo: 'PARRILLEROS',
      productos: [
        { nombre: 'ASADO', precio: '1', unidad: 'KG', rubro: 'vacuno' },
        { nombre: 'CHORIZO', precio: '2', unidad: 'KG', rubro: 'cerdo' },
      ],
    },
    { titulo: 'POLLO', productos: [{ nombre: 'SUPREMA', precio: '3', unidad: 'KG', rubro: 'pollo' }] },
    { titulo: 'SIN RUBRO', productos: [{ nombre: 'HUEVOS', precio: '4', unidad: 'MAPLE' }] },
  ],
  ofertas: [oferta('FALDA', 'vacuno'), oferta('COSTILLITAS', 'cerdo'), oferta('SUELTA')],
  configRemota: { segundosCartel: 5 },
}

test('filtrarPorRubro: sin filtro devuelve los mismos datos', () => {
  assert.equal(filtrarPorRubro(data, null), data)
})

test('filtrarPorRubro: lista mixta conserva solo los productos del rubro', () => {
  const r = filtrarPorRubro(data, new Set(['cerdo']))
  assert.deepEqual(
    r.listas.map((l) => [l.titulo, l.productos.map((p) => p.nombre)]),
    [['PARRILLEROS', ['CHORIZO']]],
  )
  assert.deepEqual(r.ofertas.map((o) => o.nombre), ['COSTILLITAS'])
})

test('filtrarPorRubro: listas sin coincidencias se descartan y lo sin rubro no pasa', () => {
  const r = filtrarPorRubro(data, new Set(['pollo']))
  assert.deepEqual(r.listas.map((l) => l.titulo), ['POLLO'])
  assert.deepEqual(r.ofertas, [])
})

test('filtrarPorRubro: union de dos rubros y resto de campos intacto', () => {
  const r = filtrarPorRubro(data, new Set(['vacuno', 'pollo']))
  assert.deepEqual(r.listas.map((l) => l.titulo), ['PARRILLEROS', 'POLLO'])
  assert.deepEqual(r.listas[0].productos.map((p) => p.nombre), ['ASADO'])
  assert.deepEqual(r.ofertas.map((o) => o.nombre), ['FALDA'])
  assert.deepEqual(r.configRemota, { segundosCartel: 5 })
})

test('filtrarPorRubro: rubro inexistente deja todo vacio', () => {
  const r = filtrarPorRubro(data, new Set(['cerdp']))
  assert.deepEqual(r.listas, [])
  assert.deepEqual(r.ofertas, [])
})
