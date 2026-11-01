# Alta express — guía técnica y operativa

Implementado el 22/10/2026. Reemplaza el trabajo manual de copiar la planilla
modelo, escribir la configuración, subir el logo y crear el tenant/env/fila de
Supabase. El commit + push y la activación de las teles siguen siendo manuales.

Este documento consolida el alcance, las decisiones y el estado real de la
feature. No existía un spec/plan formal previo para `alta-express`; se
documenta acá para que quede trazable.

---

## 1. Qué automatiza

| Paso | Qué hace | Dónde |
|---|---|---|
| Copia de planilla | Copia la planilla modelo con Drive API | `lib/google.ts` → `copiarPlanilla` |
| Permisos | Comparte la copia como “cualquiera con el link” (lector) | `compartirLecturaPublica` |
| Configuración | Escribe valores en la pestaña `Configuracion` | `lib/alta-express.ts` → `armarEscriturasConfig` |
| Gids | Resuelve ofertas/config y elige la pestaña de listas | `elegirGids`, `elegirGidListas` |
| CSV | Arma la URL `/export?format=csv&gid=` y valida encabezados | `urlExportCsv`, `leerListas`, `leerOfertas` |
| Logo | Sube a Cloudinary como `logos/<slug>` | `lib/logo-cloudinary.ts` |
| Tenant | Escribe `tenants/<slug>.ts` y lo registra | `generarTenantTs`, `insertarEnRegistro` |
| Env | Crea/actualiza `TENANT_<SLUG>_CSV_URL` en `.env.local` y Vercel | `upsertEnv`, API de Vercel |
| Supabase | Crea la fila en `comercios` con `requiere_activacion = true` | `pedidoComercio` |
| Tests | Corre `npm test` al final | `scripts/alta-express.mts` |

### Lo que NO automatiza

- **Commit + push**: el push redeploya para todos los comercios.
- **Activar teles**: se hace desde `/admin`.
- **Verificar slugs de imagen en Cloudinary**: sigue siendo el paso 2 del
  manual. Un slug inexistente muestra el placeholder; no rompe la pantalla.
- **Reautorizar `IMPORTRANGE`**: la copia hereda la fórmula, pero Google puede
  pedir “Permitir acceso” la primera vez que se abre `_catalogo`.
- **Crear la carpeta en Drive**: la copia queda en la raíz del Drive del dueño
  del refresh token.

---

## 2. Requisitos (una sola vez)

1. En Google Cloud, habilitar **Drive API** y **Sheets API**.
2. Crear un **ID de cliente OAuth** de tipo **App de escritorio**.
3. Cargar en `.env.local`:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REFRESH_TOKEN=      # lo genera npm run google-auth
GOOGLE_TEMPLATE_SHEET_ID=        # opcional si va en el JSON
```

4. Correr:

```bash
npm run google-auth
```

Abre el navegador, autoriza Drive + Sheets y guarda el refresh token en
`.env.local`. El servidor local escucha en `127.0.0.1:53682`; se puede cambiar
con `GOOGLE_OAUTH_PORT`.

> **Modo Testing:** si la app de OAuth queda en “Testing”, Google vence el
> refresh token a los 7 días. En ese caso se vuelve a correr `npm run
> google-auth`.

También hacen falta los secretos que ya usaba `npm run alta`:
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `VERCEL_TOKEN`,
`VERCEL_PROJECT_ID` y, para Supabase, `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`.

---

## 3. Uso

```bash
cp scripts/cliente.ejemplo.json cliente.json
# editar cliente.json
npm run alta-express -- cliente.json
```

Flags:

| Flag | Efecto |
|---|---|
| `--force` | Sobreescribe `tenants/<slug>.ts` si ya existe |
| `--sin-logo` | No sube logo (aunque el JSON lo tenga) |
| `--sin-vercel` | No crea la env en Vercel; sí escribe `.env.local` |
| `--sin-supabase` | No crea la fila en `comercios` |

`URL_PUBLICA` es opcional y solo cambia los links que imprime el script.

### JSON de entrada

Ejemplo completo en `scripts/cliente.ejemplo.json`.

```json
{
  "nombre": "Carnicería López",
  "slug": "carniceria-lopez",
  "eslogan": "Desde 1990",
  "colores": { "primario": "#B91C1C", "secundario": "#1F2937" },
  "badgeOferta": "SUPER OFERTA",
  "contacto": {
    "whatsapp": "11 2222 3333",
    "instagram": "@carniceria_lopez",
    "horarios": "LUN a SAB: 8 a 13 y 16 a 20"
  },
  "logo": "./logo-lopez.png",
  "planilla": {
    "templateId": "ID_DE_LA_PLANILLA_MODELO",
    "titulo": "Precios Carnicería López",
    "config": {
      "horarios": "LUN a SAB: 8 a 13 y 16 a 20",
      "whatsapp": "11 2222 3333",
      "instagram": "@carniceria_lopez",
      "segundosCartel": 4,
      "segundosTabla": 5
    }
  }
}
```

Reglas de validación:

- `nombre` obligatorio.
- `slug` opcional; si falta se deriva del nombre. Solo minúsculas, números y
  guiones. No puede empezar con `api`, `admin` ni `activar`.
- `colores.primario` y `colores.secundario` obligatorios, formato `#rrggbb`.
- `planilla.templateId` o `planilla.sheetId` obligatorio (uno de los dos).
- `planilla.config` solo acepta claves conocidas de `Configuracion`
  (`horarios`, `whatsapp`, `instagram`, `segundosCartel`, `segundosTabla`,
  `atenuarDesde`, `atenuarHasta` y sus alias).
