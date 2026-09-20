import { test } from 'node:test'
import assert from 'node:assert/strict'

import { envKeyCsv, csvUrlDe } from './tenant-env.ts'

test('envKeyCsv convierte el slug a MAYUSCULAS_CON_GUION_BAJO', () => {
  assert.equal(envKeyCsv('granja-elancla'), 'TENANT_GRANJA_ELANCLA_CSV_URL')
  assert.equal(envKeyCsv('lopez'), 'TENANT_LOPEZ_CSV_URL')
  assert.equal(envKeyCsv('la-casa-del-pollo-2'), 'TENANT_LA_CASA_DEL_POLLO_2_CSV_URL')
})

test('csvUrlDe lee la variable del tenant', () => {
  process.env.TENANT_LOPEZ_CSV_URL = 'https://docs.google.com/x/pub?output=csv'
  assert.equal(csvUrlDe('lopez'), 'https://docs.google.com/x/pub?output=csv')
})

test('csvUrlDe devuelve undefined si falta la variable', () => {
  delete process.env.TENANT_NADIE_CSV_URL
  assert.equal(csvUrlDe('nadie'), undefined)
})
