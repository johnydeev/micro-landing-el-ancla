import assert from 'node:assert/strict'
import test from 'node:test'

import { conLimite } from './limite.ts'

const tardar = <T>(ms: number, valor: T) => new Promise<T>((r) => setTimeout(() => r(valor), ms))

test('conLimite: la promesa tarda menos que el limite -> su valor', async () => {
  assert.deepEqual(await conLimite(tardar(5, ['cerdo']), 200, []), ['cerdo'])
})

test('conLimite: la promesa tarda mas que el limite -> valor por defecto y avisa', async () => {
  let avisos = 0
  const r = await conLimite(tardar(200, ['cerdo']), 10, [] as string[], () => avisos++)
  assert.deepEqual(r, [])
  assert.equal(avisos, 1)
})

test('conLimite: la promesa falla -> valor por defecto sin avisar de vencimiento', async () => {
  let avisos = 0
  const r = await conLimite(Promise.reject(new Error('x')), 200, 'defecto', () => avisos++)
  assert.equal(r, 'defecto')
  assert.equal(avisos, 0)
})
