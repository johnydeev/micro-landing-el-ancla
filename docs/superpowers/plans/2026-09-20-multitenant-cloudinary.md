# Multitenant por path + Cloudinary — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un solo deploy sirve N comercios por path (`/<slug>`), cada uno con su paleta, textos, planilla y plantilla de cartel elegible por oferta; imágenes en Cloudinary; pipeline de imágenes del repo eliminado.

**Architecture:** Segmento dinámico `app/[tenant]/` resuelve el tenant desde un registro tipado en `tenants/`. Los lectores de `lib/sheets.ts` reciben el tenant y leen su CSV desde `TENANT_<SLUG>_CSV_URL`. Los diseños viven en `templates/` como componentes sin colores fijos (CSS vars inyectadas desde `tenant.paleta`); el cartel se elige por `oferta.plantilla ?? tenant.plantillaCartelDefault`. Las imágenes se arman como URLs de Cloudinary con transformaciones.

**Tech Stack:** Next.js 16.2 (App Router, `force-dynamic`), React 19, TypeScript, `node --test` con type stripping (Node ≥ 22.18), Cloudinary (solo URLs, sin SDK).

**Spec:** `docs/superpowers/specs/2026-09-20-multitenant-cloudinary-design.md`

**Estado (2026-09-20):** Tareas 1-13 ejecutadas inline y validadas (16/16 tests,
tsc, lint, build, checks HTTP contra `npm start`). Desviación: se eliminó
`app/loading.tsx` de la raíz (rompía el 404 de slugs desconocidos, ver
CHANGELOG sesión 21). **Pendientes del usuario:** Tarea 0 (Cloudinary), pasos
6-7 de la Tarea 12 (check visual y offline, necesitan Cloudinary) y Tarea 14
(cutover).

**Reglas del proyecto que aplican a este plan:**
- Los commits los hace el usuario con GitLens. Cada tarea termina en "listo para commitear", nunca en `git commit`.
- **Ningún push a `master` hasta la Tarea 14** (cutover), y ese push va fuera del horario de atención del local (hoy: después de las 13hs). Los commits locales son libres; el push deploya al instante.
- Next 16: ante cualquier duda de API, leer `node_modules/next/dist/docs/`.

---

## Estructura de archivos

**Crear:**
- `lib/plantillas.ts` — ids de plantillas de cartel + `normalizarPlantilla`. Sin React, sin server-only.
- `lib/plantillas.test.ts`
- `lib/cloudinary.ts` — `urlImagen`, `urlOferta`, `urlLogo`, `urlIcono`. Sin server-only.
- `lib/cloudinary.test.ts`
- `lib/tenant-env.ts` — `envKeyCsv`, `csvUrlDe`. Sin server-only.
- `lib/tenant-env.test.ts`
- `types/tenant.ts` — `interface Tenant`.
- `tenants/granja-elancla.ts` — config de El Ancla.
- `tenants/index.ts` — registro + `getTenant`.
- `tenants/registro.test.ts`
- `templates/index.ts` — `CATALOGO_CARTELES`.
- `templates/tabla/Clasica.tsx` — extraído de `PantallaRotativa`.
- `templates/cartel/Clasico.tsx` — extraído de `PantallaRotativa` (`CartelOferta`).
- `lib/tenant-route.ts` — `getTenantOr404(params)`. server-only.
- `app/[tenant]/layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`
- `app/[tenant]/vistaCartel/page.tsx`, `app/[tenant]/vistaLista/page.tsx`
- `app/[tenant]/manifest.webmanifest/route.ts`
- `app/api/[tenant]/productos/route.ts`, `ofertas/route.ts`, `config/route.ts`

**Modificar:**
- `types/index.ts` — `Oferta.plantilla?`.
- `lib/sheets.ts` — columna `plantilla`; lectores reciben `tenant`.
- `components/PantallaRotativa.tsx` — recibe `tenant`; delega en `templates/`.
- `components/Header.tsx`, `components/Footer.tsx` — reciben `tenant`.
- `app/page.tsx` — renderiza `DEFAULT_TENANT`.
- `app/layout.tsx` — metadata genérica, sin `viewport`.
- `public/sw.js` — orígenes cacheables + `v7`.
- `package.json`, `tsconfig.json`, `.env.local.example`, `README.md`, `.gitignore` (sin cambio), docs.

**Eliminar:**
- `config/negocio.ts`, `app/manifest.json`, `app/loading.tsx`, `app/error.tsx` (se mueven a `[tenant]/`), `app/vistaCartel/`, `app/vistaLista/`, `app/api/productos|ofertas|config/`
- `public/ofertas/`, `public/logo.png`, `public/icons/`
- `scripts/`, `.githooks/`, `.github/workflows/optimize-images.yml`

---

## Tarea 0: Prerrequisitos del usuario (sin código)

Estas acciones son del usuario y no dependen del código. Pueden hacerse a cualquier hora; no tocan producción.

- [ ] **Paso 1: Cloudinary — subir el catálogo de El Ancla con los nombres actuales**

Subir cada PNG de `public/ofertas/` a Cloudinary con public_id `catalogo/<nombre-sin-extension>`. Lista exacta (22 archivos; los nombres deben quedar **idénticos** porque son los que usa la planilla):

```
alita, bondiola, cortes-de-cerdo, costillar, costillitas, falda, lechon, lomo,
mondongo, osobuco, paleta, pata-muslo, patamusloxcaja, pechito, pechitox2,
picada-cerdo, picada-premium, rabito-huesito-cuerito, rabo, ribs, roastbeef,
suprema, supremaxcaja, vacio
```

(Verificar contra `ls public/ofertas/` antes de subir: la lista de arriba es la del repo al 2026-09-20.)

- [ ] **Paso 2: Cloudinary — logo y placeholder**

- `public/logo.png` → public_id `logos/granja-elancla`.
- Una imagen genérica (por ejemplo un recuadro gris con "sin imagen") → public_id `placeholder` en la **raíz** del cloud, formato PNG. Cloudinary la usa como `d_placeholder.png` cuando un slug no existe.

- [ ] **Paso 3: Anotar el cloud name**

Cloudinary → Dashboard → "Cloud name". Se usa en la Tarea 12 (`.env.local`) y en la Tarea 14 (Vercel).

- [ ] **Paso 4: Vercel — dominio nuevo**

Settings → Domains → Add. Probar `carteleria.vercel.app`; si está tomado, `carteleria-digital.vercel.app` o similar. **No** borrar `precios-el-ancla.vercel.app`.

---

## Tarea 1: `lib/plantillas.ts` — ids de plantilla y normalización

**Files:**
- Create: `lib/plantillas.ts`
- Create: `lib/plantillas.test.ts`
- Modify: `tsconfig.json`
- Modify: `package.json`

- [ ] **Paso 1: Habilitar imports con extensión `.ts` en tsconfig**

Los tests corren con `node --test` sin bundler: Node exige la extensión en los imports relativos. TypeScript solo la acepta con `allowImportingTsExtensions` (permitido porque `noEmit: true`).

En `tsconfig.json`, dentro de `compilerOptions`, agregar después de `"isolatedModules": true,`:

```json
    "allowImportingTsExtensions": true,
```

- [ ] **Paso 2: Cambiar el script de test**

En `package.json`, reemplazar:

```json
    "test": "node --test",
```

por:

```json
    "test": "node --test \"lib/**/*.test.ts\" \"tenants/**/*.test.ts\"",
```

(Los globs los expande Node, no el shell — funciona en Windows y en el CI de Node 22. Node 20 no lo soportaba: ver CHANGELOG sesión 20. Se acotan a `lib/` y `tenants/` para no rastrillar `node_modules`.)

- [ ] **Paso 3: Escribir el test que falla**

Crear `lib/plantillas.test.ts`:

```ts
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
```

- [ ] **Paso 4: Correr el test y ver que falla**

```bash
npm test
```

Esperado: falla con `Cannot find module '.../lib/plantillas.ts'`.

- [ ] **Paso 5: Implementar `lib/plantillas.ts`**

```ts
/*
 * Ids de las plantillas de cartel de oferta.
 *
 * Viven aca (y no en templates/index.ts) a proposito: este modulo no importa
 * React ni componentes .tsx, asi que lo pueden usar lib/sheets.ts (server) y
 * los tests de `node --test` (que no compilan JSX). templates/index.ts se
 * tipa contra PlantillaCartelId, asi que agregar un id aca sin agregar el
 * componente al catalogo no compila.
 *
 * Agregar una plantilla = 1) id aca, 2) componente en templates/cartel/,
 * 3) entrada en CATALOGO_CARTELES. Y agregar el id al desplegable de la
 * columna "plantilla" en la planilla de cada cliente que la quiera usar.
 */
export const PLANTILLAS_CARTEL = ['clasico'] as const

export type PlantillaCartelId = (typeof PLANTILLAS_CARTEL)[number]

const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

/*
 * Lo que el cliente escribe en el desplegable -> forma canonica de un id:
 * minusculas, sin acentos, espacios a guiones ("Clásico" -> "clasico",
 * "Foto grande" -> "foto-grande"). No valida contra el catalogo.
 */
export function slugificarPlantilla(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/\s+/g, '-')
}

/*
 * Normaliza y valida contra el catalogo. Devuelve undefined si esta vacio o
 * no coincide con ningun id: el caller cae al default del tenant.
 */
export function normalizarPlantilla(raw: string): PlantillaCartelId | undefined {
  const id = slugificarPlantilla(raw)
  if (id === '') return undefined
  return (PLANTILLAS_CARTEL as readonly string[]).includes(id)
    ? (id as PlantillaCartelId)
    : undefined
}
```

