import { test } from 'node:test'
import assert from 'node:assert/strict'

import { TENANTS, getTenant } from './index.ts'
import { PLANTILLAS_CARTEL } from '../lib/plantillas.ts'

test('cada tenant tiene slug igual a su clave en el registro', () => {
  for (const [clave, tenant] of Object.entries(TENANTS)) {
    assert.equal(tenant.slug, clave, `tenant "${clave}" declara slug "${tenant.slug}"`)
  }
})

test('los slugs son URL-safe: minusculas, numeros y guiones', () => {
  for (const clave of Object.keys(TENANTS)) {
    assert.match(clave, /^[a-z0-9]+(-[a-z0-9]+)*$/, `slug invalido: "${clave}"`)
  }
})

test('plantillaCartelDefault existe en el catalogo', () => {
  for (const tenant of Object.values(TENANTS)) {
    assert.ok(
      (PLANTILLAS_CARTEL as readonly string[]).includes(tenant.plantillaCartelDefault),
      `${tenant.slug}: plantilla "${tenant.plantillaCartelDefault}" no esta en PLANTILLAS_CARTEL`,
    )
  }
})

test('getTenant devuelve el tenant o undefined', () => {
  assert.equal(getTenant('granja-elancla')?.nombre, 'Granja El Ancla')
  assert.equal(getTenant('no-existe'), undefined)
})
