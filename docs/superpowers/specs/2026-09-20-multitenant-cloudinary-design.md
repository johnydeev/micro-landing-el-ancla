# Multitenant por path + imágenes en Cloudinary — Spec

**Estado:** aprobado e implementado (sesión 21, 2026-09-20). Pendiente el
cutover (Tarea 14 del plan).

> **Desviación durante la implementación:** `app/loading.tsx` (raíz) no existe.
> Con él, un slug desconocido respondía 200 en vez de 404 porque el boundary de
> Suspense hace que la respuesta empiece a streamear antes del `notFound()` del
> layout. Verificado experimentalmente. `app/[tenant]/loading.tsx` sí existe.
> Ver CHANGELOG sesión 21.
**Fecha:** 2026-09-20
**Pedido original:** "necesito que esto sea multitenant".

---

## 1. Qué se construye

Un solo deploy de Vercel sirve N comercios. Cada comercio tiene su URL por
path, su paleta, sus textos, su planilla de Google Sheets y elige, por oferta,
qué diseño de cartel usar. Las imágenes de producto viven en Cloudinary en un
catálogo con nomenclatura universal compartido por todos los clientes.

El alta de un cliente es: un archivo en el repo, una variable de entorno en
Vercel, subir el logo a Cloudinary, configurar dos desplegables en su planilla.

## 2. Decisiones cerradas

| # | Decisión | Elegido | Descartado |
|---|---|---|---|
| 1 | Alcance | Un deploy, N tenants. Sin auth, sin DB, sin panel. | SaaS self-serve (pausado 30/07); un deploy por cliente. |
| 2 | Diseño por cliente | Catálogo de plantillas + paleta por cliente. | Diseño a medida por cliente. |
| 3 | Identificación | Path: `<dominio>/<slug>`. | Subdominio (requiere dominio propio; migrable después). |
| 4 | Registro | `tenants/<slug>.ts` tipado, en el repo. URLs de CSV en env de Vercel. | Planilla maestra; DB. URLs de CSV en el repo (repo público). |
| 5 | Catálogo inicial | Solo los 2 diseños actuales (`tabla clásica`, `cartel clásico`). | Diseñar plantillas nuevas en este proyecto. |
| 6 | Más de una plantilla | Tabla: un diseño. Cartel: columna `plantilla` en la planilla, desplegable, por oferta. Vacío = default del tenant. | Rotación automática de diseños; campo "plantillas habilitadas" por tenant. |
| 7 | Rubro | Genérico (carnicería, almacén, verdulería). Textos de la UI vienen del tenant. | — |
| 8 | Imágenes | Todas en Cloudinary (catálogo universal + logos + íconos PWA). Pipeline de `sharp`, hook y workflow **se eliminan**. | Logos en el repo con pipeline solo para ellos. |
| 9 | Migración de slugs de imagen | Subir las imágenes de El Ancla a Cloudinary **con los nombres que ya usa su planilla**. Renombrar al catálogo universal después, de a uno. | Renombrar planilla + imágenes el mismo día. |
| 10 | Dominio | Nuevo `.vercel.app` genérico. El viejo `precios-el-ancla.vercel.app` se mantiene y `/` **renderiza** el tenant por defecto (sin redirect: un 307 no es cacheable por el SW y dejaría a la TV sin fallback offline). Redirect = limpieza futura, tras cambiar la URL en la TV. | Redirect 307 en `/`. |
| 11 | Ventana de deploy | Push solo fuera del horario de atención (hoy: después de las 13hs). | — |

## 3. Rutas

```
app/
  page.tsx                         "/" renderiza el tenant DEFAULT_TENANT (misma page que [tenant], slug fijo)
  layout.tsx                       root: fuente, reset CSS, favicon genérico. Sin manifest.
  icon.png                         favicon genérico (se mantiene)
  [tenant]/
    layout.tsx                     resuelve el tenant (404 si no existe), metadata.manifest
    page.tsx                       pantalla principal
    loading.tsx                    genérico ("Cargando…", sin branding: loading.tsx no recibe params).
                                   SOLO acá, no en app/ (ver desviación arriba).
    error.tsx                      client; lee el slug con useParams() y busca el tenant en el registro
    vistaCartel/page.tsx           rutas de dev (?index=N)
    vistaLista/page.tsx
    manifest.webmanifest/route.ts  manifest por tenant
  api/[tenant]/
    productos/route.ts
    ofertas/route.ts
    config/route.ts
```