- [ ] **Paso 6: Correr el test y ver que pasa**

```bash
npm test
```

Esperado: `ℹ pass 4`, `ℹ fail 0`. Nota: `scripts/optimize-images.test.mjs` ya no matchea el glob `*.test.ts`, así que no corre — se borra en la Tarea 5.

- [ ] **Paso 7: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Paso 8: Listo para commitear** — `lib/plantillas.ts`, `lib/plantillas.test.ts`, `tsconfig.json`, `package.json`.

---

## Tarea 2: `lib/cloudinary.ts` — URLs de imagen

**Files:**
- Create: `lib/cloudinary.ts`
- Create: `lib/cloudinary.test.ts`

- [ ] **Paso 1: Escribir el test que falla**

Crear `lib/cloudinary.test.ts`:

```ts
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
```

- [ ] **Paso 2: Correr y ver que falla**

```bash
npm test
```

Esperado: `Cannot find module '.../lib/cloudinary.ts'`.

- [ ] **Paso 3: Implementar `lib/cloudinary.ts`**

```ts
/*
 * URLs de imagen en Cloudinary. Solo strings: sin SDK, sin credenciales.
 *
 * Todas las imagenes del proyecto (catalogo de productos, logos, iconos PWA)
 * viven en Cloudinary desde sesion 21. El repo no tiene PNGs salvo el
 * favicon. Ver docs/decisiones.md (ADR "Imagenes en Cloudinary").
 *
 * Las env son NEXT_PUBLIC_ porque estas funciones corren tambien en el
 * cliente (templates de cartel). No son secretos: las URLs resultantes son
 * publicas.
 */

const BASE = 'https://res.cloudinary.com'

function cloudName(): string {
  return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? ''
}

function carpetaCatalogo(): string {
  return process.env.NEXT_PUBLIC_CLOUDINARY_CATALOGO ?? 'catalogo'
}

/*
 * URL generica. Devuelve '' si falta el cloud name: un <img src=""> dispara
 * onError y el cartel se renderiza sin foto, en vez de romper la pantalla.
 */
export function urlImagen(publicId: string, transformaciones: string): string {
  const cloud = cloudName()
  if (!cloud) return ''
  return `${BASE}/${cloud}/image/upload/${transformaciones}/${publicId}`
}

/*
 * Imagen de una oferta. `slug` es lo que el cliente escribe en la columna
 * "slug imagen" de su planilla (ej. "asado-de-tira"), sin carpeta ni
 * extension. `d_placeholder.png`: si el slug no existe en Cloudinary, sirve
 * la imagen `placeholder.png` de la raiz del cloud en vez de 404.
 */
export function urlOferta(slug: string): string {
  return urlImagen(`${carpetaCatalogo()}/${slug}`, 'f_auto,q_auto,w_1200,d_placeholder.png')
}

/* Logo del header. Se ve a lo sumo a ~100px de alto: 400px de ancho sobra. */
export function urlLogo(publicId: string): string {
  return urlImagen(publicId, 'f_auto,q_auto,w_400')
}

/* Icono PWA derivado del logo: cuadrado, con padding blanco, siempre PNG. */
export function urlIcono(publicId: string, lado: 192 | 512): string {
  return urlImagen(publicId, `f_png,w_${lado},h_${lado},c_pad,b_white`)
}
```

- [ ] **Paso 4: Correr y ver que pasa**

```bash
npm test
```

Esperado: `ℹ pass 9`, `ℹ fail 0`.

- [ ] **Paso 5: Listo para commitear** — `lib/cloudinary.ts`, `lib/cloudinary.test.ts`.

---

## Tarea 3: `lib/tenant-env.ts` — URL del CSV por tenant

**Files:**
- Create: `lib/tenant-env.ts`
- Create: `lib/tenant-env.test.ts`

- [ ] **Paso 1: Escribir el test que falla**

Crear `lib/tenant-env.test.ts`:

```ts
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
```

- [ ] **Paso 2: Correr y ver que falla**

```bash
npm test
```

Esperado: `Cannot find module '.../lib/tenant-env.ts'`.

- [ ] **Paso 3: Implementar `lib/tenant-env.ts`**

```ts
/*
 * La URL del CSV publicado de cada cliente NO va en tenants/<slug>.ts: el
 * repo es publico y esa URL da acceso a la planilla completa del cliente
 * (todas las pestanas). Vive en una variable de entorno de Vercel, una por
 * tenant, con nombre derivado del slug.
 *
 * Alta de un cliente = agregar TENANT_<SLUG>_CSV_URL en Vercel.
 */

export function envKeyCsv(slug: string): string {
  return `TENANT_${slug.toUpperCase().replace(/-/g, '_')}_CSV_URL`
}

export function csvUrlDe(slug: string): string | undefined {
  const value = process.env[envKeyCsv(slug)]
  return value ? value : undefined
}
```

- [ ] **Paso 4: Correr y ver que pasa**

```bash
npm test
```

Esperado: `ℹ pass 12`, `ℹ fail 0`.

- [ ] **Paso 5: Listo para commitear** — `lib/tenant-env.ts`, `lib/tenant-env.test.ts`.

---

## Tarea 4: Tipo `Tenant`, registro y El Ancla

**Files:**
- Create: `types/tenant.ts`
- Create: `tenants/granja-elancla.ts`
- Create: `tenants/index.ts`
- Create: `tenants/registro.test.ts`

- [ ] **Paso 1: Escribir el test que falla**

Crear `tenants/registro.test.ts`:

```ts
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
```

- [ ] **Paso 2: Correr y ver que falla**

```bash
npm test
```

Esperado: `Cannot find module '.../tenants/index.ts'`.

- [ ] **Paso 3: Crear `types/tenant.ts`**

```ts
import type { PlantillaCartelId } from '@/lib/plantillas'

/*
 * Configuracion de un comercio (tenant). Un archivo por cliente en tenants/,
 * registrado en tenants/index.ts. Lo que NO esta aca: la URL del CSV de su
 * planilla (env TENANT_<SLUG>_CSV_URL, ver lib/tenant-env.ts).
 */
export interface Tenant {
  /** Segmento de URL: /<slug>. Igual a la clave en el registro. */
  slug: string
  nombre: string
  eslogan: string
  /** public_id del logo en Cloudinary, ej. "logos/granja-elancla". */
  logo: string
  textos: {
    /** Badge del cartel de oferta. El Ancla: "SUPER OFERTA". */
    badgeOferta: string
    /** Primera linea del empty state de la tabla. */
    sinDatos: string
  }
  paleta: {
    primario: string
    secundario: string
    fondo: string
    textoPrimario: string
    textoSecundario: string
    filaImpar: string
  }
  /** Escala en %: 100 = normal, 115 = 15% mas grande. */
  tipografia: {
    tabla: number
    footer: number
  }
  plantillaCartelDefault: PlantillaCartelId
  sheets: {
    gidOfertas: string
    gidConfig: string
  }
  /** Fallback si la pestana CONFIG del Sheets no trae la clave. */
  defaults: {
    segundosCartel: number
    segundosTabla: number
    horarios: string
    whatsapp: string
    instagram: string
  }
}
```

- [ ] **Paso 4: Crear `tenants/granja-elancla.ts`**

Los valores salen de `config/negocio.ts` y de `.env.local` (GIDs). `telefono` no se migra: era igual a `whatsapp`.

```ts
import type { Tenant } from '@/types/tenant'

export const granjaElAncla: Tenant = {
  slug: 'granja-elancla',
  nombre: 'Granja El Ancla',
  eslogan: 'Desde 1984, una tradición en Florencio Varela',
  logo: 'logos/granja-elancla',

  textos: {
    badgeOferta: 'SUPER OFERTA',
    sinDatos: 'Estamos actualizando la lista de precios.',
  },

  paleta: {
    primario: '#E31E24',
    secundario: '#1E3A8A',
    fondo: '#FFFFFF',
    textoPrimario: '#1E3A8A',
    textoSecundario: '#6b7280',
    filaImpar: '#FFF0F0',
  },

  tipografia: {
    tabla: 230,
    footer: 135,
  },

  plantillaCartelDefault: 'clasico',

  sheets: {
    gidOfertas: '2121126279',
    gidConfig: '1038483630',
  },

  defaults: {
    segundosCartel: 3,
    segundosTabla: 3,
    horarios: 'MAR a SAB: 8:15 a 13hs y 16:30 a 20:15hs | DOM: 8:15 a 13hs',
    whatsapp: '11 6000 7394',
    instagram: '@granja_elancla',
  },
}
```

