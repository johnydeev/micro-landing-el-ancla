# `npm run alta` — alta de cliente desde un solo lugar — Spec

**Estado:** aprobado en conversación, en implementación (sesión 21, 2026-09-20).
**Pedido original:** "hay muchos pasos a seguir, necesito algo más simple y
automatizable desde un lugar […] que solo se cargue la URL completa sin tener
que sacar el GID".

---

## 1. Problema

Con el multitenant (spec `2026-09-20-multitenant-cloudinary-design.md`) el alta
de un cliente son 6 pasos en 4 lugares: planilla (con copiar gids a mano),
archivo `tenants/<slug>.ts`, logo a Cloudinary, env en Vercel, commit, URL. Es
propenso a error (gids, nombres de env, public_id del logo) y lento.

## 2. Decisión

Un comando interactivo en el repo, **`npm run alta`**, que pide los datos una
sola vez y hace todo lo automatizable. Lo único manual que queda: crear la
planilla del cliente (copia de una planilla modelo) y publicarla en la web.

Flujo del usuario:

1. Abre el link "hacer una copia" de la planilla modelo, carga datos, Publicar
   en la web → copia la URL.
2. `npm run alta`, contesta las preguntas.
3. Commit + push.

## 3. Qué pregunta

| Pregunta | Default | Validación |
|---|---|---|
| Nombre del comercio | — | no vacío |
| Slug | derivado del nombre (`slugificar`) | `^[a-z0-9]+(-[a-z0-9]+)*$`, no existente en `tenants/` (salvo `--force`) |
| Eslogan | `''` | — |
| Color primario | — | hex `#rrggbb` |
| Color secundario | — | hex `#rrggbb` |
| Badge de oferta | `OFERTA` | no vacío |
| WhatsApp | — | — |
| Instagram | — | se normaliza a `@usuario` |
| Horarios | — | — |
| URL publicada del CSV | — | debe contener `/pub` y `docs.google.com` |
| Ruta del logo | — | archivo existente (png/jpg/webp); vacío = saltar subida |

Paleta derivada de primario + secundario:
`fondo=#FFFFFF`, `textoPrimario=secundario`, `textoSecundario=#6b7280`,
`filaImpar=` tinte del primario (mezcla 92% blanco / 8% primario).
`tipografia={tabla:230, footer:135}`, `plantillaCartelDefault='clasico'`,
`segundosCartel=3`, `segundosTabla=3`, `sinDatos='Estamos actualizando la lista de precios.'`.
Todo editable después en el `.ts` generado.

## 4. Qué hace

1. **GIDs desde la URL**: transforma `…/pub?output=csv` en `…/pubhtml`, la
   descarga y parsea los `items.push({name: "…", pageUrl: "…gid=N"})` que
   Google incluye. Busca por nombre normalizado (sin acentos, minúsculas):
   ofertas = pestaña que contiene `oferta`; config = la que contiene `config`.
   Si falta alguna: error con la lista de pestañas encontradas.
2. **Logo a Cloudinary** como `logos/<slug>`: upload firmado a
   `https://api.cloudinary.com/v1_1/<cloud>/image/upload` (multipart;
   `signature = sha1("overwrite=true&public_id=logos/<slug>&timestamp=<t>" + api_secret)`).
   Sin SDK. Verifica después con un `HEAD` a la URL de entrega.
3. **Archivo del tenant**: escribe `tenants/<slug>.ts` (misma forma que
   `granja-elancla.ts`) y agrega `'<slug>': <camelCase>,` al registro en
   `tenants/index.ts` (import + entrada, en orden alfabético).
4. **Env en Vercel**: `POST /v10/projects/<VERCEL_PROJECT_ID>/env?upsert=true`
   con `{ key: TENANT_<SLUG>_CSV_URL, value: <url>, type: 'encrypted',
   target: ['production','preview','development'] }`. Header
   `Authorization: Bearer <VERCEL_TOKEN>`. `teamId` si está configurado.
   También escribe la variable en `.env.local` para que el dev local la tenga.
5. **`npm test`** al final. Imprime la URL de la TV y "listo para commitear".

Cada paso remoto es idempotente (overwrite / upsert): correr dos veces con el
mismo slug + `--force` no rompe nada.

Flags: `--force` (sobreescribir tenant existente), `--sin-logo`,
`--sin-vercel` (solo escribe archivos; útil sin token).

## 5. Secretos y configuración (solo en `.env.local`, nunca en el repo)

```
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
VERCEL_TOKEN=
VERCEL_PROJECT_ID=        # o el nombre del proyecto
VERCEL_TEAM_ID=           # opcional
```

`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` ya existe. El script corre con
`node --env-file=.env.local` (Node ≥ 20.6), sin dotenv.

## 6. Estructura

```
lib/alta.ts           helpers puros, testeados: pubhtmlUrl, parsearPestanas,
                      elegirGids, slugificar, derivarPaleta, camelCase,
                      generarTenantTs, insertarEnRegistro, firmaCloudinary
lib/alta.test.ts
scripts/alta.ts       CLI: prompts (node:readline/promises), fetch, fs.
package.json          "alta": "node --env-file=.env.local scripts/alta.ts"
```

`scripts/alta.ts` corre con type stripping; imports relativos con `.ts`.
`lib/alta.ts` no importa nada de Next ni de React.

## 7. Tests (`lib/alta.test.ts`)

- `parsearPestanas`: HTML real reducido de `/pubhtml` → `[{nombre, gid}]`.
- `elegirGids`: encuentra "Ofertas"/"Configuracion" con acentos y mayúsculas;
  falla con mensaje si falta.
- `pubhtmlUrl`: `…/pub?output=csv` → `…/pubhtml`; rechaza URLs que no son de
  Google.
- `slugificar`: "Carnicería López" → `carniceria-lopez`.
- `derivarPaleta`: primario/secundario → 6 colores, `filaImpar` correcto.
- `generarTenantTs`: produce un módulo que, evaluado, tiene el slug y la paleta
  esperados (se compara el string generado contra un snapshot inline).
- `insertarEnRegistro`: agrega import y entrada en orden; idempotente.
- `firmaCloudinary`: sha1 conocido para params fijos.

## 8. Fuera de alcance

- Duplicar y publicar la planilla (Drive API + OAuth).
- Configurar los desplegables de la planilla (van en la planilla modelo).
- Commit/push (los hace el usuario).
- Dar de baja un cliente (borrar archivo + env a mano; raro).