- Los textos se recortan; se tolera BOM al inicio del JSON.

### Planilla existente

Si el JSON trae `planilla.sheetId`, el script **no copia**, **no cambia
permisos** y **no escribe la configuración** por defecto. Cada cosa se pide
explícita:

```json
"planilla": {
  "sheetId": "ID_DE_LA_PLANILLA",
  "compartir": true,
  "escribirConfig": true
}
```

Las copias nuevas se comparten y reciben la configuración siempre. Una planilla
existente puede estar en uso: escribir su configuración pisa lo que ven sus
teles.

---

## 4. Flujo interno

1. Lee y valida el JSON. Limpia BOM.
2. Deriva/valida el slug. Rechaza slugs reservados.
3. Verifica que no exista `tenants/<slug>.ts` salvo `--force`.
4. Preflight: logo, credenciales de Cloudinary, Vercel (token probado contra
   la API, no solo presente) y Google **antes** de
   copiar la planilla, para no dejar copias huérfanas por un secreto faltante.
5. Pide un access token con el refresh token.
6. Copia la planilla modelo o usa `sheetId`.
7. Comparte por link si es copia nueva o si `planilla.compartir === true`.
8. Lee las pestañas y resuelve:
   - `gidOfertas`: pestaña cuyo nombre contiene “oferta”.
   - `gidConfig`: pestaña cuyo nombre contiene “config”.
   - `gidListas`: primera pestaña que no sea ofertas/config, no empiece con
     `_` y no contenga “catalogo”; prioriza nombres con “tabla”, después
     “precio”.
9. Escribe la configuración (copia nueva, o `sheetId` con
   `escribirConfig: true`):
   - lee `Configuracion!A1:B200`;
   - busca la fila de cada clave normalizada;
   - escribe solo la columna B con `valueInputOption: RAW`;
   - las claves sin fila se avisan, no se inventan.
10. Arma la URL del CSV de listas y valida:
    - listas: encabezados de productos;
    - ofertas: encabezados de ofertas;
    - configuración: que el CSV responda.
    Reintenta 8 veces cada 2 segundos para dar tiempo a la propagación de
    Google. Si Google devuelve HTML (la página de login de una planilla no
    compartida) no lo toma como CSV y lo dice en el error.
11. Sube el logo a Cloudinary (`logos/<slug>`, overwrite).
12. Crea la env en Vercel (production, preview, development). Va antes de
    los archivos: si Vercel falla, el repo queda sin tocar.
