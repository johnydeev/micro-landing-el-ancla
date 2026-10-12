import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  firmarCookie,
  firmarLink,
  normalizarRubros,
  pagoVencido,
  verificarCookie,
  verificarLink,
} from './activacion.ts'

const S = 'secreto-de-prueba'
const AHORA = 1_800_000_000_000
const H = 60 * 60 * 1000
const TELE = { id: 'k3x9q2', tenant: 'el-latigo', rubros: ['cerdo', 'pollo'] }

const partes = (path: string) => path.split('/')

test('link valido devuelve la tele', () => {
  const link = firmarLink(TELE, AHORA + 2 * H, S)
  assert.deepEqual(verificarLink(partes(link), AHORA, S), TELE)
})

test('link sin rubros = todo', () => {
  const link = firmarLink({ ...TELE, rubros: null }, AHORA + H, S)
  assert.match(link, /^el-latigo\/todo\//)
  assert.equal(verificarLink(partes(link), AHORA, S)?.rubros, null)
})

test('rubro con espacio viaja codificado y se verifica', () => {
  const link = firmarLink({ ...TELE, rubros: ['carne vacuna'] }, AHORA + H, S)
  assert.match(link, /carne%20vacuna/)
  assert.deepEqual(verificarLink(partes(link), AHORA, S)?.rubros, ['carne vacuna'])
  // Next puede entregar el param ya decodificado.
  assert.deepEqual(verificarLink(partes(decodeURIComponent(link)), AHORA, S)?.rubros, ['carne vacuna'])
})

test('segmento con % suelto no rompe', () => {
  assert.equal(verificarLink(['el-latigo', '%', 'k3x9q2', 'zz', 'x'], AHORA, S), null)
})

test('link vencido, adulterado o con otro secreto no pasa', () => {
  const link = firmarLink(TELE, AHORA + H, S)
  assert.equal(verificarLink(partes(link), AHORA + 2 * H, S), null)
  assert.equal(verificarLink(partes(link.replace('cerdo,pollo', 'todo')), AHORA, S), null)
  assert.equal(verificarLink(partes(link.replace('el-latigo', 'demo')), AHORA, S), null)
  assert.equal(verificarLink(partes(link), AHORA, 'otro'), null)
  assert.equal(verificarLink(['el-latigo'], AHORA, S), null)
})

test('cookie: ida y vuelta, y adulterada no pasa', () => {
  const valor = firmarCookie(TELE, S)
  assert.deepEqual(verificarCookie(valor, S), TELE)
  const [datos, firma] = valor.split('.')
  const otra = Buffer.from(JSON.stringify({ ...TELE, rubros: null })).toString('base64url')
  assert.equal(verificarCookie(`${otra}.${firma}`, S), null)
  assert.equal(verificarCookie(`${datos}.${firma}`, 'otro'), null)
  assert.equal(verificarCookie('basura', S), null)
})

test('normalizarRubros', () => {
  assert.deepEqual(normalizarRubros('Cerdo, RES'), ['cerdo', 'vacuno'])
  assert.equal(normalizarRubros('Todo'), null)
  assert.equal(normalizarRubros(undefined), null)
})

test('pagoVencido respeta los dias de gracia', () => {
  const dia = Date.parse('2026-10-20T12:00:00-03:00')
  assert.equal(pagoVencido('2026-10-20', dia, 5), false)
  assert.equal(pagoVencido('2026-10-14', dia, 6), false)
  assert.equal(pagoVencido('2026-10-14', dia, 5), true)
  assert.equal(pagoVencido('fecha-mal', dia, 0), false)
})