- `DEFAULT_TENANT` es una variable de entorno (`granja-elancla`). Si falta, `/`
  devuelve 404. `/` **no redirige**: renderiza ese tenant. Motivo: el Service
  Worker solo cachea respuestas `ok`; un 307 no lo es, y la TV de El Ancla —que
  hoy apunta a `/`— perdería el fallback offline hasta que se le cambie la URL.
  Cuando eso pase, `/` puede volverse redirect.
- Slug desconocido en `[tenant]` → `notFound()`. Se resuelve en `layout.tsx`
  una sola vez; las páginas y rutas hijas reciben el tenant ya validado por un
  helper `getTenantOr404(params)`.
- Las páginas siguen siendo `force-dynamic` (sesión 19).
- `app/manifest.json` global se elimina.

## 4. Registro de tenants

```
tenants/
  index.ts             export const TENANTS: Record<string, Tenant>; getTenant(slug)
  granja-elancla.ts
types/tenant.ts        export interface Tenant
```

```ts
export interface Tenant {
  slug: string                      // igual a la clave del registro (test lo verifica)
  nombre: string
  eslogan: string
  logo: string                      // public_id en Cloudinary, ej. "logos/granja-elancla"
  textos: {
    badgeOferta: string             // "SUPER OFERTA"
    sinDatos: string                // texto del empty state
  }
  paleta: {
    primario: string; secundario: string; fondo: string
    textoPrimario: string; textoSecundario: string; filaImpar: string
  }
  tipografia: { tabla: number; footer: number }   // escala %, como hoy
  plantillaCartelDefault: PlantillaCartelId       // de lib/plantillas.ts
  sheets: { gidOfertas: string; gidConfig: string }
  defaults: {                       // fallback si la pestaña CONFIG no trae la clave
    segundosCartel: number; segundosTabla: number
    horarios: string; whatsapp: string; instagram: string
  }
}
```

- `telefono` de `config/negocio.ts` desaparece: el código hacía
  `whatsapp ?? telefono` con el mismo valor. Footer y empty state usan
  `whatsapp`.

```ts
```

- La URL del CSV **no** está en el archivo. Se lee de
  `TENANT_<SLUG_MAYUSCULAS_CON_GUION_BAJO>_CSV_URL`
  (`granja-elancla` → `TENANT_GRANJA_ELANCLA_CSV_URL`). Helper `envKeyCsv(slug)`,
  testeado. Sin variable → los lectores devuelven `[]` y loguean, como hoy.
- `config/negocio.ts` desaparece; su contenido se convierte en
  `tenants/granja-elancla.ts`.
- `Header`, `Footer`, `PantallaRotativa`, `error.tsx` dejan de importar
  `negocioConfig` y reciben el tenant por props (o lo resuelven de `useParams`
  en `error.tsx`).

## 5. Catálogo de plantillas

```
lib/plantillas.ts      PLANTILLAS_CARTEL = ['clasico'] as const
                       type PlantillaCartelId = (typeof PLANTILLAS_CARTEL)[number]
                       normalizarPlantilla(raw): PlantillaCartelId | undefined
                       (sin React ni server-only: testeable con node --test)
templates/
  index.ts             CATALOGO_CARTELES: Record<PlantillaCartelId, ComponentType<CartelProps>>
  tabla/Clasica.tsx    extraído de PantallaRotativa (único diseño de tabla)
  cartel/Clasico.tsx   extraído de PantallaRotativa (hoy CartelOferta)
```

Los ids viven en `lib/`, no en `templates/`: `templates/index.ts` importa
componentes `.tsx`, y `node --test` no compila JSX — un test que lo importara
fallaría. Con los ids en `lib/plantillas.ts`, `lib/sheets.ts` y los tests los
usan sin tocar React.

**Contrato `CartelProps`:** `{ oferta: Oferta; textos: Tenant['textos'] }`.
Una plantilla nunca tiene colores fijos: usa las CSS variables (`--c-primario`,
`--c-secundario`, `--c-fondo`, `--c-texto-primario`, `--c-texto-secundario`,
`--c-fila-impar`) que `PantallaRotativa` inyecta en `.screen` desde
`tenant.paleta`. Misma plantilla + otra paleta = otro cliente.

**Agregar una plantilla** = componente nuevo + entrada en `CATALOGO_CARTELES` +
literal en `PLANTILLAS_CARTEL`. Faltar cualquiera de los tres no compila
(`Record<PlantillaCartelId, …>` exige una entrada por id).

**`PantallaRotativa`** recibe `tenant` y renderiza `<TablaClasica>` en modo
tabla y `CATALOGO_CARTELES[oferta.plantilla ?? tenant.plantillaCartelDefault]`
en modo cartel. Rotación, reload de 30 min, heartbeat al SW, `DimOverlay`,
`HealthIndicator`: sin cambios.

