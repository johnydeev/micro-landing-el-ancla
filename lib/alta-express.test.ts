import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  armarEscriturasConfig,
  comillasA1,
  elegirGidListas,
  pareceHtml,
  parsearClienteExpress,
  urlExportCsv,
} from './alta-express.ts'

const BASE = {
  nombre: 'Carnicería López',
  colores: { primario: '#112233', secundario: '#445566' },
  planilla: { templateId: 'abc123' },
}

test('parsearClienteExpress: minimal valido', () => {
  const c = parsearClienteExpress(BASE)
  assert.equal(c.nombre, 'Carnicería López')
  assert.equal(c.slug, undefined)
  assert.equal(c.planilla.templateId, 'abc123')
})

test('parsearClienteExpress: completo', () => {
  const c = parsearClienteExpress({
    ...BASE,
    slug: 'carniceria-lopez',
    eslogan: 'Desde 1990',
    badgeOferta: 'SUPER OFERTA',
    contacto: { whatsapp: '11 2222 3333', instagram: 'carniceria', horarios: 'Lun a Sab' },
    logo: 'logo.png',
    planilla: {
      sheetId: 'sheet1',
      titulo: 'Precios López',
      config: { horarios: 'Lun a Sab', segundosCartel: 5, segundosTabla: 4 },
    },
  })
  assert.equal(c.slug, 'carniceria-lopez')
  assert.equal(c.contacto?.instagram, 'carniceria')
  assert.deepEqual(c.planilla.config, { horarios: 'Lun a Sab', segundosCartel: 5, segundosTabla: 4 })
})

test('parsearClienteExpress: rechaza lo que falta o esta mal', () => {
  assert.throws(() => parsearClienteExpress(null), /objeto/)
  assert.throws(() => parsearClienteExpress({ ...BASE, nombre: '' }), /nombre/)
  assert.throws(() => parsearClienteExpress({ ...BASE, slug: 'Con Mayusculas' }), /slug/)
  assert.throws(() => parsearClienteExpress({ ...BASE, colores: { primario: 'rojo' } }), /colores\.primario/)
  assert.throws(() => parsearClienteExpress({ ...BASE, planilla: {} }), /templateId/)
  assert.throws(
    () => parsearClienteExpress({ ...BASE, planilla: { templateId: 'x', config: { inventada: 1 } } }),
    /no es una clave conocida/,
  )
})

test('urlExportCsv: link compartido, con y sin gid', () => {
  assert.equal(
    urlExportCsv('abc_DEF-123'),
    'https://docs.google.com/spreadsheets/d/abc_DEF-123/export?format=csv',
  )
  assert.equal(
    urlExportCsv('abc', '2121126279'),
    'https://docs.google.com/spreadsheets/d/abc/export?format=csv&gid=2121126279',
  )
})

test('comillasA1 escapa comillas simples', () => {
  assert.equal(comillasA1("Configuración"), "'Configuración'")
  assert.equal(comillasA1("Hoja d'cliente"), "'Hoja d''cliente'")
})

test('elegirGidListas: prioriza tabla/precio y excluye ofertas y config', () => {
  const gids = { gidOfertas: '2', gidConfig: '3' }
  assert.equal(
    elegirGidListas(
      [
        { nombre: 'Portada', gid: '1' },
        { nombre: 'Ofertas', gid: '2' },
        { nombre: 'Configuración', gid: '3' },
        { nombre: 'Tablas de Precios', gid: '4' },
        { nombre: 'Precios', gid: '5' },
      ],
      gids,
    ),
    '4',
  )
  assert.equal(
    elegirGidListas(
      [
        { nombre: 'Portada', gid: '1' },
        { nombre: 'Ofertas', gid: '2' },
        { nombre: 'Configuracion', gid: '3' },
      ],
      gids,
    ),
    '1',
  )
  assert.equal(
    elegirGidListas(
      [
        { nombre: '_catalogo', gid: '1' },
        { nombre: 'Precios', gid: '2' },
        { nombre: 'Ofertas', gid: '3' },
        { nombre: 'Configuracion', gid: '4' },
        { nombre: 'Tablas de Precios', gid: '5' },
      ],
      { gidOfertas: '3', gidConfig: '4' },
    ),
    '5',
  )
})

test('elegirGidListas: sin pestaña de listas tira con la lista de pestañas', () => {
  assert.throws(
    () =>
      elegirGidListas(
        [
          { nombre: '_catalogo', gid: '1' },
          { nombre: 'Ofertas', gid: '2' },
          { nombre: 'Config', gid: '3' },
        ],
        { gidOfertas: '2', gidConfig: '3' },
      ),
    /listas de precios.*"Ofertas" \(gid 2\)/,
  )
})

test('parsearClienteExpress: escribirConfig solo acepta boolean', () => {
  assert.equal(parsearClienteExpress(BASE).planilla.escribirConfig, undefined)
  assert.equal(
    parsearClienteExpress({ ...BASE, planilla: { sheetId: 'x', escribirConfig: true } }).planilla.escribirConfig,
    true,
  )
  assert.throws(
    () => parsearClienteExpress({ ...BASE, planilla: { sheetId: 'x', escribirConfig: 1 } }),
    /escribirConfig/,
  )
})

test('pareceHtml: detecta la pagina de login de Google', () => {
  assert.equal(pareceHtml('text/html; charset=utf-8', 'x'), true)
  assert.equal(pareceHtml(null, '  <!DOCTYPE html><html>'), true)
  assert.equal(pareceHtml('text/csv', 'Categoria,Nombre,Precio,Unidad'), false)
  assert.equal(pareceHtml(null, 'titulo,precio\n<oferta>,1'), false)
})

test('parsearClienteExpress: compartir solo acepta boolean', () => {
  assert.equal(parsearClienteExpress({ ...BASE, planilla: { sheetId: 'x', compartir: true } }).planilla.compartir, true)
  assert.throws(
    () => parsearClienteExpress({ ...BASE, planilla: { sheetId: 'x', compartir: 'si' } }),
    /compartir/,
  )
})

test('armarEscriturasConfig: escribe B de la fila que corresponde', () => {
  const filas = [
    ['Horarios', 'viejo'],
    [''],
    ['WhatsApp', ''],
    ['Instagram', '@viejo'],
  ]
  const { data, faltantes } = armarEscriturasConfig(
    filas,
    { horarios: 'Lun a Sab 8-20', whatsapp: '11 2222 3333', segundosCartel: 5 },
    'Configuracion',
  )
  assert.deepEqual(faltantes, ['segundosCartel'])
  assert.deepEqual(data, [
    { range: "'Configuracion'!B1", values: [['Lun a Sab 8-20']] },
    { range: "'Configuracion'!B3", values: [['11 2222 3333']] },
  ])
})

test('armarEscriturasConfig: acepta alias de la planilla', () => {
  const { data } = armarEscriturasConfig([['Segundos x ofertas', '3']], { segundosCartel: 6 }, 'Config')
  assert.deepEqual(data, [{ range: "'Config'!B1", values: [['6']] }])
})

test('armarEscriturasConfig: no reutiliza la misma fila para dos claves', () => {
  const { data, faltantes } = armarEscriturasConfig(
    [['Horarios', '']],
    { horarios: 'A', 'horarios de atencion': 'B' },
    'Config',
  )
  assert.equal(data.length, 1)
  assert.deepEqual(faltantes, ['horarios de atencion'])
})
