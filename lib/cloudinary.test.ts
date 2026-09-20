import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { urlImagen, urlOferta, urlLogo, urlIcono } from './cloudinary.ts'

beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'demo-cloud'
  process.env.NEXT_PUBLIC_CLOUDINARY_CATALOGO = 'catalogo'
})

test('urlImagen arma la URL base de Cloudinary con transformaciones', () => {
  assert.equal(
    urlImagen('logos/x', 'w_400'),
    'https://res.cloudinary.com/demo-cloud/image/upload/w_400/logos/x',
  )
})

test('urlOferta prefija la carpeta del catalogo y usa placeholder', () => {
  assert.equal(
    urlOferta('asado-de-tira'),
    'https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,w_1200,d_placeholder.png/catalogo/asado-de-tira',
  )
})

test('urlLogo comprime a 400px', () => {
  assert.equal(
    urlLogo('logos/granja-elancla'),
    'https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,w_400/logos/granja-elancla',
  )
})

test('urlIcono genera PNG cuadrado con fondo blanco', () => {
  assert.equal(
    urlIcono('logos/granja-elancla', 192),
    'https://res.cloudinary.com/demo-cloud/image/upload/f_png,w_192,h_192,c_pad,b_white/logos/granja-elancla',
  )
})

test('sin cloud name, las URLs quedan vacias en vez de romper el render', () => {
  delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  assert.equal(urlOferta('asado'), '')
})
