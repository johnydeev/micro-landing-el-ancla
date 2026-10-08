import { test } from 'node:test'
import assert from 'node:assert/strict'

import { VIGENCIA_MS, claveGuardado, leerGuardado, resolver } from './ultimo-dato-bueno.ts'

const H = 60 * 60 * 1000
const AHORA = 1_800_000_000_000
const OK = { listas: 'ok', ofertas: 'ok', config: 'ok' } as const

const lista = (titulo: string) => [{ titulo, productos: [{ nombre: 'X', precio: '1', unidad: 'KG' }] }]
const oferta = (nombre: string) => [
  { nombre, precio: '1', imagen: 'x', estado: 'ACTIVO' as const, tamano: 6, descripcion: '' },
]

const recibido = (over: Partial<Parameters<typeof resolver>[0]> = {}) => ({
  listas: lista('NUEVA'),
  ofertas: oferta('NUEVA'),
  configRemota: { segundosCartel: 5 },
  estado: OK,
  generadoEn: AHORA,
  ...over,
})

const guardado = (en: number) => ({
  listas: { datos: lista('VIEJA'), en },
  ofertas: { datos: oferta('VIEJA'), en },
  config: { datos: { segundosCartel: 9 }, en },
})

test('VIGENCIA_MS son 2 horas', () => {
  assert.equal(VIGENCIA_MS, 2 * H)
})

test('todo ok: muestra lo nuevo y lo guarda con la hora del server', () => {
  const r = resolver(recibido(), {})
  assert.equal(r.mostrar.listas[0].titulo, 'NUEVA')
  assert.equal(r.usandoGuardado, false)
  assert.equal(r.guardar.listas?.en, AHORA)
  assert.equal(r.guardar.ofertas?.datos[0].nombre, 'NUEVA')
  assert.deepEqual(r.guardar.config?.datos, { segundosCartel: 5 })
})

test('error con guardado de menos de 2 h: muestra lo guardado y no lo toca', () => {
  const g = guardado(AHORA - 1 * H)
  const r = resolver(
    recibido({ listas: [], ofertas: [], configRemota: {}, estado: { listas: 'error', ofertas: 'error', config: 'error' } }),
    g,
  )
  assert.equal(r.mostrar.listas[0].titulo, 'VIEJA')
  assert.equal(r.mostrar.ofertas[0].nombre, 'VIEJA')
  assert.deepEqual(r.mostrar.configRemota, { segundosCartel: 9 })
  assert.equal(r.usandoGuardado, true)
  assert.deepEqual(r.guardar, g)
})

test('error con guardado justo en el limite de 2 h: todavia vale', () => {
  const r = resolver(recibido({ listas: [], estado: { ...OK, listas: 'error' } }), guardado(AHORA - VIGENCIA_MS))
  assert.equal(r.mostrar.listas[0].titulo, 'VIEJA')
  // Solo fallaron las listas: igual tiene que prender el ambar.
  assert.equal(r.usandoGuardado, true)
})

test('error con guardado de mas de 2 h: vacio (empty state como hoy)', () => {
  const r = resolver(recibido({ listas: [], estado: { ...OK, listas: 'error' } }), guardado(AHORA - VIGENCIA_MS - 1))
  assert.deepEqual(r.mostrar.listas, [])
  assert.equal(r.usandoGuardado, false)
})

test('error sin guardado: vacio', () => {
  const r = resolver(recibido({ ofertas: [], estado: { ...OK, ofertas: 'error' } }), {})
  assert.deepEqual(r.mostrar.ofertas, [])
  assert.equal(r.usandoGuardado, false)
})

test('falla parcial: listas nuevas y ofertas guardadas', () => {
  const r = resolver(recibido({ ofertas: [], estado: { ...OK, ofertas: 'error' } }), guardado(AHORA - H))
  assert.equal(r.mostrar.listas[0].titulo, 'NUEVA')
  assert.equal(r.mostrar.ofertas[0].nombre, 'VIEJA')
  assert.equal(r.usandoGuardado, true)
  assert.equal(r.guardar.listas?.en, AHORA)
  assert.equal(r.guardar.ofertas?.en, AHORA - H)
})

test('ok despues de una falla reinicia la vigencia', () => {
  const r = resolver(recibido(), guardado(AHORA - 1.9 * H))
  assert.equal(r.mostrar.listas[0].titulo, 'NUEVA')
  assert.equal(r.guardar.listas?.en, AHORA)
  assert.equal(r.usandoGuardado, false)
})

test('pagina vieja del SW (ok, pero generada antes que lo guardado): no pisa y muestra lo mas nuevo', () => {
  const g = guardado(AHORA - 10 * 60 * 1000)
  const r = resolver(recibido({ generadoEn: AHORA - H }), g)
  assert.equal(r.mostrar.listas[0].titulo, 'VIEJA')
  assert.deepEqual(r.guardar, g)
})

test('la edad se mide con la hora del server (generadoEn), no con el reloj de la TV', () => {
  // Pagina armada 1 h despues de lo guardado: vigente sin importar el reloj de la TV.
  const r = resolver(recibido({ listas: [], estado: { ...OK, listas: 'error' }, generadoEn: AHORA + H }), guardado(AHORA))
  assert.equal(r.mostrar.listas[0].titulo, 'VIEJA')
})

test('claveGuardado: estable ante el orden de rubros; null = todo', () => {
  assert.equal(claveGuardado('el-latigo', new Set(['pollo', 'cerdo'])), claveGuardado('el-latigo', new Set(['cerdo', 'pollo'])))
  assert.equal(claveGuardado('el-latigo', new Set(['cerdo', 'pollo'])), 'ultimo-dato-bueno:el-latigo:cerdo,pollo')
  assert.equal(claveGuardado('demo', null), 'ultimo-dato-bueno:demo:*')
})

test('leerGuardado: null, JSON roto o no-objeto devuelven {}', () => {
  assert.deepEqual(leerGuardado(null), {})
  assert.deepEqual(leerGuardado('{roto'), {})
  assert.deepEqual(leerGuardado('42'), {})
  assert.deepEqual(leerGuardado('{"listas":{"datos":[],"en":1}}'), { listas: { datos: [], en: 1 } })
})