## 6. Columna `plantilla` en la planilla de ofertas

- `Oferta.plantilla?: PlantillaCartelId` (nuevo campo, opcional).
- Header aceptado (mismo mecanismo que `tamaño`/`descripcion`, posición libre):
  `plantilla`, `diseño`, `diseno`, `template`.
- Normalización `normalizarPlantilla(raw)`: trim, minúsculas, sin acentos,
  espacios → guiones. `"Clásico"` → `"clasico"`. Resultado que no está en el
  catálogo → `undefined` + `console.warn` en dev (mismo patrón que el slug de
  imagen). Vacío → `undefined`.
- Sin columna → todas `undefined` → default del tenant. Retrocompatible.
- El desplegable es validación de datos de Google Sheets, configurado a mano
  en el alta. Valores = ids del catálogo.

## 7. Imágenes: Cloudinary

**Helper `urlImagen(publicId, opciones)`** en `lib/cloudinary.ts` (sin
`server-only`, para poder testearlo):

```
https://res.cloudinary.com/<NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME>/image/upload/<transformaciones>/<publicId>
```

| Uso | publicId | Transformaciones |
|---|---|---|
| Oferta | `${NEXT_PUBLIC_CLOUDINARY_CATALOGO}/${oferta.imagen}` | `f_auto,q_auto,w_1200,d_placeholder.png` |
| Logo (header) | `tenant.logo` | `f_auto,q_auto,w_400` |
| Ícono PWA 192 | `tenant.logo` | `f_png,w_192,h_192,c_pad,b_white` |
| Ícono PWA 512 | `tenant.logo` | `f_png,w_512,h_512,c_pad,b_white` |

- Env globales: `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`,
  `NEXT_PUBLIC_CLOUDINARY_CATALOGO` (carpeta base, ej. `catalogo`). Prefijo
  `NEXT_PUBLIC_` porque las URLs se arman en componentes que también renderizan
  en el cliente. No son secretos: las URLs resultantes son públicas de todos
  modos.
- `d_placeholder.png`: imagen por defecto si el public_id no existe. Hay que
  subir `placeholder.png` a la raíz del cloud una sola vez.
- `<img>` de ofertas y logo llevan `crossorigin="anonymous"` para que la
  respuesta sea CORS (no opaca) y el Service Worker la pueda cachear sin el
  padding de cuota de las respuestas opacas.
- El cliente sigue escribiendo solo el slug (`asado-de-tira`) en su planilla.
  El catálogo maestro en Sheets y el `IMPORTRANGE` que alimenta el desplegable
  de la columna `imagen` son configuración de Sheets, no código: la app no lee
  el catálogo maestro.

**Se elimina:** `public/ofertas/`, `public/logo.png`, `public/icons/`,
`scripts/optimize-images.mjs` y su test, `.githooks/`,
`.github/workflows/optimize-images.yml`, los scripts `prepare`/`prebuild`/
`optimize:images` de `package.json`, la devDependency `sharp`.

## 8. Service Worker

- `CACHE_VERSION` → `v7`.
- El filtro same-origin pasa a una lista de orígenes cacheables:
  `[self.location.origin, 'https://res.cloudinary.com']`. Resto de la lógica
  (network-first, fallback a cache, watchdog) intacta.
- El fallback de navegación offline a `'/'` se mantiene: `/` sigue siendo HTML
  (renderiza el tenant por defecto), así que sigue siendo un último recurso
  válido para la TV que todavía apunta ahí.

## 9. Manifest por tenant

`app/[tenant]/manifest.webmanifest/route.ts` devuelve:

```json
{
  "name": "<tenant.nombre>", "short_name": "<tenant.nombre>",
  "start_url": "/<slug>", "scope": "/<slug>",
  "display": "fullscreen", "orientation": "landscape",
  "theme_color": "<paleta.primario>", "background_color": "<paleta.fondo>",
  "icons": [ {192 desde Cloudinary}, {512 desde Cloudinary} ]
}
```

`app/[tenant]/layout.tsx` exporta `generateMetadata` con
`manifest: /${slug}/manifest.webmanifest` y `generateViewport` con
`themeColor` del tenant.

## 10. Migración de El Ancla y cutover

**Antes del push (a cualquier hora, no toca producción):**
1. Subir a Cloudinary: las 22 imágenes de `public/ofertas/` con **sus nombres
   actuales** como public_id bajo `catalogo/`; `public/logo.png` como
   `logos/granja-elancla`; un `placeholder.png` en la raíz.