13. Escribe `tenants/<slug>.ts`, lo registra en `tenants/index.ts` y
    actualiza `.env.local`.
14. Crea la fila en `comercios` con `requiere_activacion = true`. Si ya existe,
    `ignore-duplicates` no la pisa.
15. Corre `npm test`.
16. Imprime planilla, CSV, archivos, URL de TV y API. Recuerda commit/push y
    activación manual.

---

## 5. Decisiones y por qué

### OAuth con refresh token, no service account

Una service account no tiene cuota de Drive para ser dueña de la copia
(“Service Accounts do not have storage quota”). Con el refresh token del dueño,
la copia queda en su Drive y no hay problema de cuota.

### `/export?format=csv&gid=`, no “Publicar en la web”

La copia se comparte como “cualquiera con el link” y el CSV se lee con
`/export`. Evita el paso de publicar cada pestaña y funciona con el mismo
permiso de lectura.

### Permisos de una planilla existente: opt-in

Cambiar permisos de una planilla ajena es destructivo. Por eso `sheetId` no
toca permisos salvo `compartir: true`. Las copias nuevas sí se comparten
siempre, porque las crea el script y las necesita el CSV.

### Pestaña de listas por nombre, no por orden

El orden de las pestañas no es contrato: el cliente puede moverlas. Se elige
por nombre y se validan los encabezados del CSV. Si la elección falla, el
script corta antes de escribir archivos.

### `RAW` al escribir configuración

`USER_ENTERED` podía interpretar fórmulas, fechas o números. `RAW` escribe el
texto exacto; los parsers de la app ya aceptan números como strings.

### Slugs reservados

El matcher de `proxy.ts` excluye `/api*`, `/admin*` y `/activar*`. Un tenant
con esos prefijos no renueva la cookie de la tele (vence a los 400 días). Se
rechazan en `npm run alta` y en `alta-express`.

### `requiere_activacion = true` e `ignore-duplicates`

Todo cliente nuevo nace pidiendo activación de sus teles. Si la fila ya existe,
no se pisan `pagado_hasta` ni `dado_de_baja`. Es el mismo criterio que usaba
`npm run alta`.

### Sin dependencias nuevas

Drive/Sheets se llaman por REST con `fetch`. No se agregó `googleapis` (~50 MB)
ni un SDK de OAuth.

---

## 6. Archivos

### Nuevos

- `lib/google.ts`: OAuth, token refresh y wrappers REST de Drive/Sheets.
- `lib/google.test.ts`: test de la URL de consentimiento.
- `lib/alta-express.ts`: validación del JSON, URL de CSV, elección de pestaña y
  mapeo de configuración.
- `lib/alta-express.test.ts`: tests de esos helpers.
- `lib/logo-cloudinary.ts`: subida de logo compartida con `npm run alta`.
- `lib/alta-io.ts`: env de Vercel, archivos del tenant, fila de Supabase y
  `existe()`, compartidos con `npm run alta` y `google-auth`.
- `lib/alta-io.test.ts`: test de `urlVercel`.
- `scripts/alta-express.mts`: orquestación del alta.
- `scripts/google-auth.mts`: flujo OAuth local de una sola vez.
- `scripts/cliente.ejemplo.json`: JSON de ejemplo.
- `docs/alta-express.md`: este documento.

### Modificados

- `lib/alta.ts`: `slugReservado`.
- `lib/alta.test.ts`: tests de `slugReservado`.
- `lib/planilla.ts`: exporta `normalizarClave`.
- `scripts/alta.mts`: usa `subirLogoCloudinary` y valida slugs reservados.
- `package.json`: scripts `alta-express` y `google-auth`.
- `.env.local.example`: variables de OAuth y template.
- `README.md`: sección de alta express y variables.
- `docs/manual-nuevo-cliente.md`: atajo y aclaración de pasos.
- `CHANGELOG.md`: entrada de la feature.
- `docs/progreso.md` y `docs/decisiones.md`: registro de la sesión.

---

## 7. Verificación

