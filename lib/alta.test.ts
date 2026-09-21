import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  slugificar,
  camelCase,
  pubhtmlUrl,
  csvUrlBase,
  parsearPestanas,
  elegirGids,
  derivarPaleta,
  generarTenantTs,
  insertarEnRegistro,
  firmaCloudinary,
  envKeyCsv,
  upsertEnv,
} from './alta.ts'

test('slugificar: acentos, espacios, simbolos', () => {
  assert.equal(slugificar('Carnicería López'), 'carniceria-lopez')
  assert.equal(slugificar('  La Casa del Pollo 2  '), 'la-casa-del-pollo-2')
  assert.equal(slugificar('Ñandú & Cía.'), 'nandu-cia')
})

test('camelCase del slug', () => {
  assert.equal(camelCase('carniceria-lopez'), 'carniceriaLopez')
  assert.equal(camelCase('lopez'), 'lopez')
  assert.equal(camelCase('pollo-2'), 'pollo2')
})

const CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-abc_DEF/pub?output=csv'

test('pubhtmlUrl y csvUrlBase a partir de la URL publicada', () => {
  assert.equal(pubhtmlUrl(CSV), 'https://docs.google.com/spreadsheets/d/e/2PACX-abc_DEF/pubhtml')
  assert.equal(pubhtmlUrl(CSV + '&gid=123&single=true'), 'https://docs.google.com/spreadsheets/d/e/2PACX-abc_DEF/pubhtml')
  assert.equal(csvUrlBase(CSV + '&gid=123'), CSV)
  assert.throws(() => pubhtmlUrl('https://docs.google.com/spreadsheets/d/1abc/edit'), /Publicar en la web/)
  assert.throws(() => pubhtmlUrl('https://ejemplo.com/pub?output=csv'), /Publicar en la web/)
})

// Recorte real de un /pubhtml (sesion 21): Google mete la lista de pestanas
// dentro de un <script>, con los nombres escapados como strings de JS.
const PUBHTML = `<script>var items = [];items.push({name: "Productos", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/e\\/X\\/pubhtml\\/sheet?headers\\x3dfalse&gid=0", gid: "0",initialSheet: ("0" == gid)});items.push({name: "Ofertas", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/e\\/X\\/pubhtml\\/sheet?headers\\x3dfalse&gid=2121126279", gid: "2121126279",initialSheet: ("2121126279" == gid)});items.push({name: "Configuraci\\u00f3n", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/e\\/X\\/pubhtml\\/sheet?headers\\x3dfalse&gid=1038483630", gid: "1038483630",initialSheet: ("1038483630" == gid)});</script>`

test('parsearPestanas extrae nombre y gid, desescapando', () => {
  assert.deepEqual(parsearPestanas(PUBHTML), [
    { nombre: 'Productos', gid: '0' },
    { nombre: 'Ofertas', gid: '2121126279' },
    { nombre: 'Configuración', gid: '1038483630' },
  ])
  assert.deepEqual(parsearPestanas('<html>sin pestanas</html>'), [])
})

test('elegirGids encuentra ofertas y config por nombre, tolerante', () => {
  const gids = elegirGids([
    { nombre: 'PRECIOS', gid: '0' },
    { nombre: 'Súper Ofertas', gid: '11' },
    { nombre: 'Configuración', gid: '22' },
  ])
  assert.deepEqual(gids, { gidOfertas: '11', gidConfig: '22' })
  assert.throws(() => elegirGids([{ nombre: 'Ofertas', gid: '1' }]), /configuracion.*"Ofertas" \(gid 1\)/)
  assert.throws(() => elegirGids([{ nombre: 'Config', gid: '1' }]), /ofertas/)
})

