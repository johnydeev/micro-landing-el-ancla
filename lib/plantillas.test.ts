import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PLANTILLAS_CARTEL, slugificarPlantilla, normalizarPlantilla } from './plantillas.ts'

test('el catalogo arranca con la plantilla clasica', () => {
  assert.deepEqual([...PLANTILLAS_CARTEL], ['clasico'])
})

test('slugificarPlantilla: minusculas, sin acentos, espacios a guiones', () => {
  assert.equal(slugificarPlantilla('Clásico'), 'clasico')
  assert.equal(slugificarPlantilla('  CLASICO  '), 'clasico')
  // Cuando exista "foto-grande", el cliente va a escribir "Foto grande".
  assert.equal(slugificarPlantilla('Foto  grande'), 'foto-grande')
  assert.equal(slugificarPlantilla(''), '')
})

test('normalizarPlantilla devuelve el id si esta en el catalogo', () => {
  assert.equal(normalizarPlantilla('Clásico'), 'clasico')
  assert.equal(normalizarPlantilla('clasico'), 'clasico')
})

test('normalizarPlantilla: vacio y desconocido devuelven undefined', () => {
  assert.equal(normalizarPlantilla(''), undefined)
  assert.equal(normalizarPlantilla('   '), undefined)
  assert.equal(normalizarPlantilla('foto grande'), undefined)
  assert.equal(normalizarPlantilla('neon'), undefined)
})
