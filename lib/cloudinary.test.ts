import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { urlImagen, urlOferta, urlLogo, urlIcono, urlOg, versionDelDia } from './cloudinary.ts'

// 06/10/2026 00:30 en Argentina (UTC-3).
const DIA = new Date('2026-10-06T03:30:00Z')

beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'demo-cloud'
  process.env.NEXT_PUBLIC_CLOUDINARY_CATALOGO = 'catalogo-comun'
})

test('urlImagen arma la URL base de Cloudinary con transformaciones', () => {
  assert.equal(
    urlImagen('logos/x', 'w_400'),
    'https://res.cloudinary.com/demo-cloud/image/upload/w_400/logos/x',
  )
})

test('versionDelDia: fecha de Argentina como vAAAAMMDD', () => {
  assert.equal(versionDelDia(DIA), 'v20261006')
  // 23:30 del 05/10 en Argentina, aunque en UTC ya sea 06/10.
  assert.equal(versionDelDia(new Date('2026-10-06T02:30:00Z')), 'v20261005')
})

test('urlOferta prefija version del dia y carpeta del catalogo, y usa placeholder', () => {
  assert.equal(
    urlOferta('asado-de-tira', DIA),
    'https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,w_1200,d_placeholder.png/v20261006/catalogo-comun/asado-de-tira',
  )
})

test('urlOferta cambia de URL al cambiar el dia (fuerza a bajar la foto de nuevo)', () => {
  const hoy = urlOferta('costillar', DIA)
  const manana = urlOferta('costillar', new Date('2026-10-07T03:30:00Z'))
  assert.notEqual(hoy, manana)
})

test('urlLogo comprime a 400px', () => {
  assert.equal(
    urlLogo('logos/granja-elancla', DIA),
    'https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,w_400/v20261006/logos/granja-elancla',
  )
})

test('urlIcono genera PNG cuadrado con fondo blanco', () => {
  assert.equal(
    urlIcono('logos/granja-elancla', 192),
    'https://res.cloudinary.com/demo-cloud/image/upload/f_png,w_192,h_192,c_pad,b_white/logos/granja-elancla',
  )
})

test('urlOg genera la imagen 1200x630 para compartir el link', () => {
  assert.equal(
    urlOg('logos/granja-elancla'),
    'https://res.cloudinary.com/demo-cloud/image/upload/f_png,w_1200,h_630,c_pad,b_white/logos/granja-elancla',
  )
})

test('sin cloud name, las URLs quedan vacias en vez de romper el render', () => {
  delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  assert.equal(urlOferta('asado'), '')
})