test('derivarPaleta: 6 colores, fila impar es tinte claro del primario', () => {
  const p = derivarPaleta('#e31e24', '#1e3a8a')
  assert.equal(p.primario, '#E31E24')
  assert.equal(p.secundario, '#1E3A8A')
  assert.equal(p.textoPrimario, '#1E3A8A')
  assert.equal(p.fondo, '#FFFFFF')
  assert.equal(p.textoSecundario, '#6B7280')
  // 92% blanco: cada canal queda entre el color y 255, cerca de 255
  assert.match(p.filaImpar, /^#[0-9A-F]{6}$/)
  const r = parseInt(p.filaImpar.slice(1, 3), 16)
  const g = parseInt(p.filaImpar.slice(3, 5), 16)
  assert.ok(r > 240 && r <= 255 && g > 230 && g < r, `filaImpar inesperada: ${p.filaImpar}`)
  assert.throws(() => derivarPaleta('rojo', '#000000'), /Color invalido/)
})

const DATOS = {
  slug: 'carniceria-lopez',
  nombre: "Carnicería L'Opez",
  eslogan: 'Desde 1990',
  badgeOferta: 'OFERTA',
  whatsapp: '11 5555 5555',
  instagram: '@lopez',
  horarios: 'LUN a SAB 8 a 13',
  paleta: derivarPaleta('#1B5E20', '#212121'),
  gids: { gidOfertas: '11', gidConfig: '22' },
}

test('generarTenantTs produce el modulo con los datos y escapa comillas', () => {
  const ts = generarTenantTs(DATOS)
  assert.match(ts, /^import type \{ Tenant \} from '@\/types\/tenant'/)
  assert.match(ts, /export const carniceriaLopez: Tenant = \{/)
  assert.match(ts, /slug: 'carniceria-lopez',/)
  assert.match(ts, /nombre: 'Carnicería L\\'Opez',/)
  assert.match(ts, /logo: 'logos\/carniceria-lopez',/)
  assert.match(ts, /badgeOferta: 'OFERTA',/)
  assert.match(ts, /primario: '#1B5E20',/)
  assert.match(ts, /gidOfertas: '11',/)
  assert.match(ts, /gidConfig: '22',/)
  assert.match(ts, /plantillaCartelDefault: 'clasico',/)
})

const INDEX = `import type { Tenant } from '@/types/tenant'
// comentario
import { granjaElAncla } from './granja-elancla.ts'

export const TENANTS: Record<string, Tenant> = {
  'granja-elancla': granjaElAncla,
}

export function getTenant(slug: string): Tenant | undefined {
  return TENANTS[slug]
}
`

test('insertarEnRegistro agrega import y entrada en orden, idempotente', () => {
  const una = insertarEnRegistro(INDEX, 'carniceria-lopez')
  assert.match(una, /import \{ carniceriaLopez \} from '\.\/carniceria-lopez\.ts'\nimport \{ granjaElAncla \} from '\.\/granja-elancla\.ts'/)
  assert.match(una, /TENANTS: Record<string, Tenant> = \{\n  'carniceria-lopez': carniceriaLopez,\n  'granja-elancla': granjaElAncla,\n\}/)
  assert.equal(insertarEnRegistro(una, 'carniceria-lopez'), una)
  // el resto del archivo queda intacto
  assert.match(una, /export function getTenant/)
})

test('firmaCloudinary: sha1 de params ordenados + secret', () => {
  // sha1("overwrite=true&public_id=logos/x&timestamp=1" + "secreto")
  assert.equal(
    firmaCloudinary({ timestamp: 1, public_id: 'logos/x', overwrite: true }, 'secreto'),
    firmaCloudinary({ overwrite: true, public_id: 'logos/x', timestamp: 1 }, 'secreto'),
  )
  assert.match(firmaCloudinary({ a: 1 }, 's'), /^[0-9a-f]{40}$/)
})

test('envKeyCsv y upsertEnv', () => {
  assert.equal(envKeyCsv('carniceria-lopez'), 'TENANT_CARNICERIA_LOPEZ_CSV_URL')
  assert.equal(upsertEnv('A=1\n', 'B', '2'), 'A=1\nB=2\n')
  assert.equal(upsertEnv('A=1\nB=viejo\n', 'B', 'nuevo'), 'A=1\nB=nuevo\n')
  assert.equal(upsertEnv('', 'B', '2'), 'B=2\n')
  assert.equal(upsertEnv('A=1', 'B', '2'), 'A=1\nB=2\n')
})