Ejecutado el 22/10/2026 y de nuevo el 31/10/2026 tras la revisión:

| Comando | Resultado |
|---|---|
| `npm test` | 145 tests, 0 fallos |
| `npx tsc --noEmit` | OK |
| `npm run lint` | OK |
| `npm run build` | OK (Next 16.2.6) |
| `npm run alta-express` sin args | Usage limpio, exit 1 |
| `npm run google-auth` sin credenciales | Error limpio, exit 1 |
| `alta-express` con `VERCEL_TOKEN` inválido | Corta en el preflight (403), exit 1, sin escribir nada |

Tests agregados:

- validación del JSON y `compartir` / `escribirConfig` booleanos;
- detección de HTML (página de login) en vez de CSV;
- error claro sin pestaña de listas;
- `urlVercel` con y sin `teamId`;
- URL de export CSV;
- elección de pestaña de listas;
- mapeo de configuración por alias y filas;
- `slugReservado`;
- URL de consentimiento OAuth.

### Lo que no está probado

No hay prueba end-to-end contra Google real todavía. Falta:

1. Crear el cliente OAuth.
2. Correr `npm run google-auth`.
3. Hacer un alta de prueba con una planilla modelo real.

Ese es el único paso pendiente para declarar la feature probada de punta a
punta.

---

## 8. Riesgos y límites conocidos

- **Refresh token en Testing vence a los 7 días.** Documentado; se reautoriza.
- **Scope `drive` amplio.** Necesario para copiar una planilla existente; es un
  scope restringido de Google. Revisar si se publica la app.
- **`IMPORTRANGE` puede pedir permiso** en la copia. Es manual y está
  documentado en README/manual.
- **Copia huérfana si falla un paso posterior.** Recuperación: reusar
  `sheetId` o correr con `--force`; la copia vieja se borra a mano.
- **Sin retries/backoff en Google API.** Un 429/5xx transitorio de la API
  de Drive/Sheets aborta el alta (el CSV sí reintenta).
- **Configuración validada por clave, no por valor.** Un `segundosCartel`
  negativo se escribe; el parser lo acepta y la UI puede comportarse raro.
- **Supabase no es bloqueante.** Si falla, el script avisa y la fila queda
  pendiente manual.
- **Slug reutilizado.** `ignore-duplicates` no resetea una fila vieja con
  `requiere_activacion = false`.
- **La planilla copiada queda pública por link.** Es intencional: el CSV se lee
  sin auth. No subir datos que no deban ser públicos.
- **La copia queda en la raíz del Drive** del dueño del refresh token, no en
  una carpeta del cliente.
- **No se verifican los slugs de imagen de Cloudinary.** Sigue siendo el paso 2
  del manual.

---

## 9. Recuperación rápida

| Síntoma | Qué hacer |
|---|---|
| “Faltan credenciales de Google” | Cargar `GOOGLE_OAUTH_*` y correr `npm run google-auth` |
| Refresh token vencido | Volver a correr `npm run google-auth` |
| “No pude cambiar los permisos” | Compartir la planilla a mano como “Cualquiera con el link” |
| CSV 404/401 o “página de login” | Revisar que la copia esté compartida; si es `sheetId`, usar `compartir: true` |
| `IMPORTRANGE` sin datos | Abrir `_catalogo` y dar “Permitir acceso” |
| Supabase falló | Cargar la fila en `comercios` con `requiere_activacion = true` |
| Vercel falló | No se escribió nada en el repo. Reintentar con el `sheetId` que imprime el error (no copia de nuevo) |
| Alta a medias | Reusar `planilla.sheetId` para no copiar de nuevo; `--force` para el tenant |

---

## 10. Referencias

- `README.md` → “Alta de un cliente” y “Atajo: `npm run alta-express`”.
- `docs/manual-nuevo-cliente.md` → orden completo de un alta real.
- `CHANGELOG.md` → entrada “Alta express — 2026-10-22”.
- `docs/decisiones.md` → “Sesión 28 — Alta express”.
- `scripts/cliente.ejemplo.json` → JSON de ejemplo.