2. Vercel → env: `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`,
   `NEXT_PUBLIC_CLOUDINARY_CATALOGO`, `DEFAULT_TENANT=granja-elancla`,
   `TENANT_GRANJA_ELANCLA_CSV_URL` (mismo valor que `GOOGLE_SHEETS_CSV_URL`).
   Las `GOOGLE_SHEETS_*` viejas se dejan hasta después del cutover.
3. Vercel → Domains: agregar el dominio nuevo. **No** borrar
   `precios-el-ancla.vercel.app`.
4. Código completo en el working tree, validado contra `npm start` (§12).

**El push — fuera del horario de atención:**
5. Un solo commit. Deploy. La TV, en su próximo reload de 30 min, pide `/`,
   que ahora renderiza `granja-elancla` con imágenes de Cloudinary. Sin
   redirect, sin cambio de URL, sin perder el fallback offline.
6. Verificar la URL nueva desde el celular: tabla + carteles con fotos. Si algo
   falla: **Vercel → Deployments → Instant Rollback** al deploy anterior. Es la
   red de seguridad; no hace falta revertir el commit para recuperar la TV.

**Después:** borrar `GOOGLE_SHEETS_*` de Vercel; cambiar la URL de la TV a
`/granja-elancla` cuando el usuario pase por el local; sacar el dominio viejo.

## 11. Alta de un cliente nuevo (checklist para el README)

1. `tenants/<slug>.ts` + registrarlo en `tenants/index.ts`.
2. Logo a Cloudinary como `logos/<slug>`.
3. Vercel → env: `TENANT_<SLUG>_CSV_URL`.
4. Planilla del cliente: pestañas productos / ofertas / config con los headers
   esperados; desplegable en `imagen` (catálogo maestro vía `IMPORTRANGE`) y en
   `plantilla` (ids del catálogo); publicar en la web como CSV.
5. Commit + push (fuera del horario de atención del cliente si ya está en
   producción).
6. URL para la TV: `<dominio>/<slug>`.

## 12. Tests y validación

**`npm test`** = `node --test "**/*.test.ts"` (glob soportado desde Node 21;
el CI corre 22). Node ≥ 22.18 corre `.ts` sin flags. Reglas para que funcione
fuera de Next: imports **relativos** con extensión `.ts` (Node no lee el alias
`@/` de `tsconfig`), y los módulos testeados no importan `server-only`, React ni
`.tsx`.
- `lib/plantillas.test.ts`: `normalizarPlantilla` — acentos, mayúsculas,
  espacios, vacío, desconocido.
- `lib/cloudinary.test.ts`: `urlImagen` arma la URL esperada para oferta, logo e
  íconos.
- `lib/tenant-env.test.ts`: `envKeyCsv('granja-elancla') === 'TENANT_GRANJA_ELANCLA_CSV_URL'`.
- `tenants/registro.test.ts`: cada tenant tiene `slug` igual a su clave, y
  `plantillaCartelDefault` está en `PLANTILLAS_CARTEL` (de `lib/plantillas.ts`,
  no del catálogo de componentes).

**Manual contra `npm start`:**
- `/granja-elancla`: tabla y carteles con fotos desde Cloudinary.
- `/` renderiza lo mismo que `/granja-elancla`. `/no-existe` → 404.
- `/api/granja-elancla/ofertas` devuelve JSON con campo `plantilla`.
- `/granja-elancla/manifest.webmanifest` con nombre e íconos correctos.
- Con la wifi cortada tras un load: reload sirve pantalla e imágenes desde el SW.
- `npm run build` con todas las env vacías → exit 0 (lo que corre el CI).

## 13. Docs a actualizar

`CHANGELOG.md` (sesión 21), `docs/decisiones.md` (ADR: multitenant por path;
ADR: Cloudinary y por qué se borra el pipeline de imágenes de sesiones 16-20),
`docs/progreso.md` (arquitectura nueva), `docs/api.md` (paths con tenant),
`README.md` (descripción genérica, checklist de alta, variables de entorno
nuevas), `.env.local.example`.

## 14. Fuera de alcance

- Plantillas nuevas de cartel o tabla (una por una, después, con cliente real).
- Subdominios por cliente.
- Panel de administración, auth, cobranza.
- Fuentes tipográficas por cliente.
- Lectura del catálogo maestro desde la app.
- Imágenes propias por cliente fuera del catálogo universal (si aparece el
  caso: carpeta `clientes/<slug>/` en Cloudinary y un prefijo en el slug).
