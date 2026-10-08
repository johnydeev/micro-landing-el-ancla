import { test } from 'node:test'
import assert from 'node:assert/strict'

import { leerListas, leerOfertas, parsearConfig, parsearListas, parsearOfertas } from './planilla.ts'

/*
 * Fixtures con la misma forma que el CSV publicado de El Ancla (verificado
 * el 05/10/2026): titulos en la fila de arriba de los headers, bloques uno
 * al lado del otro separados por columnas vacias, y la columna Categoria a
 * la izquierda de Nombre.
 */

const LISTAS = [
  'PRECIOS CHURRASCOS,,,,,,PRECIOS CORTES PARRILLEROS,,,',
  'Categoria,Nombre,Precio,Unidad,,,Categoria,Nombre,Precio,Unidad',
  'RES,CUADRIL,20999,KG,,,RES,ASADO,15999,KG',
  'RES,LOMO,19999,KG,,,CERDO,CHORIZO,7900,KG',
  ',,,,,,,,,',
  'PRECIOS CORTES DE POLLO,,,,,,PRECIOS VARIOS,,,',
  'Categoria,Nombre,Precio,Unidad,,,Categoria,Nombre,Precio,Unidad',
  'POLLO,SUPREMA X 2KG,18400,2KG,,,,HUEVOS,3000,MAPLE',
].join('\n')

test('listas: titulos, productos y orden de los bloques', () => {
  const listas = parsearListas(LISTAS)
  assert.deepEqual(
    listas.map((l) => [l.titulo, l.productos.map((p) => p.nombre)]),
    [
      ['PRECIOS CHURRASCOS', ['CUADRIL', 'LOMO']],
      ['PRECIOS CORTES PARRILLEROS', ['ASADO', 'CHORIZO']],
      ['PRECIOS CORTES DE POLLO', ['SUPREMA X 2KG']],
      ['PRECIOS VARIOS', ['HUEVOS']],
    ],
  )
  assert.deepEqual(listas[0].productos[0], { nombre: 'CUADRIL', precio: '20999', unidad: 'KG', rubro: 'vacuno' })
})

test('listas: rubro por producto desde Categoria (RES -> vacuno, lista mixta, celda vacia)', () => {
  const listas = parsearListas(LISTAS)
  assert.deepEqual(listas[1].productos.map((p) => p.rubro), ['vacuno', 'cerdo'])
  assert.equal(listas[2].productos[0].rubro, 'pollo')
  // Celda de Categoria vacia: el producto no lleva la clave rubro.
  assert.equal('rubro' in listas[3].productos[0], false)
})

test('listas: sin columna Categoria los productos no tienen rubro', () => {
  const csv = ['LISTA,,', 'Nombre,Precio,Unidad', 'ASADO,15999,KG'].join('\n')
  assert.deepEqual(parsearListas(csv), [
    { titulo: 'LISTA', productos: [{ nombre: 'ASADO', precio: '15999', unidad: 'KG' }] },
  ])
})

test('listas: acepta "Rubro" y "Categoría" con acento como header', () => {
  const csv = ['A,,,,,B,,,', 'Rubro,Nombre,Precio,Unidad,,Categoría,Nombre,Precio,Unidad', 'CERDO,PECHITO,8999,KG,,POLLO,ALITA,4500,3KG'].join('\n')
  assert.deepEqual(
    parsearListas(csv).map((l) => l.productos[0].rubro),
    ['cerdo', 'pollo'],
  )
})

test('listas: filas sin nombre o sin precio se ignoran y listas vacias se descartan', () => {
  const csv = ['A,,,,,B,,,', 'Categoria,Nombre,Precio,Unidad,,Categoria,Nombre,Precio,Unidad', 'RES,ASADO,,KG,,RES,,100,KG', 'RES,VACIO,20999,KG,,,,,'].join('\n')
  assert.deepEqual(
    parsearListas(csv).map((l) => [l.titulo, l.productos.map((p) => p.nombre)]),
    [['A', ['VACIO']]],
  )
})

test('listas: sin titulo arriba usa "Lista N"', () => {
  const csv = ['Nombre,Precio,Unidad', 'ASADO,15999,KG'].join('\n')
  assert.equal(parsearListas(csv)[0].titulo, 'Lista 1')
})

test('listas: CSV vacio o sin headers devuelve []', () => {
  assert.deepEqual(parsearListas(''), [])
  assert.deepEqual(parsearListas('hola,chau\n1,2'), [])
})

test('listas: campos entre comillas con comas y BOM al inicio', () => {
  const csv = '﻿LISTA,,\nNombre,Precio,Unidad\n"ASADO, BANDEJA",15999,KG'
  assert.equal(parsearListas(csv)[0].productos[0].nombre, 'ASADO, BANDEJA')
})

