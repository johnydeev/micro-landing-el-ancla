import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  codigoGuardado,
  codigoGuardadoVigente,
  formatearCodigo,
  generarCodigo,
  normalizarCodigo,
} from './codigo-alta.ts'

const AHORA = Date.parse('2026-10-20T12:00:00-03:00')

test('generarCodigo: byte % 31 sobre el alfabeto', () => {
  assert.equal(generarCodigo(new Uint8Array([0, 1, 2, 3, 4, 30])), 'ABCDE9')
  assert.equal(generarCodigo(new Uint8Array([31, 62, 255, 128, 7, 93])), 'AAHEHA')
})

test('normalizarCodigo', () => {
  assert.equal(normalizarCodigo(' k7m-2qx '), 'K7M2QX')
  assert.equal(normalizarCodigo('K7M2Q'), null)
  assert.equal(normalizarCodigo('K7M2Q0'), null)
})

test('formatearCodigo', () => {
  assert.equal(formatearCodigo('K7M2QX'), 'K7M-2QX')
})

const storageCon = (valor: string) => ({ getItem: () => valor })

test('codigoGuardadoVigente: vigente con margen de 30 s', () => {
  const guardado = { codigo: 'K7M2QX', nonce: 'abc', venceMs: AHORA + 60_000 }
  assert.deepEqual(codigoGuardadoVigente(storageCon(JSON.stringify(guardado)), 'k', AHORA), guardado)
  const porVencer = { ...guardado, venceMs: AHORA + 10_000 }
  assert.equal(codigoGuardadoVigente(storageCon(JSON.stringify(porVencer)), 'k', AHORA), null)
})

test('codigoGuardadoVigente: datos rotos o sin storage', () => {
  assert.equal(codigoGuardadoVigente(storageCon('{no es json'), 'k', AHORA), null)
  assert.equal(codigoGuardadoVigente(storageCon('null'), 'k', AHORA), null)
  const roto = {
    getItem: () => {
      throw new Error('bloqueado')
    },
  }
  assert.equal(codigoGuardadoVigente(roto, 'k', AHORA), null)
  assert.equal(codigoGuardadoVigente(null, 'k', AHORA), null)
})

test('codigoGuardado: devuelve el guardado aunque parezca vencido (el servidor decide)', () => {
  const vencido = { codigo: 'K7M2QX', nonce: 'abc', venceMs: AHORA - 60_000 }
  assert.deepEqual(codigoGuardado(storageCon(JSON.stringify(vencido)), 'k'), vencido)
  const porVencer = { ...vencido, venceMs: AHORA + 10_000 }
  assert.deepEqual(codigoGuardado(storageCon(JSON.stringify(porVencer)), 'k'), porVencer)
})

test('codigoGuardado: datos rotos, forma invalida o sin storage', () => {
  assert.equal(codigoGuardado(storageCon('{no es json'), 'k'), null)
  assert.equal(codigoGuardado(storageCon('null'), 'k'), null)
  assert.equal(codigoGuardado(storageCon(JSON.stringify({ codigo: 'K7M2QX' })), 'k'), null)
  assert.equal(codigoGuardado(null, 'k'), null)
})