- [ ] **Paso 5: Crear `tenants/index.ts`**

```ts
import type { Tenant } from '@/types/tenant'
// Extension .ts explicita: tenants/registro.test.ts importa este modulo con
// `node --test` (sin bundler), y Node ESM exige la extension. tsconfig tiene
// allowImportingTsExtensions; Turbopack la resuelve igual.
import { granjaElAncla } from './granja-elancla.ts'

/*
 * Registro de comercios. Alta de un cliente:
 *   1. tenants/<slug>.ts
 *   2. una linea aca
 *   3. TENANT_<SLUG>_CSV_URL en Vercel
 *   4. logo en Cloudinary como logos/<slug>
 * Ver README "Alta de un cliente".
 */
export const TENANTS: Record<string, Tenant> = {
  'granja-elancla': granjaElAncla,
}

export function getTenant(slug: string): Tenant | undefined {
  return TENANTS[slug]
}
```

- [ ] **Paso 6: Correr y ver que pasa**

```bash
npm test
```

Esperado: `ℹ pass 16`, `ℹ fail 0`.

Nota: `tenants/index.ts` y `granja-elancla.ts` usan el alias `@/types/tenant` solo en `import type`, que Node borra al hacer type stripping — por eso el test puede importarlos sin bundler. **En `tenants/`, los imports de valor van relativos y con extensión `.ts`** (como `./granja-elancla.ts`); un import de valor con `@/` rompe el test.

- [ ] **Paso 7: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Paso 8: Listo para commitear** — `types/tenant.ts`, `tenants/`.

---

## Tarea 5: Eliminar el pipeline de imágenes del repo

**Files:**
- Delete: `scripts/optimize-images.mjs`, `scripts/optimize-images.test.mjs`, `.githooks/pre-commit`, `.github/workflows/optimize-images.yml`
- Modify: `package.json`

- [ ] **Paso 1: Borrar archivos**

```bash
git rm -r scripts .githooks .github/workflows/optimize-images.yml
```

- [ ] **Paso 2: Limpiar `package.json`**

Quitar de `"scripts"` las tres líneas:

```json
    "prepare": "git config core.hooksPath .githooks",
    "prebuild": "npm run optimize:images",
    "optimize:images": "node scripts/optimize-images.mjs"
```

Quitar de `"devDependencies"`:

```json
    "sharp": "^0.35.3",
```

- [ ] **Paso 3: Desactivar el hook en este clon**

El `prepare` ya no existe, pero la config local sigue apuntando a `.githooks/` (borrado). Git ignora hooks inexistentes, pero se limpia igual:

```bash
git config --unset core.hooksPath
```

- [ ] **Paso 4: Reinstalar dependencias**

```bash
npm install
```

Esperado: `package-lock.json` cambia (sale `sharp` y sus `@img/*`).

- [ ] **Paso 5: Verificar que nada más referencia lo borrado**

```bash
grep -rn "optimize-images\|optimize:images\|prebuild\|sharp" --include=*.json --include=*.ts --include=*.tsx --include=*.yml --include=*.mjs . --exclude-dir=node_modules --exclude-dir=.next
```

Esperado: sin resultados (los `.md` de docs se actualizan en la Tarea 13).

- [ ] **Paso 6: Tests y typecheck**

```bash
npm test && npx tsc --noEmit
```

Esperado: `ℹ pass 16`, tsc limpio.

- [ ] **Paso 7: Listo para commitear** — borrados + `package.json` + `package-lock.json`.

---

## Tarea 6: `lib/sheets.ts` — columna `plantilla` y lectores por tenant

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/sheets.ts`

- [ ] **Paso 1: Agregar `plantilla` al tipo `Oferta`**

En `types/index.ts`, agregar `import type { PlantillaCartelId } from '@/lib/plantillas'` arriba, y dentro de `interface Oferta`, después de `descripcion: string`:

```ts
  /**
   * Plantilla de cartel elegida por el cliente para ESTA oferta, desde la
   * columna opcional "plantilla" del Sheets (desplegable). undefined = usar
   * tenant.plantillaCartelDefault. Parseo en lib/sheets.ts ->
   * findOfertasTableOffsets / mapRowToOfertas; ids en lib/plantillas.ts.
   */
  plantilla?: PlantillaCartelId
```

- [ ] **Paso 2: Detectar el header `plantilla`**

En `lib/sheets.ts`, agregar `import { normalizarPlantilla } from '@/lib/plantillas'` y `import type { Tenant } from '@/types/tenant'` y `import { csvUrlDe, envKeyCsv } from '@/lib/tenant-env'` junto a los imports existentes.

Después de `esHeaderDescripcion`, agregar:

```ts
/*
 * Palabras clave de la columna OPCIONAL "plantilla": que diseno de cartel
 * usa esta oferta. Misma deteccion tolerante que tamano/descripcion. A
 * diferencia de esas dos, su posicion es libre: se busca en las 4 celdas
 * que siguen a "estado" (hasta el proximo bloque de tabla).
 */
const PLANTILLA_OFERTA_KEYWORDS = ['plantilla', 'diseno', 'template']

function esHeaderPlantilla(headerNormalizado: string): boolean {
  return PLANTILLA_OFERTA_KEYWORDS.some((keyword) => headerNormalizado.includes(keyword))
}
```

En `interface OfertasTableHeader`, agregar:

```ts
  /** Indice absoluto de la columna "plantilla", o null si no esta. */
  offsetPlantilla: number | null
```

En `findOfertasTableOffsets`, reemplazar:

```ts
      result.push({ offset: i, tieneTamano, tieneDescripcion })
```

por:

```ts
      // Plantilla: posicion libre entre estado+1 y estado+4, sin pisar un
      // header de otra tabla pegada al costado ("titulo").
      let offsetPlantilla: number | null = null
      for (let c = i + 4; c <= i + 7 && c < headerRow.length; c += 1) {
        const celda = quitarAcentos((headerRow[c] ?? '').trim().toLowerCase())
        if (celda === 'titulo') break
        if (esHeaderPlantilla(celda)) {
          offsetPlantilla = c
          break
        }
      }

      result.push({ offset: i, tieneTamano, tieneDescripcion, offsetPlantilla })
