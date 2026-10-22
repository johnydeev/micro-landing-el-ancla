import { test } from 'node:test'
import assert from 'node:assert/strict'

import { firmarSesion, passwordCorrecta, verificarSesion } from './admin-sesion.ts'

const AHORA = Date.parse('2026-10-20T12:00:00-03:00')
const DIA = 24 * 60 * 60 * 1000
const S = 'secreto-de-prueba'
const P = 'clave-admin'

test('verificarSesion: vigente a 29 dias, vencida a 31', () => {
  const valor = firmarSesion(AHORA, S, P)
  assert.equal(verificarSesion(valor, AHORA + 29 * DIA, S, P), true)
  assert.equal(verificarSesion(valor, AHORA + 31 * DIA, S, P), false)
})

test('verificarSesion: rechaza otro secreto, ausente y adulterada', () => {
  const valor = firmarSesion(AHORA, S, P)
  assert.equal(verificarSesion(valor, AHORA, 'otro', P), false)
  assert.equal(verificarSesion(undefined, AHORA, S, P), false)
  const [exp, firma] = valor.split('.')
  assert.equal(verificarSesion(`${Number(exp) + 1}.${firma}`, AHORA, S, P), false)
  assert.equal(verificarSesion(`${exp}.${firma.slice(0, -1)}0`, AHORA, S, P), false)
  assert.equal(verificarSesion('basura', AHORA, S, P), false)
})

test('verificarSesion: depende de la contrasena', () => {
  const valor = firmarSesion(AHORA, S, P)
  assert.equal(verificarSesion(valor, AHORA, S, 'otra-clave'), false)
  assert.equal(verificarSesion(valor, AHORA, S, ''), false)
  assert.equal(verificarSesion(valor, AHORA, S, undefined), false)
  assert.equal(verificarSesion(firmarSesion(AHORA, S, ''), AHORA, S, ''), false)
})

test('passwordCorrecta', () => {
  assert.equal(passwordCorrecta('x', undefined), false)
  assert.equal(passwordCorrecta('', ''), false)
  assert.equal(passwordCorrecta('secreta', 'secreta'), true)
  assert.equal(passwordCorrecta('secret', 'secreta'), false)
})
