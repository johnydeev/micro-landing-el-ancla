import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { optimizar } from './optimize-images.mjs'

/*
 * Tests del pipeline de compresion de imagenes.
 *
 * Corren con el runner incorporado de Node (`node --test`) — cero dependencias
 * nuevas. Todo pasa por un directorio temporal: estos tests NUNCA tocan
 * public/.
 *
 * El test que mas importa es "es idempotente": el workflow de GitHub Actions
 * commitea automaticamente el resultado de este script, asi que si una segunda
 * pasada produjera bytes distintos, el bot commitearia en loop.
 */

let dir

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'optimize-images-'))
})

after(async () => {
  await rm(dir, { recursive: true, force: true })
})

/*
 * Genera un PNG con bandas de color. Se comprime bien (a diferencia de ruido
 * aleatorio), que es el perfil real de las fotos de producto del proyecto:
 * producto sobre fondo difuso, rango de colores acotado.
 */
async function crearPng(nombre, ancho, alto) {
  const canales = 3
  const buf = Buffer.alloc(ancho * alto * canales)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * canales
      buf[i] = Math.floor((x / ancho) * 255)
      buf[i + 1] = Math.floor((y / alto) * 255)
      buf[i + 2] = 128
    }
  }
  const destino = path.join(dir, nombre)
  await sharp(buf, { raw: { width: ancho, height: alto, channels: canales } })
    .png({ compressionLevel: 0 }) // sin comprimir: simula una imagen "cruda" pesada
    .toFile(destino)
  return destino
}

const pesar = async (p) => (await stat(p)).size

test('reduce el peso de una imagen grande sin comprimir', async () => {
  const archivo = await crearPng('grande.png', 2000, 2000)
  const antes = await pesar(archivo)

  const despues = await optimizar(archivo, 1200)

  assert.ok(
    despues < antes,
    `esperaba que comprimiera: antes ${antes}B, despues ${despues}B`,
  )
  assert.equal(despues, await pesar(archivo), 'el valor devuelto debe ser el peso real en disco')
})

test('redimensiona al ancho maximo indicado', async () => {
  const archivo = await crearPng('ancha.png', 2400, 1200)

  await optimizar(archivo, 1200)

  const meta = await sharp(archivo).metadata()
  assert.equal(meta.width, 1200, 'deberia quedar exactamente en el ancho maximo')
  assert.equal(meta.height, 600, 'deberia mantener la proporcion 2:1')
})

test('es idempotente: la segunda pasada no cambia el archivo', async () => {
  const archivo = await crearPng('repetida.png', 1600, 1600)

  await optimizar(archivo, 1200)
  const primera = await pesar(archivo)

  await optimizar(archivo, 1200)
  const segunda = await pesar(archivo)

  assert.equal(
    segunda,
    primera,
    'una segunda pasada dejo bytes distintos — el workflow commitearia en loop',
  )
})

test('no agranda una imagen que ya esta optimizada', async () => {
  // 40x40 ya esta muy por debajo del ancho maximo: recomprimir no deberia
  // ayudar, y la guarda `buf.length < before` tiene que evitar la escritura.
  const archivo = await crearPng('chica.png', 40, 40)
  await optimizar(archivo, 1200) // primera pasada la deja en su minimo
  const antes = await pesar(archivo)

  const despues = await optimizar(archivo, 1200)

  assert.ok(despues <= antes, `no deberia crecer: antes ${antes}B, despues ${despues}B`)
})

test('no corrompe el archivo: sigue siendo un PNG valido y legible', async () => {
  const archivo = await crearPng('valida.png', 1500, 1000)

  await optimizar(archivo, 1200)

  const meta = await sharp(archivo).metadata()
  assert.equal(meta.format, 'png')
  // Que los pixeles se puedan decodificar de verdad, no solo leer el header.
  const pixeles = await sharp(archivo).raw().toBuffer()
  assert.ok(pixeles.length > 0, 'no se pudieron decodificar los pixeles')
})

test('deja intacto un archivo que no es imagen', async () => {
  // Si alguien mete un .png que no es PNG, el script debe fallar de forma
  // ruidosa y no escribir basura encima del archivo original.
  const archivo = path.join(dir, 'roto.png')
  await writeFile(archivo, 'esto no es una imagen')
  const antes = await pesar(archivo)

  await assert.rejects(() => optimizar(archivo, 1200))

  assert.equal(await pesar(archivo), antes, 'no deberia haber tocado el archivo')
})