```

- [ ] **Paso 3: Mapear la celda a `oferta.plantilla`**

En `mapRowToOfertas`, reemplazar el `for` header por:

```ts
  for (const { offset, tieneTamano, tieneDescripcion, offsetPlantilla } of headers) {
```

y reemplazar:

```ts
    ofertas.push({ nombre, precio, imagen, estado: estadoNormalizado, tamano, descripcion })
```

por:

```ts
    const plantillaRaw = offsetPlantilla === null ? '' : (columns[offsetPlantilla] ?? '')
    const plantilla = normalizarPlantilla(plantillaRaw)
    if (process.env.NODE_ENV !== 'production' && plantillaRaw.trim() && !plantilla) {
      console.warn(
        `[ofertas] plantilla "${plantillaRaw}" no existe en el catalogo; ` +
          `"${nombre}" usa la default del tenant.`,
      )
    }

    ofertas.push({ nombre, precio, imagen, estado: estadoNormalizado, tamano, descripcion, plantilla })
```

- [ ] **Paso 4: Los lectores reciben el tenant**

Reemplazar la firma y el arranque de `getListasPrecios`:

```ts
export async function getListasPrecios(tenant: Tenant): Promise<ListaPrecios[]> {
  const csvUrl = csvUrlDe(tenant.slug)

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return []
  }
```

Reemplazar la firma y el arranque de `getConfig`:

```ts
export async function getConfig(tenant: Tenant): Promise<ConfigNegocio> {
  const csvUrl = csvUrlDe(tenant.slug)
  const gidConfig = tenant.sheets.gidConfig

  if (!csvUrl || !gidConfig) {
    return {}
  }
```

Reemplazar la firma y el arranque de `getOfertas`:

```ts
export async function getOfertas(tenant: Tenant): Promise<Oferta[]> {
  const csvUrl = csvUrlDe(tenant.slug)
  const gidOfertas = tenant.sheets.gidOfertas

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return []
  }
  if (!gidOfertas) {
    console.error(`Tenant ${tenant.slug} sin sheets.gidOfertas`)
    return []
  }
```

Reemplazar `getPantallaData` completa:

```ts
export async function getPantallaData(tenant: Tenant): Promise<{
  listas: ListaPrecios[]
  ofertas: Oferta[]
  configRemota: ConfigNegocio
}> {
  const [listas, ofertas, configRemota] = await Promise.all([
    getListasPrecios(tenant),
    getOfertas(tenant),
    getConfig(tenant),
  ])
  return { listas, ofertas, configRemota }
}
```

- [ ] **Paso 5: Verificar que no queda ninguna lectura de `GOOGLE_SHEETS_*`**

```bash
grep -rn "GOOGLE_SHEETS" lib app components
```

Esperado: sin resultados.

- [ ] **Paso 6: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: errores **solo** en `app/page.tsx`, `app/vistaCartel/page.tsx`, `app/vistaLista/page.tsx` y `app/api/*/route.ts` (llaman a los lectores sin tenant). Se arreglan en la Tarea 9. Ningún error dentro de `lib/`.

- [ ] **Paso 7: Listo para commitear** — `types/index.ts`, `lib/sheets.ts`.

---

## Tarea 7: `templates/` — extraer tabla y cartel

**Files:**
- Create: `templates/tabla/Clasica.tsx`
- Create: `templates/cartel/Clasico.tsx`
- Create: `templates/index.ts`
- Create: `lib/precio.ts` (mover `formatPrecio` para que lo usen ambos templates)

- [ ] **Paso 1: Mover `formatPrecio` a `lib/precio.ts`**

Crear `lib/precio.ts` con el contenido exacto de la función `formatPrecio` que hoy está en `components/PantallaRotativa.tsx`:

```ts
export function formatPrecio(precio: string): string {
  // El cliente carga precios en Sheets, y puede usar formato AR ("1.500,50",
  // con punto de miles y coma decimal) o formato JS/US ("1500.50"). Si lo
  // pasaramos directo a Number() perderiamos los miles: Number("1.500") === 1.5.
  // Convencion: si hay coma, asumimos formato AR y reemplazamos puntos por
  // nada (miles) y la coma por punto (decimal). Si no hay coma, lo dejamos
  // como esta — funciona igual para "1500" y para "1500.50".
  const limpio = precio.trim()
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio
  const num = Number(normalizado)
  if (Number.isNaN(num)) return `$${precio}`
  return `$${num.toLocaleString('es-AR')}`
}
```

- [ ] **Paso 2: Crear `templates/tabla/Clasica.tsx`**

Es el bloque `<div className={styles.tableWrap}>…</div>` de `PantallaRotativa`, con el texto del empty state y el WhatsApp por props:

```tsx
'use client'

import type { ListaPrecios } from '@/types'
import { formatPrecio } from '@/lib/precio'
import styles from '@/app/page.module.css'

export interface TablaProps {
  lista: ListaPrecios | null
  /** Primera linea del empty state (tenant.textos.sinDatos). */
  textoSinDatos: string
  /** WhatsApp a mostrar en el empty state. */
  whatsapp: string
}

/*
 * Unico diseno de tabla del catalogo. Sin colores fijos: todo entra por las
 * CSS vars (--c-*) que PantallaRotativa inyecta en .screen desde la paleta
 * del tenant. Mismo componente, otra paleta = otro cliente.
 */
export default function TablaClasica({ lista, textoSinDatos, whatsapp }: TablaProps) {
  const productos = lista?.productos ?? []

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headRow}>
            <th className={styles.superHeadCell} colSpan={2}>
              {lista?.titulo ?? 'Lista de Precios'}
            </th>
          </tr>
        </thead>
        <tbody>
          {productos.length > 0 ? (
            productos.map((producto, i) => (
              <tr key={`${producto.nombre}-${i}`} className={styles.row}>
                <td className={`${styles.cellBase} ${styles.descriptionCell}`}>
                  {producto.nombre}
                </td>
                <td className={`${styles.cellBase} ${styles.priceCell}`}>
                  <div className={styles.priceInline}>
                    <span className={styles.priceValue}>{formatPrecio(producto.precio)}</span>
                    {producto.unidad && (
                      <span className={styles.unitValue}>por {producto.unidad}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={2} className={`${styles.cellBase} ${styles.emptyState}`}>
                <div>{textoSinDatos}</div>
                <div className={styles.emptyStateContact}>Consultá por {whatsapp}</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Paso 3: Crear `templates/cartel/Clasico.tsx`**

Es `CartelOferta` + `TAMANO_OFERTA_A_ESCALA` de `PantallaRotativa`, con la imagen desde Cloudinary y el badge desde `textos`:

```tsx
'use client'

import { useState, type CSSProperties } from 'react'

import type { Oferta } from '@/types'
import type { Tenant } from '@/types/tenant'
import { formatPrecio } from '@/lib/precio'
import { urlOferta } from '@/lib/cloudinary'
import styles from '@/app/page.module.css'

export interface CartelProps {
  oferta: Oferta
  textos: Tenant['textos']
}

/*
 * Mapeo de la escala 1-10 de la columna "tamano" del Sheets a un porcentaje
 * del wrapper de la imagen. Lineal: rango 55%-120%, paso de ~7,22% entre
 * niveles (redondeado a entero). El default es el nivel 6 (= 91%).
 * Ampliado a rango 55-120% en sesion 14 (antes 55-100%) porque el cliente
 * queria que las imagenes mas grandes pudieran exceder el wrapper.
 *
 * OJO: niveles 8-10 (>100%) hacen que la imagen sea mas grande que su
 * contenedor y pueda solaparse con el titulo o el circulo de precio del
 * cartel. Es intencional (el cliente lo pidio) pero hay que usar esos
 * valores altos solo en imagenes que visualmente lo toleren.
 */
const TAMANO_OFERTA_A_ESCALA: Record<number, string> = {
  1: '55%',
  2: '62%',
  3: '69%',
  4: '77%',
  5: '84%',
  6: '91%',
  7: '98%',
  8: '106%',
  9: '113%',
  10: '120%',
}

const TAMANO_OFERTA_ESCALA_DEFAULT = TAMANO_OFERTA_A_ESCALA[6]

/*
 * Cartel clasico: badge a la izquierda sobre diagonal, foto al centro,
 * precio en circulo. Sin colores fijos (CSS vars --c-*). El badge y el
 * empty state salen de tenant.textos, asi que sirve para cualquier rubro.
 */
export default function CartelClasico({ oferta, textos }: CartelProps) {
  const [imgError, setImgError] = useState(false)

  // El contrato con el cliente es cargar un slug del catalogo. Aun asi
  // re-slugificamos para que la pantalla no se rompa si se equivoca, y lo
  // logueamos solo en dev.
  const slug = oferta.imagen.toLowerCase().trim().replace(/\s+/g, '-')
  if (process.env.NODE_ENV !== 'production' && slug !== oferta.imagen) {
    console.warn(
      `[ofertas] "${oferta.imagen}" se re-slugify como "${slug}". ` +
        `Cargar el slug correcto en la planilla (columna "slug imagen").`,
    )
  }

  const escalaImagen = TAMANO_OFERTA_A_ESCALA[oferta.tamano] ?? TAMANO_OFERTA_ESCALA_DEFAULT
  const imageVars = { '--cartel-image-scale': escalaImagen } as CSSProperties

  // Las dos lineas del badge: "SUPER OFERTA" -> SUPER / OFERTA. Si el tenant
  // usa una sola palabra ("OFERTA"), va en una linea.
  const [badgeArriba, ...badgeResto] = textos.badgeOferta.split(' ')

  return (
    <div className={styles.cartel}>
      <div className={styles.cartelDiagonal} />

      <div className={`${styles.cartelBadge} ${styles.pulseSuperOferta}`}>
        {badgeArriba}
        {badgeResto.length > 0 && (
          <>
            <br />
            {badgeResto.join(' ')}
          </>
        )}
      </div>

      {oferta.descripcion && (
        <div className={styles.cartelAclaracion}>
          {/* Cada coma en la celda "Nota" del Sheets es un salto de linea
              explicito, para que el cliente controle el corte sin depender
              del wrap automatico del CSS. */}
          {oferta.descripcion
            .split(',')
            .map((linea) => linea.trim())
            .filter(Boolean)
            .map((linea, i) => (
              <div key={i}>{linea}</div>
            ))}
        </div>
      )}

      <div className={styles.cartelTitleWrap}>
        <div className={styles.cartelTitle}>{oferta.nombre}</div>
      </div>

      {!imgError && (
        <div className={styles.cartelImageWrap}>
          {/* crossOrigin: la respuesta de Cloudinary llega como CORS (no
              opaca) y el Service Worker la puede cachear sin el padding de
              cuota que Chrome aplica a respuestas opacas. */}
          <img
            src={urlOferta(slug)}
            alt={oferta.nombre}
            width={800}
            height={800}
            crossOrigin="anonymous"
            onError={() => setImgError(true)}
            className={`${styles.cartelImage} ${styles.pulseImage}`}
            style={imageVars}
          />
        </div>
      )}

      <div className={`${styles.cartelPrice} ${styles.pulsePrice}`}>
        <span className={styles.cartelPriceText}>{formatPrecio(oferta.precio)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Paso 4: Crear `templates/index.ts`**

```ts
import type { ComponentType } from 'react'

import type { PlantillaCartelId } from '@/lib/plantillas'
import CartelClasico, { type CartelProps } from './cartel/Clasico'

export type { CartelProps }

/*
 * Catalogo de plantillas de cartel. Tipado contra PlantillaCartelId
 * (lib/plantillas.ts): agregar un id alla sin agregar el componente aca no
 * compila, y viceversa.
 */
export const CATALOGO_CARTELES: Record<PlantillaCartelId, ComponentType<CartelProps>> = {
  clasico: CartelClasico,
}
```

- [ ] **Paso 5: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: los mismos errores de la Tarea 6 en `app/` (pendientes hasta la Tarea 9); ninguno en `templates/` ni `lib/`.

- [ ] **Paso 6: Listo para commitear** — `lib/precio.ts`, `templates/`.

---

## Tarea 8: `PantallaRotativa`, `Header`, `Footer` reciben el tenant

**Files:**
- Modify: `components/PantallaRotativa.tsx`
- Modify: `components/Header.tsx`
- Modify: `components/Footer.tsx`

- [ ] **Paso 1: `Header` con tenant por props**

Reemplazar `components/Header.tsx` completo:

```tsx
'use client'

import { memo, useState } from 'react'

import type { Tenant } from '@/types/tenant'
import { urlLogo } from '@/lib/cloudinary'
import styles from './Header.module.css'

interface HeaderProps {
  tenant: Tenant
}

// `tenant` llega con la misma referencia en cada tick de la rotacion (solo
// cambia tras un reload completo). `memo` evita que el rotador de
// PantallaRotativa (tick cada 3-12s, horas seguidas) vuelva a reconciliar
// este subarbol en cada cambio de indice.
function Header({ tenant }: HeaderProps) {
  const [imgError, setImgError] = useState(false)

  return (
    <header className={styles.header} style={{ background: tenant.paleta.primario }}>
      <div className={styles.brandRow}>
        <div
          style={{
            background: 'white',
            borderRadius: '8px',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {imgError ? null : (
            <img
              src={urlLogo(tenant.logo)}
              alt={tenant.nombre}
              width={100}
              height={100}
              crossOrigin="anonymous"
              style={{ height: 'clamp(50px, 8vh, 100px)', width: 'auto' }}
              onError={() => setImgError(true)}
            />
          )}
        </div>
        <div className={styles.brandCopy}>
          <span className={styles.brandName}>{tenant.nombre}</span>
          <span className={styles.brandTagline}>{tenant.eslogan}</span>
        </div>
      </div>
    </header>
  )
}

export default memo(Header)
```

- [ ] **Paso 2: `Footer` con tenant por props**

En `components/Footer.tsx`:

Reemplazar `import { negocioConfig } from '@/config/negocio'` por `import type { Tenant } from '@/types/tenant'`.

Reemplazar:

```ts
interface FooterProps {
  config?: ConfigNegocio
}
```

por:

```ts
interface FooterProps {
  tenant: Tenant
  config?: ConfigNegocio
}
```

Reemplazar la cabecera de la función y las cuatro líneas de fallback:

```tsx
function Footer({ tenant, config }: FooterProps) {
  const footerFontVars = {
    '--footer-font-scale': `${tenant.tipografia.footer / 100}`,
  } as CSSProperties

  const whatsapp = config?.whatsapp ?? tenant.defaults.whatsapp
  const instagram = config?.instagram ?? tenant.defaults.instagram
  const horarios = config?.horarios ?? tenant.defaults.horarios

  return (
    <footer className={styles.footer} style={{ background: tenant.paleta.primario }}>
```

(El resto del JSX —SVGs y spans— no cambia.)

- [ ] **Paso 3: `PantallaRotativa` con tenant y templates**

En `components/PantallaRotativa.tsx`:

Reemplazar los imports:

```tsx
'use client'

import { useEffect, useReducer, type CSSProperties } from 'react'

import DimOverlay from '@/components/DimOverlay'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import HealthIndicator from '@/components/HealthIndicator'
import TablaClasica from '@/templates/tabla/Clasica'
import { CATALOGO_CARTELES } from '@/templates'
import type { ConfigNegocio, ListaPrecios, Oferta } from '@/types'
import type { Tenant } from '@/types/tenant'
import styles from '@/app/page.module.css'
```

Borrar la función `formatPrecio` completa (ahora en `lib/precio.ts`).

En `interface PantallaRotativaProps`, agregar como primer campo:

```ts
  tenant: Tenant
```

En la firma del componente, agregar `tenant` a la destructuración:

```tsx
export default function PantallaRotativa({
  tenant,
  listas,
  ofertas,
  configRemota,
  modoFijo,
  indiceFijo = 0,
}: PantallaRotativaProps) {
```

Reemplazar:

```ts
  const segundosCartel = configRemota.segundosCartel ?? negocioConfig.segundosCartel
  const segundosTabla = configRemota.segundosTabla ?? negocioConfig.segundosTabla
```

por:

```ts
  const segundosCartel = configRemota.segundosCartel ?? tenant.defaults.segundosCartel
  const segundosTabla = configRemota.segundosTabla ?? tenant.defaults.segundosTabla
```

Reemplazar el bloque `screenVars`:

```ts
  // Paleta del tenant como CSS custom properties en `.screen`. Los templates
  // y el CSS module consumen `var(--c-*)`: mismo template, otra paleta =
  // otro cliente, sin tocar componentes.
  const screenVars = {
    '--c-primario': tenant.paleta.primario,
    '--c-secundario': tenant.paleta.secundario,
    '--c-fondo': tenant.paleta.fondo,
    '--c-texto-primario': tenant.paleta.textoPrimario,
    '--c-texto-secundario': tenant.paleta.textoSecundario,
    '--c-fila-impar': tenant.paleta.filaImpar,
    '--table-font-scale': `${tenant.tipografia.tabla / 100}`,
  } as CSSProperties

  const ofertaActual = modo === 'cartel' ? ofertas[cartelIndex] : null
  const listaActual = listas[listaIndex] ?? null
  const Cartel = ofertaActual
    ? CATALOGO_CARTELES[ofertaActual.plantilla ?? tenant.plantillaCartelDefault]
    : null
```

(Borrar la línea `const productosActuales = …`.)

Reemplazar el `return` completo:

```tsx
  return (
    <main className={styles.pageShell}>
      <div className={styles.screen} style={screenVars}>
        <DimOverlay desde={configRemota.atenuarDesde} hasta={configRemota.atenuarHasta} />
        <HealthIndicator />
        <Header tenant={tenant} />
        {ofertaActual && Cartel ? (
          // key por nombre: el remount dispara la animacion de entrada.
          <Cartel key={ofertaActual.nombre} oferta={ofertaActual} textos={tenant.textos} />
        ) : (
          <TablaClasica
            lista={listaActual}
            textoSinDatos={tenant.textos.sinDatos}
            whatsapp={configRemota.whatsapp ?? tenant.defaults.whatsapp}
          />
        )}
        <Footer tenant={tenant} config={configRemota} />
      </div>
    </main>
  )
}
```

Borrar todo lo que sigue al componente: el comentario y la constante `TAMANO_OFERTA_A_ESCALA`, `TAMANO_OFERTA_ESCALA_DEFAULT` y la función `CartelOferta` (todo movido a `templates/cartel/Clasico.tsx`).

Actualizar el comentario de `RELOAD_INTERVAL_MS` que dice "(cache de 60s en lib/sheets.ts)": reemplazar esa frase por "(sin cache desde sesion 19)".

- [ ] **Paso 4: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: errores solo en `app/` (falta pasar `tenant` a `PantallaRotativa` y a los lectores). `components/` limpio.

- [ ] **Paso 5: Lint**

```bash
npm run lint
```

Esperado: sin `unused` en `PantallaRotativa` (si aparece `useState` sin uso, quitarlo del import).

- [ ] **Paso 6: Listo para commitear** — los tres componentes.

---

## Tarea 9: Rutas `app/[tenant]/`, `app/page.tsx`, API

**Files:**
- Create: `lib/tenant-route.ts`
- Create: `app/[tenant]/layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`
- Create: `app/[tenant]/vistaCartel/page.tsx`, `app/[tenant]/vistaLista/page.tsx`
- Create: `app/[tenant]/manifest.webmanifest/route.ts`
- Create: `app/api/[tenant]/productos/route.ts`, `ofertas/route.ts`, `config/route.ts`
- Modify: `app/page.tsx`, `app/layout.tsx`
- Delete: `app/loading.tsx`, `app/error.tsx`, `app/vistaCartel/`, `app/vistaLista/`, `app/api/productos/`, `app/api/ofertas/`, `app/api/config/`, `app/manifest.json`, `config/negocio.ts`

- [ ] **Paso 1: Leer la doc de Next 16 sobre `params` y `notFound`**

```bash
grep -n "params" node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md | head -20
```

Confirmar que `params` es una `Promise` que hay que `await` (así ya lo usa `app/vistaCartel/page.tsx` con `searchParams`).

- [ ] **Paso 2: Crear `lib/tenant-route.ts`**

```ts
import 'server-only'

import { notFound } from 'next/navigation'

import { getTenant } from '@/tenants'
import type { Tenant } from '@/types/tenant'

export type TenantParams = Promise<{ tenant: string }>

/*
 * Resuelve el tenant del segmento [tenant]. Slug desconocido -> 404 de Next.
 * Lo usan layout, pages y route handlers del segmento.
 */
export async function getTenantOr404(params: TenantParams): Promise<Tenant> {
  const { tenant: slug } = await params
  const tenant = getTenant(slug)
  if (!tenant) notFound()
  return tenant
}

/*
 * Tenant por defecto para "/". La TV de El Ancla apunta a "/" y no se
 * puede cambiar sin ir al local, asi que "/" renderiza este tenant (no
 * redirige: un 307 no es cacheable por el Service Worker y la TV perderia
 * el fallback offline). Ver docs/decisiones.md.
 */
export function getDefaultTenantOr404(): Tenant {
  const slug = process.env.DEFAULT_TENANT
  const tenant = slug ? getTenant(slug) : undefined
  if (!tenant) notFound()
  return tenant
}
```

- [ ] **Paso 3: Crear `app/[tenant]/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next'

import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

interface Props {
  params: TenantParams
  children: React.ReactNode
}

export async function generateMetadata({ params }: { params: TenantParams }): Promise<Metadata> {
  const tenant = await getTenantOr404(params)
  return {
    title: `${tenant.nombre} - Precios`,
    description: `Pantalla de precios y ofertas de ${tenant.nombre}`,
    manifest: `/${tenant.slug}/manifest.webmanifest`,
  }
}

export async function generateViewport({ params }: { params: TenantParams }): Promise<Viewport> {
  const tenant = await getTenantOr404(params)
  return { themeColor: tenant.paleta.primario }
}

export default async function TenantLayout({ params, children }: Props) {
  // Resolver aca hace que un slug desconocido sea 404 antes de renderizar
  // cualquier page o loading del segmento.
  await getTenantOr404(params)
  return children
}
```

- [ ] **Paso 4: Crear `app/[tenant]/page.tsx`**

```tsx
import PantallaRotativa from '@/components/PantallaRotativa'
import { getPantallaData } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

// Render dinamico en cada request: sin ISR y sin cache de fetch (ver
// FETCH_SIN_CACHE en lib/sheets.ts). Es lo que hace que apretar "actualizar"
// en el Fire TV muestre los precios nuevos en ESE reload. Ver
// docs/decisiones.md (sesion 19).
export const dynamic = 'force-dynamic'

export default async function PantallaTenant({ params }: { params: TenantParams }) {
  const tenant = await getTenantOr404(params)
  const { listas, ofertas, configRemota } = await getPantallaData(tenant)

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
    />
  )
}
```

- [ ] **Paso 5: Reemplazar `app/page.tsx`**

```tsx
import PantallaRotativa from '@/components/PantallaRotativa'
import { getPantallaData } from '@/lib/sheets'
import { getDefaultTenantOr404 } from '@/lib/tenant-route'

// "/" renderiza el tenant DEFAULT_TENANT (hoy granja-elancla) porque la TV
// del local apunta a "/" y no se puede cambiar sin ir fisicamente. No es un
// redirect a proposito: ver getDefaultTenantOr404.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const tenant = getDefaultTenantOr404()
  const { listas, ofertas, configRemota } = await getPantallaData(tenant)

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
    />
  )
}
```

- [ ] **Paso 6: Mover y adaptar `loading.tsx`**

```bash
git mv app/loading.tsx "app/[tenant]/loading.tsx"
```

En `app/[tenant]/loading.tsx`: borrar `import { negocioConfig } from '@/config/negocio'`. Reemplazar `background: negocioConfig.colores.primario,` por `background: '#222',`. Reemplazar el `<span>` con `{negocioConfig.nombre}` por:

```tsx
        <span
          style={{
            fontSize: 'clamp(28px, 4vw, 64px)',
            fontWeight: 800,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          Precios
        </span>
```

Reemplazar `Cargando ofertas…` por `Cargando…`. Actualizar el comentario de cabecera:

```ts
// Pantalla de carga mientras se resuelven los fetch a Google Sheets. Es
// generica (sin nombre ni paleta): loading.tsx no recibe params en Next, asi
// que no puede saber el tenant. Dura ~1s al arrancar.
```

Copiar el archivo a `app/loading.tsx` también (para la ruta `/`): `cp "app/[tenant]/loading.tsx" app/loading.tsx`.

- [ ] **Paso 7: Mover y adaptar `error.tsx`**

```bash
git mv app/error.tsx "app/[tenant]/error.tsx"
```

En `app/[tenant]/error.tsx`, reemplazar los imports:

```tsx
'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'

import { getTenant } from '@/tenants'
```

Dentro del componente, antes del primer `useEffect`, agregar:

```tsx
  // Client Component: el tenant se resuelve del path. Si por algun motivo el
  // slug no esta en el registro (no deberia: el layout ya hizo 404), se cae a
  // valores neutros para no romper el boundary de errores.
  const params = useParams<{ tenant?: string }>()
  const tenant = params?.tenant ? getTenant(params.tenant) : undefined
  const primario = tenant?.paleta.primario ?? '#222'
  const nombre = tenant?.nombre ?? 'Precios'
  const whatsapp = tenant?.defaults.whatsapp ?? ''
  const instagram = tenant?.defaults.instagram ?? ''
  const horarios = tenant?.defaults.horarios ?? ''
```

Y reemplazar en el JSX: `negocioConfig.colores.primario` → `primario` (dos veces), `{negocioConfig.nombre}` → `{nombre}`, `{negocioConfig.whatsapp ?? negocioConfig.telefono}` → `{whatsapp}`, `{negocioConfig.instagram}` → `{instagram}`, `{negocioConfig.horarios}` → `{horarios}`. Actualizar el comentario de cabecera: "(desde config/negocio.ts)" → "(desde el registro de tenants, via useParams)".

Copiar a `app/error.tsx` para la ruta `/`: `cp "app/[tenant]/error.tsx" app/error.tsx`. En esa copia, `useParams` no trae `tenant`; agregar después de la línea `const params = …`:

```tsx
  const slugDefault = process.env.NEXT_PUBLIC_DEFAULT_TENANT
```

y cambiar la resolución a `const tenant = getTenant(params?.tenant ?? slugDefault ?? '')`. (`NEXT_PUBLIC_DEFAULT_TENANT` se agrega en la Tarea 12 con el mismo valor que `DEFAULT_TENANT`.)

- [ ] **Paso 8: Rutas de dev**

```bash
git mv app/vistaCartel "app/[tenant]/vistaCartel"
git mv app/vistaLista "app/[tenant]/vistaLista"
```

En `app/[tenant]/vistaCartel/page.tsx`, reemplazar la firma y el cuerpo:

```tsx
import PantallaRotativa from '@/components/PantallaRotativa'
import { getPantallaData } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

/*
 * Ruta de desarrollo: pantalla fija en modo "cartel", sin rotacion, para
 * iterar sobre el diseno del cartel de oferta sin esperar el timer. No la
 * usa el cliente final. Acepta ?index=N para fijar una oferta puntual
 * (default 0 = la primera oferta activa).
 */
export const dynamic = 'force-dynamic'

export default async function VistaCartel({
  params,
  searchParams,
}: {
  params: TenantParams
  searchParams: Promise<{ index?: string }>
}) {
  const tenant = await getTenantOr404(params)
  const { index } = await searchParams
  const { listas, ofertas, configRemota } = await getPantallaData(tenant)

  return (
    <PantallaRotativa
      tenant={tenant}
      listas={listas}
      ofertas={ofertas}
      configRemota={configRemota}
      modoFijo="cartel"
      indiceFijo={index ? Number(index) : 0}
    />
  )
}
```

Mismo cambio en `app/[tenant]/vistaLista/page.tsx` con `modoFijo="tabla"` y el comentario que ya tiene.

- [ ] **Paso 9: API por tenant**

```bash
git mv app/api/productos "app/api/[tenant]/productos"
git mv app/api/ofertas "app/api/[tenant]/ofertas"
git mv app/api/config "app/api/[tenant]/config"
```

Reemplazar `app/api/[tenant]/productos/route.ts`:

```ts
import { getListasPrecios } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

export async function GET(_req: Request, { params }: { params: TenantParams }) {
  const tenant = await getTenantOr404(params)
  const listas = await getListasPrecios(tenant)
  return Response.json(listas)
}
```

`app/api/[tenant]/ofertas/route.ts`:

```ts
import { getOfertas } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

export async function GET(_req: Request, { params }: { params: TenantParams }) {
  const tenant = await getTenantOr404(params)
  const ofertas = await getOfertas(tenant)
  return Response.json(ofertas)
}
```

`app/api/[tenant]/config/route.ts`:

```ts
import { getConfig } from '@/lib/sheets'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

export async function GET(_req: Request, { params }: { params: TenantParams }) {
  const tenant = await getTenantOr404(params)
  const config = await getConfig(tenant)
  return Response.json(config)
}
```

- [ ] **Paso 10: Manifest por tenant**

Crear `app/[tenant]/manifest.webmanifest/route.ts`:

```ts
import { urlIcono } from '@/lib/cloudinary'
import { getTenantOr404, type TenantParams } from '@/lib/tenant-route'

/*
 * Manifest PWA por tenant. Reemplaza al app/manifest.json global (sesion 17):
 * con varios comercios, el nombre, los iconos y el start_url tienen que ser
 * del comercio que instala la PWA en su TV. Los iconos se derivan del logo
 * en Cloudinary con una transformacion, sin archivos en el repo.
 */
export async function GET(_req: Request, { params }: { params: TenantParams }) {
  const tenant = await getTenantOr404(params)

  const manifest = {
    name: `${tenant.nombre} - Precios`,
    short_name: tenant.nombre,
    description: `Pantalla de precios y ofertas de ${tenant.nombre}`,
    start_url: `/${tenant.slug}`,
    scope: `/${tenant.slug}`,
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: tenant.paleta.fondo,
    theme_color: tenant.paleta.primario,
    icons: [
      { src: urlIcono(tenant.logo, 192), sizes: '192x192', type: 'image/png' },
      { src: urlIcono(tenant.logo, 512), sizes: '512x512', type: 'image/png' },
    ],
  }

  return Response.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
```

- [ ] **Paso 11: Root layout genérico**

En `app/layout.tsx`, reemplazar `metadata` y borrar `viewport` (ahora lo genera `[tenant]/layout.tsx`):

```tsx
export const metadata: Metadata = {
  title: 'Cartelería de precios',
  description: 'Pantalla de precios y ofertas para comercios',
}
```

Borrar `import type { Metadata, Viewport }` → `import type { Metadata }`, el bloque `export const viewport` y su comentario. Actualizar el comentario que menciona `app/manifest.json`:

```tsx
// `app/icon.png` y `app/apple-icon.png` se auto-detectan por convencion de
// archivo de Next. El manifest es por tenant: app/[tenant]/manifest.webmanifest.
```

- [ ] **Paso 12: Borrar lo que ya no se usa**

```bash
git rm app/manifest.json config/negocio.ts
git rm -r public/ofertas public/logo.png public/icons
```

- [ ] **Paso 13: Verificar que nadie importa lo borrado**

```bash
grep -rn "config/negocio\|negocioConfig\|/ofertas/\|/icons/\|manifest.json" app components lib templates tenants types public/sw.js
```

Esperado: sin resultados (salvo el comentario del layout que dice "manifest.webmanifest").

- [ ] **Paso 14: Typecheck y lint**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: ambos limpios. Es el primer momento del plan en que `tsc` vuelve a estar en verde.

- [ ] **Paso 15: Tests**

```bash
npm test
```

Esperado: `ℹ pass 16`, `ℹ fail 0`.

- [ ] **Paso 16: Listo para commitear** — todo `app/`, `lib/tenant-route.ts`, borrados.

---

## Tarea 10: Service Worker — Cloudinary y v7

**Files:**
- Modify: `public/sw.js`

- [ ] **Paso 1: Versión y orígenes**

Reemplazar:

```js
const CACHE_VERSION = 'micro-landing-v6'
```

por:

```js
// v7: sesion 21 (multitenant + Cloudinary). Las imagenes ya no son
// same-origin: se agrega res.cloudinary.com a los origenes cacheables. Sin
// esto, con la wifi caida el cartel mostraria precio sin foto. Las <img>
// llevan crossorigin="anonymous", asi que la respuesta es CORS (no opaca) y
// se cachea sin el padding de cuota de Chrome.
const CACHE_VERSION = 'micro-landing-v7'

const ORIGENES_CACHEABLES = new Set([self.location.origin, 'https://res.cloudinary.com'])
```

Encima del bloque `// v6: …`, para mantener el historial.

- [ ] **Paso 2: Filtro de origen**

En el listener `fetch`, reemplazar:

```js
  // Solo same-origin — no nos metemos con fonts externas, beacons de
  // analytics, etc. (en este proyecto basicamente no hay, pero
  // defensivo). Vercel sirve _next/* desde el mismo origen.
  if (url.origin !== self.location.origin) return
```

por:

```js
  // Same-origin + Cloudinary. Fonts externas, beacons, etc. pasan sin
  // interferencia (en este proyecto basicamente no hay, pero defensivo).
  if (!ORIGENES_CACHEABLES.has(url.origin)) return
```

- [ ] **Paso 3: Comentario del fallback de navegación**

Reemplazar el comentario sobre `cache.match('/')`:

```js
    // Para navegaciones HTML reales (full page load), el "/" cacheado es un
    // ultimo recurso: "/" renderiza el tenant por defecto (no redirige), asi
    // que sigue siendo HTML valido para la TV que todavia apunta ahi. Solo se
    // llega aca si la URL pedida nunca se cacheo antes.
```

- [ ] **Paso 4: Verificar sintaxis**

```bash
node --check public/sw.js
```

Esperado: sin salida (OK).

- [ ] **Paso 5: Listo para commitear** — `public/sw.js`.

---

## Tarea 11: Descripción del proyecto en `.env.local.example` y ESLint

**Files:**
- Modify: `.env.local.example`
- Modify: `eslint.config.mjs`

- [ ] **Paso 1: Reemplazar `.env.local.example` completo**

```
# ---- Globales ----------------------------------------------------------

# Tenant que se sirve en "/" (la TV de El Ancla apunta a "/").
DEFAULT_TENANT=granja-elancla
# Mismo valor, expuesto al cliente (lo usa app/error.tsx).
NEXT_PUBLIC_DEFAULT_TENANT=granja-elancla

# Cloudinary: cloud name (Dashboard) y carpeta base del catalogo de imagenes.
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_CATALOGO=catalogo

# ---- Por tenant --------------------------------------------------------
# Una variable por comercio: TENANT_<SLUG_EN_MAYUSCULAS_CON_GUION_BAJO>_CSV_URL
# con la URL del CSV publicado de su planilla (Archivo > Compartir > Publicar
# en la web > CSV). Los GIDs de ofertas y config van en tenants/<slug>.ts.

TENANT_GRANJA_ELANCLA_CSV_URL=
```

- [ ] **Paso 2: Comentario de ESLint**

En `eslint.config.mjs`, reemplazar el comentario de la regla `no-img-element`:

```js
    // Decision del proyecto: no usar `next/image` porque el optimizador de
    // imagenes de Vercel consume cuota en la capa gratuita. Las imagenes
    // vienen de Cloudinary ya transformadas (f_auto,q_auto,w_*), asi que
    // <img> alcanza. Ver docs/decisiones.md.
```

- [ ] **Paso 3: Listo para commitear** — los dos archivos.

---

## Tarea 12: Validación local contra build de producción

**Files:** ninguno nuevo. Requiere la Tarea 0 (imágenes en Cloudinary).

- [ ] **Paso 1: `.env.local` local (no se commitea)**

Editar `.env.local` (ignorado por git) para que quede:

```
DEFAULT_TENANT=granja-elancla
NEXT_PUBLIC_DEFAULT_TENANT=granja-elancla
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<cloud name de la Tarea 0>
NEXT_PUBLIC_CLOUDINARY_CATALOGO=catalogo
TENANT_GRANJA_ELANCLA_CSV_URL=<el valor actual de GOOGLE_SHEETS_CSV_URL>
```

Las `GOOGLE_SHEETS_*` viejas se pueden borrar del archivo local.

- [ ] **Paso 2: Build**

```bash
npm run build
```

Esperado: `✓ Compiled successfully`. En el listado de rutas: `ƒ /`, `ƒ /[tenant]`, `ƒ /[tenant]/manifest.webmanifest`, `ƒ /[tenant]/vistaCartel`, `ƒ /[tenant]/vistaLista`, `ƒ /api/[tenant]/config|ofertas|productos`, `○ /icon.png`, `○ /apple-icon.png`. **No** debe aparecer `/manifest.json`.

- [ ] **Paso 3: Build sin env (simula CI)**

```bash
DEFAULT_TENANT="" NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="" TENANT_GRANJA_ELANCLA_CSV_URL="" npm run build
```

Esperado: exit 0.

- [ ] **Paso 4: Levantar producción local**

Con el preview `prod` de `.claude/launch.json` (`npm start`, puerto 3100), o `npm start` en una terminal.

- [ ] **Paso 5: Checks HTTP**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/granja-elancla
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/no-existe
curl -s http://localhost:3100/api/granja-elancla/ofertas | head -c 300
curl -s http://localhost:3100/granja-elancla/manifest.webmanifest
curl -s http://localhost:3100/granja-elancla | grep -o 'res.cloudinary.com[^"]*' | head -3
```

Esperado, en orden: `200`, `200`, `404`, JSON con ofertas, manifest con `"name": "Granja El Ancla - Precios"` y dos URLs de Cloudinary en `icons`, y al menos una URL `res.cloudinary.com/.../catalogo/...` en el HTML (el logo del header; los carteles se renderizan en el cliente al rotar).

- [ ] **Paso 6: Check visual**

Abrir `http://localhost:3100/granja-elancla/vistaCartel?index=0` y `http://localhost:3100/granja-elancla/vistaLista` en el navegador. Verificar: logo desde Cloudinary en el header, foto de la oferta cargada, badge "SUPER OFERTA", colores rojo/azul. Abrir DevTools → Network → confirmar que la foto responde `200` desde `res.cloudinary.com` con `Access-Control-Allow-Origin: *`.

- [ ] **Paso 7: Check offline**

En `http://localhost:3100/granja-elancla`: esperar a que el SW esté `activated` (DevTools → Application → Service Workers, versión `micro-landing-v7`). Recargar una vez. Apagar el servidor (`preview_stop` o Ctrl+C). Recargar: la pantalla debe renderizar desde cache **con la foto del cartel** (Application → Cache Storage → `micro-landing-v7` debe listar entradas de `res.cloudinary.com`).

- [ ] **Paso 8: Tests, tipos, lint — todo junto**

```bash
npm test && npx tsc --noEmit && npm run lint
```

Esperado: `ℹ pass 16`, tsc limpio, lint limpio.

---

## Tarea 13: Documentación

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `docs/decisiones.md`, `docs/progreso.md`, `docs/api.md`

- [ ] **Paso 1: README**

Reescribir las secciones afectadas (mantener el resto):

- Título y primer párrafo: "Cartelería digital para comercios de barrio: …". Sacar "carnicería" como único rubro.
- Sección "Cómo funciona": el diagrama pasa a arrancar en `Google Sheets del comercio` → `app/[tenant]/page.tsx` → `PantallaRotativa` → `templates/`. Agregar `Cloudinary` como fuente de imágenes.
- Decisión técnica 3 ("Sin `next/image`, con compresión propia en CI") se reescribe como "Imágenes en Cloudinary": el pipeline de `sharp` + hook + workflow existió de sesión 16 a 20 y se eliminó cuando las imágenes pasaron a un catálogo universal en Cloudinary (`f_auto,q_auto` hace lo mismo sin código propio).
- Nueva decisión técnica 5: "Multitenant por path, sin SaaS" — un párrafo con las decisiones 1-4 del spec.
- Sección "Estructura": agregar `tenants/`, `templates/`, `lib/cloudinary.ts`; sacar `scripts/` y `config/`; `.github/workflows/` = solo CI.
- Sección "Desarrollo local": variables de entorno = las de `.env.local.example`. Sacar la línea del hook pre-commit.
- **Nueva sección "Alta de un cliente"**, con el checklist del spec §11 (6 pasos).
- Sección "Estado": sacar "Verificar end-to-end el workflow de compresión" (ya no existe).

- [ ] **Paso 2: CHANGELOG — Sesión 21**

Agregar arriba de "Sesión 20" con el formato de las anteriores: **Context** (pedido multitenant; el spec), **Added** (rutas `[tenant]`, registro, templates, `lib/plantillas|cloudinary|tenant-env|precio|tenant-route`, columna `plantilla`, manifest por tenant, 4 archivos de tests), **Changed** (lectores por tenant, `PantallaRotativa`/`Header`/`Footer` con tenant, SW v7, `/` renderiza `DEFAULT_TENANT`, `.env`), **Removed** (pipeline de imágenes completo, `config/negocio.ts`, `app/manifest.json`, PNGs de `public/`, `sharp`), **Validation** (lo de la Tarea 12), **Cutover** (referencia a la Tarea 14).

- [ ] **Paso 3: `docs/decisiones.md` — dos ADRs nuevos arriba**

1. `2026-09-20 — Multitenant por path: un deploy, N comercios` — Problema, Decisión (B), por qué no SaaS, por qué no un deploy por cliente, por qué path y no subdominio, por qué el registro en el repo con URLs en env, por qué `/` renderiza en vez de redirigir (SW + TV).
2. `2026-09-20 — Imágenes en Cloudinary; se elimina el pipeline de sharp` — Problema (catálogo universal para N clientes; pipeline en repo no escala), Decisión, por qué se borra lo de sesiones 16-20 (cuatro mecanismos para cero archivos), `crossorigin` + SW, `d_placeholder`, lo que NO se hace (leer el catálogo maestro desde la app).

- [ ] **Paso 4: `docs/progreso.md`**

- Cabecera: fecha y "sesión 21".
- "Estado general": un párrafo nuevo sobre multitenant.
- "Arquitectura actual": el árbol nuevo (`app/[tenant]/`, `tenants/`, `templates/`, `lib/*`), sin `scripts/`, `.githooks/`, `config/`.
- "Flujo de datos": paso 2 lee `TENANT_<SLUG>_CSV_URL`; nuevo paso sobre `plantilla`; imágenes desde Cloudinary.
- "Completado": entrada Sesión 21 (resumen de tareas 1-12).
- "Pendientes → Abierto": sacar el item del workflow de imágenes. Agregar: "Cutover a producción (Tarea 14) pendiente, fuera de horario".
- "Notas operativas": reemplazar el bloque de imágenes por "Imágenes: Cloudinary, catálogo `catalogo/<slug>`; el slug es lo que va en la planilla"; `npm test` ahora corre `**/*.test.ts`.

- [ ] **Paso 5: `docs/api.md`**

Todos los endpoints pasan a `/api/<tenant>/…`. Agregar `plantilla` al JSON de ejemplo de ofertas y su nota (alias de header, normalización, default). Sacar `minutosActualizacion` del ejemplo si sigue. Nota: slug desconocido → 404.

- [ ] **Paso 6: Listo para commitear** — los 5 docs.

---

## Tarea 14: Cutover a producción (usuario, fuera de horario)

**Sin código.** Requiere Tareas 0-13 commiteadas localmente y **sin pushear**.

- [ ] **Paso 1: Vercel → env** (a cualquier hora)

Agregar en Production: `DEFAULT_TENANT=granja-elancla`, `NEXT_PUBLIC_DEFAULT_TENANT=granja-elancla`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<cloud>`, `NEXT_PUBLIC_CLOUDINARY_CATALOGO=catalogo`, `TENANT_GRANJA_ELANCLA_CSV_URL=<mismo valor que GOOGLE_SHEETS_CSV_URL>`. **Dejar** las `GOOGLE_SHEETS_*` viejas.

- [ ] **Paso 2: Confirmar la ventana horaria**

Horarios de El Ancla: MAR a SAB 8:15-13 y 16:30-20:15, DOM 8:15-13. Pushear solo fuera de esos rangos.

- [ ] **Paso 3: Push**

`git push` desde GitLens. Vercel deploya. El CI corre en paralelo (`tsc`, `lint`, `test`, `build`).

- [ ] **Paso 4: Verificar producción**

Desde el celular:
- `https://<dominio-nuevo>/granja-elancla` → tabla y carteles con fotos.
- `https://precios-el-ancla.vercel.app/` → lo mismo (es lo que ve la TV).
- `https://<dominio-nuevo>/granja-elancla/manifest.webmanifest` → JSON correcto.

La TV se actualiza sola en su próximo reload (≤ 30 min).

- [ ] **Paso 5: Si algo falla**

Vercel → Deployments → deploy anterior → "Instant Rollback". La TV vuelve al build viejo en su próximo reload. Sin tocar git.

- [ ] **Paso 6: Después (días siguientes)**

- Borrar `GOOGLE_SHEETS_*` de Vercel.
- Cambiar la URL de la TV a `<dominio-nuevo>/granja-elancla` cuando el usuario pase por el local.
- Sacar `precios-el-ancla.vercel.app` de Domains.
- Configurar el desplegable de la columna `plantilla` en la planilla de El Ancla (opcional: hoy todo cae a `clasico`).

---

## Auto-revisión del plan contra el spec

- **§3 rutas**: Tarea 9 (todas las rutas, `/` renderiza, 404).
- **§4 registro**: Tarea 4 (tipo, El Ancla, registro, test), Tarea 3 (env).
- **§5 catálogo**: Tarea 1 (ids), Tarea 7 (componentes + catálogo), Tarea 8 (selección en `PantallaRotativa`).
- **§6 columna plantilla**: Tarea 6.
- **§7 Cloudinary**: Tarea 2 (URLs), Tarea 7-8 (`<img>` + `crossOrigin`), Tarea 5 y 9 (borrado del pipeline y PNGs), Tarea 0 (subida).
- **§8 SW**: Tarea 10.
- **§9 manifest**: Tarea 9 paso 10-11.
- **§10 cutover**: Tarea 14.
- **§11 alta**: Tarea 13 (README).
- **§12 tests/validación**: Tareas 1-4 (tests), Tarea 12 (manual).
- **§13 docs**: Tarea 13.

Consistencia de nombres verificada: `getTenantOr404` / `getDefaultTenantOr404` / `TenantParams` (Tarea 9, usados en 9), `urlOferta` / `urlLogo` / `urlIcono` (Tarea 2, usados en 7, 8, 9), `PLANTILLAS_CARTEL` / `normalizarPlantilla` (Tarea 1, usados en 4, 6, 7), `csvUrlDe` / `envKeyCsv` (Tarea 3, usados en 6), `CATALOGO_CARTELES` / `CartelProps` (Tarea 7, usados en 8), `tenant.defaults.whatsapp` etc. (Tarea 4, usados en 8, 9), `Oferta.plantilla` (Tarea 6, usado en 8).