const OFERTAS = [
  'RES,,,,,,,,,CERDO,,,,,,,,,POLLO,,,,,,',
  'titulo,precio,slug imagen,estado,Tamaño,Nota,plantilla,,,titulo,precio,slug imagen,estado,Tamaño,Nota,plantilla,,,titulo,precio,slug imagen,estado,Tamaño,Nota,plantilla',
  'FALDA x 2 KG,20999,falda,ACTIVO,5,,,,,COSTILLITAS X2 KG,18600,costillitas,ACTIVO,8,Solo efectivo,clasico,,,PATA/MUSLO x 3KG,10999,pata-muslo,INACTIVO,7,,',
  'VACIO,19999,vacio,activo,99,,inexistente,,,,,,,,,,,,SUPREMA,9000,suprema,ACTIVO,,,',
].join('\n')

test('ofertas: rubro de cada bloque desde el titulo de arriba (RES -> vacuno)', () => {
  const ofertas = parsearOfertas(OFERTAS)
  assert.deepEqual(
    ofertas.map((o) => [o.nombre, o.rubro]),
    [
      ['FALDA x 2 KG', 'vacuno'],
      ['COSTILLITAS X2 KG', 'cerdo'],
      ['VACIO', 'vacuno'],
      ['SUPREMA', 'pollo'],
    ],
  )
})

test('ofertas: INACTIVO se filtra y el estado no distingue mayusculas', () => {
  const nombres = parsearOfertas(OFERTAS).map((o) => o.nombre)
  assert.equal(nombres.includes('PATA/MUSLO x 3KG'), false)
  assert.equal(nombres.includes('VACIO'), true)
})

test('ofertas: tamaño, nota y plantilla', () => {
  const [falda, costillitas, vacio, suprema] = parsearOfertas(OFERTAS)
  assert.equal(falda.tamano, 5)
  assert.equal(costillitas.tamano, 8)
  assert.equal(costillitas.descripcion, 'Solo efectivo')
  assert.equal(costillitas.plantilla, 'clasico')
  // Fuera de rango -> default 6; vacio -> default 6.
  assert.equal(vacio.tamano, 6)
  assert.equal(suprema.tamano, 6)
  // Plantilla que no existe en el catalogo -> undefined (usa la default del tenant).
  assert.equal(vacio.plantilla, undefined)
})

test('ofertas: bloque sin titulo arriba queda sin rubro', () => {
  const csv = [
    ',,,,,,,,,CERDO,,,',
    'titulo,precio,slug imagen,estado,,,,,,titulo,precio,slug imagen,estado',
    'FALDA,20999,falda,ACTIVO,,,,,,PECHITO,8999,pechito,ACTIVO',
  ].join('\n')
  const ofertas = parsearOfertas(csv)
  assert.equal('rubro' in ofertas[0], false)
  assert.equal(ofertas[1].rubro, 'cerdo')
})

test('ofertas: header en la primera fila (sin fila de titulos) funciona sin rubro', () => {
  const csv = ['titulo,precio,slug imagen,estado', 'FALDA,20999,falda,ACTIVO'].join('\n')
  const [falda] = parsearOfertas(csv)
  assert.equal(falda.nombre, 'FALDA')
  assert.equal('rubro' in falda, false)
})

test('ofertas: CSV sin headers devuelve []', () => {
  assert.deepEqual(parsearOfertas(''), [])
  assert.deepEqual(parsearOfertas('a,b,c\n1,2,3'), [])
})

test('config: claves con alias, acentos y valores numericos', () => {
  const csv = [
    'Clave,Valor',
    'segundos x Ofertas,8',
    'segundos x Listas,10',
    'Horarios de atención,MAR a SAB 8 a 13hs',
    'whatsapp,11 5555 4444',
    'instagram,carniceria',
    'atenuar desde,13',
    'atenuar hasta,16:30',
  ].join('\n')
  assert.deepEqual(parsearConfig(csv), {
    segundosCartel: 8,
    segundosTabla: 10,
    horarios: 'MAR a SAB 8 a 13hs',
    whatsapp: '11 5555 4444',
    instagram: 'carniceria',
    atenuarDesde: '13',
    atenuarHasta: '16:30',
  })
})

test('config: claves desconocidas, valores vacios y numeros invalidos se ignoran', () => {
  const csv = ['segundos x ofertas,abc', 'atenuar desde,', 'color,rojo', 'segundos x listas,7'].join('\n')
  assert.deepEqual(parsearConfig(csv), { segundosTabla: 7 })
})

test('leerListas: ok=false si no hay fila de encabezados, ok=true si la hay (aunque este vacia)', () => {
  assert.deepEqual(leerListas('hola,chau\n1,2'), { datos: [], ok: false })
  assert.deepEqual(leerListas(''), { datos: [], ok: false })
  assert.deepEqual(leerListas('LISTA,,\nNombre,Precio,Unidad'), { datos: [], ok: true })
  assert.equal(leerListas(LISTAS).ok, true)
})

test('leerOfertas: ok=false sin encabezados; ok=true con todo INACTIVO', () => {
  assert.deepEqual(leerOfertas('a,b,c\n1,2,3'), { datos: [], ok: false })
  const todoInactivo = ['titulo,precio,slug imagen,estado', 'FALDA,20999,falda,INACTIVO'].join('\n')
  assert.deepEqual(leerOfertas(todoInactivo), { datos: [], ok: true })
  assert.equal(leerOfertas(OFERTAS).ok, true)
})
