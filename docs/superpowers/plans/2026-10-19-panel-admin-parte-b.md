# Panel de administración (Parte B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel `/admin` con contraseña para ver teles por cliente, avisos de pago, switch, alta de teles con código corto, cambio de rubros, baja/reactivación, más renovación automática de la cookie.

**Architecture:** Lógica pura en `lib/` (testeada con `node --test`); acceso a Supabase solo en servidor vía PostgREST (`fetch` + service role) desde módulos `server-only`; panel en Server Components bajo `app/admin` con Server Actions; alta por código vía route handler `app/api/alta` + componente cliente en la pantalla bloqueada; renovación de cookie en `proxy.ts`.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `proxy`), TypeScript, CSS modules, Supabase Postgres + PostgREST, `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-10-19-panel-admin-parte-b-design.md` (sobre Parte A: `docs/superpowers/specs/2026-10-17-activacion-supabase-parte-a-design.md`)

## Global Constraints

- Sin dependencias nuevas (no hay `lucide-react`: el spinner es CSS propio, un `<span>` girando con `@keyframes`).
- Todo botón con acción asíncrona: spinner + `disabled` mientras corre, incluidos botones de solo ícono/switch.
- Responsive: una columna en celular (≤640px), cómodo en compu.
- Ante la duda, mostrar: ninguna falla de base, código o cookie deja en negro una tele que andaba.
- Base solo desde el servidor (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); tablas nuevas con RLS sin políticas; funciones con `revoke execute … from public, anon, authenticated` + `grant … to service_role`.
- Alfabeto del código: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 6 caracteres, vence a los 15 min; se muestra como `XXX-XXX`.
- Badge: verde < 15 min, ámbar 15–60 min, rojo > 60 min o nunca, gris si `activa = false`.
- Avisos de pago: "por vencer" si faltan 0–3 días; "vencido" si la fecha pasó (con días de atraso). Fechas en hora de Argentina (`-03:00`).
- Pagó: mismo día del mes siguiente a la fecha anterior; si no existe, último día del mes.
- Sesión admin: cookie `admin`, HMAC con `ACTIVACION_SECRET` (prefijo distinto al de las teles), `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/admin'`, 30 días. Contraseña: `ADMIN_PASSWORD`, comparación en tiempo constante, 1 s de espera si falla; sin `ADMIN_PASSWORD` nadie entra.
- Piden contraseña: **Dar de baja** y **Cambiar rubros**. **Reactivar** es un clic.
- Módulos testeados: sin `@/` ni `server-only`, imports relativos con `.ts`.
- Commits y push: el usuario. Cada tarea termina "listo para commitear". Push fuera de horario.

## Review Focus

- Tele con código en pantalla que se recarga (meta refresh 10 min) antes de vencer → reutiliza el mismo código desde `localStorage`, no muestra uno nuevo (Task 4, test de `codigoGuardadoVigente`).
- Código tipeado en el panel con minúsculas, espacios o guion (`k7m 2qx`, `K7M-2QX`) → se acepta (Task 2, test `normalizarCodigo`).
- `localStorage` inaccesible en el Fire TV (excepción) → la pantalla igual muestra un código (Task 4, try/catch probado en `codigoGuardadoVigente` con storage que tira).
- Panel con Supabase caído → la vista muestra un aviso de error, no una pantalla de excepción de Next (Task 7, `listarClientes` devuelve `null` y la page muestra el aviso; verificación E2E).
- Respuesta de `estado_tele` vieja sin `dado_de_baja` (orden de deploy) → se trata como `false`, la tele se sigue mostrando (Task 3, test `parsearEstado sin dado_de_baja`).

---

### Task 1: Migración: baja, códigos de alta y funciones

**Files:**
- Create: `supabase/migrations/20261019000000_panel_parte_b.sql`

**Interfaces:**
- Produces (todas `security invoker`, solo `service_role`):
  - `estado_tele(p_comercio, p_tele, p_rubros)` → igual que Parte A + `comercio.dado_de_baja: boolean`; si `dado_de_baja` no autoregistra ni actualiza `ultima_conexion` (devuelve `tele` solo si ya existe).
  - `crear_codigo_alta(p_comercio text, p_codigo text, p_nonce_sha256 text) returns json` → borra códigos vencidos; si el comercio no existe o está de baja → `{"ok": false, "motivo": "comercio"}`; si el código ya existe → `{"ok": false, "motivo": "repetido"}`; si no inserta con `vence_en = now() + interval '15 minutes'` y devuelve `{"ok": true, "vence_en": "<iso>"}`.
  - `consultar_codigo_alta(p_codigo text, p_nonce_sha256 text) returns json` → `{"estado": "invalido"}` (no existe o nonce distinto) | `"vencido"` | `"pendiente"` | `{"estado": "activada", "tele": {"id", "comercio", "rubros"}}`.
  - `activar_codigo_alta(p_codigo text, p_tele_id text, p_rubros text[]) returns json` → `{"ok": false, "motivo": "invalido"|"vencido"|"usado"|"comercio"}` o inserta la tele (`activa = true`), completa `tele_id` y devuelve `{"ok": true, "comercio": "<slug>"}`.
- Tabla `codigos_alta` y columna `comercios.dado_de_baja` según el spec.

- [ ] **Step 1: Escribir la migración** con: `alter table comercios add column dado_de_baja boolean not null default false`; tabla `codigos_alta` (columnas del spec, FK `on delete cascade` a `comercios`); RLS habilitado; `create or replace` de `estado_tele` y las tres funciones nuevas con la lógica del bloque Interfaces; revoke/grant como en Global Constraints. `activar_codigo_alta` verifica en orden: existe → no vencido → `tele_id is null` → comercio no de baja.

- [ ] **Step 2: Aplicar** con `apply_migration` (`panel_parte_b`) en `etiuhgqersmbntyqobei`.

- [ ] **Step 3: Probar en SQL** con datos temporales (`prueba-a`) y borrarlos al final:
  - `crear_codigo_alta('prueba-a','ABC234','h1')` → `ok: true`; repetirlo → `motivo: repetido`; con comercio inexistente → `motivo: comercio`.
  - `consultar_codigo_alta('ABC234','otro')` → `invalido`; con `'h1'` → `pendiente`.
  - `activar_codigo_alta('ABC234','t3st01','{cerdo}')` → `ok: true, comercio: prueba-a`; fila en `teles` con `activa = true`; repetir → `motivo: usado`; `consultar…('ABC234','h1')` → `activada` con `tele.id = 't3st01'`.
  - `update codigos_alta set vence_en = now() - interval '1 minute'` en otro código → `consultar` da `vencido` y `activar` da `motivo: vencido`.
  - `update comercios set dado_de_baja = true`: `estado_tele('prueba-a','nueva1',null)` → `dado_de_baja: true`, `tele: null` y `teles` sin `nueva1`; `estado_tele('prueba-a','t3st01',null)` → devuelve la tele sin cambiar `ultima_conexion`; `crear_codigo_alta` → `motivo: comercio`.
  - Como `anon`: `permission denied` en las cuatro funciones; 0 filas en `codigos_alta`.

- [ ] **Step 4:** `get_advisors` (security): solo `rls_enabled_no_policy`. Listo para commitear.

---

### Task 2: Funciones puras del panel, códigos y sesión

**Files:**
- Create: `lib/panel.ts`, `lib/panel.test.ts`, `lib/codigo-alta.ts`, `lib/codigo-alta.test.ts`, `lib/admin-sesion.ts`, `lib/admin-sesion.test.ts`

**Interfaces:**
- Produces:

```ts
// lib/panel.ts
export type ColorBadge = 'verde' | 'ambar' | 'rojo' | 'gris'
export function colorBadge(tele: { activa: boolean; ultimaConexion: string | null }, ahoraMs: number): ColorBadge
export type AvisoPago = { tipo: 'vencido'; dias: number } | { tipo: 'por-vencer'; dias: number } | null
export function avisoPago(pagadoHasta: string | null, ahoraMs: number): AvisoPago
export function siguienteMes(fecha: string): string            // 'AAAA-MM-DD' → 'AAAA-MM-DD'
export function etiquetaRubros(rubros: string[] | null): string // "Todo" | "Vacuno" | "Cerdo y pollo" | "Cerdo, pollo y vacuno"

// lib/codigo-alta.ts
export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generarCodigo(bytes: Uint8Array): string       // 6 bytes → 6 caracteres
export function normalizarCodigo(input: string): string | null // mayúsculas, sin espacios ni guiones; null si no son 6 del alfabeto
export function formatearCodigo(codigo: string): string        // 'K7M2QX' → 'K7M-2QX'
export function sha256Hex(texto: string): string
export interface CodigoGuardado { codigo: string; nonce: string; venceMs: number }
export function codigoGuardadoVigente(storage: Pick<Storage, 'getItem'> | null, clave: string, ahoraMs: number): CodigoGuardado | null

// lib/admin-sesion.ts
export const COOKIE_ADMIN = 'admin'
export const SESION_ADMIN_MS = 30 * 24 * 60 * 60 * 1000
export function firmarSesion(ahoraMs: number, secreto: string): string
export function verificarSesion(valor: string | undefined, ahoraMs: number, secreto: string): boolean
export function passwordCorrecta(input: string, esperado: string | undefined): boolean
```

- [ ] **Step 1: Tests** (`AHORA = Date.parse('2026-10-20T12:00:00-03:00')`):
  - `colorBadge`: hace 5 min → `verde`; 14:59 → `verde`; 15:00 → `ambar`; 59 min → `ambar`; 61 min → `rojo`; `null` → `rojo`; `activa: false` con conexión de hace 1 min → `gris`.
  - `avisoPago`: `null` → `null`; `'2026-10-30'` → `null`; `'2026-10-23'` → `{por-vencer, 3}`; `'2026-10-20'` → `{por-vencer, 0}`; `'2026-10-19'` → `{vencido, 1}`; `'2026-10-10'` → `{vencido, 10}`.
  - `siguienteMes`: `'2026-10-10'` → `'2026-11-10'`; `'2026-12-15'` → `'2027-01-15'`; `'2026-01-31'` → `'2026-02-28'`; `'2028-01-31'` → `'2028-02-29'`; `'2026-03-31'` → `'2026-04-30'`.
  - `etiquetaRubros`: `null` → `'Todo'`; `[]` → `'Todo'`; `['vacuno']` → `'Vacuno'`; `['pollo','cerdo']` → `'Cerdo y pollo'`; `['vacuno','cerdo','pollo']` → `'Cerdo, pollo y vacuno'`.
  - `generarCodigo(new Uint8Array([0,1,2,3,4,30]))` → `'ABCDE9'` (índice `byte % 31` en `ALFABETO_CODIGO`); `generarCodigo(new Uint8Array([31,62,255,128,7,93]))` → `'AAHEHA'`; `normalizarCodigo(' k7m-2qx ')` → `'K7M2QX'`; `'K7M2Q'` → `null`; `'K7M2Q0'` (0 no está) → `null`; `formatearCodigo('K7M2QX')` → `'K7M-2QX'`; `sha256Hex('abc')` → `'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'`.
  - `codigoGuardadoVigente`: storage con `{codigo,nonce,venceMs: AHORA+60000}` → lo devuelve; con `venceMs: AHORA+10000` → `null` (margen 30 s); JSON roto → `null`; `storage` cuyo `getItem` tira → `null`; `storage null` → `null`.
  - Sesión: `verificarSesion(firmarSesion(AHORA, S), AHORA + 29d, S)` → `true`; a `AHORA + 31d` → `false`; con otro secreto → `false`; `undefined` → `false`; valor adulterado → `false`. `passwordCorrecta('x', undefined)` → `false`; `('', '')` → `false`; `('secreta', 'secreta')` → `true`; `('secret', 'secreta')` → `false`.

- [ ] **Step 2:** `node --test lib/panel.test.ts lib/codigo-alta.test.ts lib/admin-sesion.test.ts` → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar.** `avisoPago` compara fechas de calendario en Argentina (día de `ahoraMs` en `-03:00` contra `pagadoHasta`). `codigoGuardadoVigente` exige `venceMs - ahoraMs > 30_000` y envuelve todo en try/catch. Sesión: `firmarSesion` = `<expMs>.<hmac('admin|'+expMs)>`; `passwordCorrecta` compara `sha256` de ambos con `timingSafeEqual`, `false` si `esperado` vacío o undefined.

- [ ] **Step 4:** mismos tests → PASS; `npm test` verde. Listo para commitear.

---

### Task 3: Decisión con baja y sin corte por pago

**Files:**
- Modify: `lib/acceso-decision.ts`, `lib/acceso-decision.test.ts`, `components/PantallaBloqueada.tsx`, `lib/acceso.ts` (re-export)

**Interfaces:**
- Produces: `EstadoBase.comercio` = `{ requiereActivacion: boolean; pagadoHasta: string | null; dadoDeBaja: boolean } | null`; `Acceso` sin `'suspendida'`; se quitan `DIAS_GRACIA_PAGO` y su re-export. `PantallaBloqueada` recibe además `slug: string` y `conCodigo: boolean` (Task 4 lo usa).

- [ ] **Step 1: Tests nuevos/cambiados:**
  - `baja bloquea aunque tenga cookie` → `dadoDeBaja: true` + tele de cookie + fila activa → `no-habilitada`.
  - `pago vencido ya no suspende` → `pagadoHasta: '2026-01-01'` → `ok`.
  - `parsearEstado sin dado_de_baja` → `{comercio:{requiere_activacion:false,pagado_hasta:null},tele:null}` → `dadoDeBaja: false`.
  - `parsearEstado rechaza dado_de_baja no booleano` → `'si'` → `null`.
  - Borrar `pago vencido suspende` y `suspendida gana a todo`; ajustar el helper `estado()` con `dadoDeBaja: false`.

- [ ] **Step 2:** `node --test lib/acceso-decision.test.ts` → FAIL en los nuevos.

- [ ] **Step 3: Implementar** orden del spec (baja → requiere sin tele → desactivada → ok). `PantallaBloqueada`: quitar `suspendida` de `TEXTOS`; `motivo` = `'no-habilitada' | 'desactivada'`. Las 4 pages pasan `slug={tenant.slug}` y `conCodigo={!(estado de baja)}` — para eso `resolverAcceso` devuelve `{ tipo: 'no-habilitada'; conCodigo: boolean }` (`conCodigo = !dadoDeBaja`).

- [ ] **Step 4:** `npx tsc --noEmit && npm run lint && npm test` → verde. Listo para commitear.

---

### Task 4: Alta por código en la tele

**Files:**
- Create: `lib/alta-db.ts` (server-only), `app/api/alta/route.ts`, `components/CodigoAlta.tsx` (client), `components/CodigoAlta.module.css`
- Create: `lib/supabase-rest.ts` (server-only) — `rpc<T>(nombre: string, args: object): Promise<T | null>` y `rest(path: string, init?: RequestInit): Promise<Response | null>` con service role, `cache: 'no-store'`, timeout 3 s, `null` + `console.error('[supabase] …')` ante falla. Refactor: `lib/estado-tele.ts` usa `rpc` (mantiene timeout 1 s vía parámetro opcional `timeoutMs`).
- Modify: `components/PantallaBloqueada.tsx`, `public/sw.js`

**Interfaces:**
- Consumes: Task 1 (RPCs), Task 2 (`generarCodigo`, `sha256Hex`, `codigoGuardadoVigente`, `formatearCodigo`), `firmarCookie` y `COOKIE_TELE` (etapa 1, `COOKIE_MAX_AGE_S` se exporta desde `app/activar/[...partes]/route.ts` a `lib/activacion.ts`).
- Produces:
  - `POST /api/alta` body `{ slug }` → 200 `{ codigo, nonce, venceMs }` | 409 (comercio de baja o sin fila) | 503 (base caída). Genera `nonce` de 32 bytes base64url y reintenta hasta 3 veces si el código sale `repetido`.
  - `GET /api/alta?codigo=…&nonce=…` → `{ estado: 'pendiente' | 'vencido' | 'invalido' }` o, si `activada`, setea la cookie `tele` (`firmarCookie({id, tenant: comercio, rubros}, ACTIVACION_SECRET)`, `maxAge` 400 días, mismas opciones que `/activar`) y responde `{ estado: 'activada' }`. Headers `Cache-Control: no-store`.

- [ ] **Step 1:** Implementar `lib/supabase-rest.ts`, refactor de `estado-tele.ts` y `lib/alta-db.ts` (`crearCodigo(slug)`, `consultarCodigo(codigo, nonce)` llamando las RPC con `sha256Hex(nonce)`). Verificar que `node --test` sigue verde y `npx tsc --noEmit` pasa.

- [ ] **Step 2:** `app/api/alta/route.ts` con el contrato de Interfaces.

- [ ] **Step 3:** `CodigoAlta` (client): al montar, `codigoGuardadoVigente(localStorage, 'codigo-alta:<slug>', Date.now())`; si no hay, `POST /api/alta` y guarda (try/catch en el `setItem`). Muestra "Código de activación" + `formatearCodigo` grande. Cada 5 s `GET`; `vencido`/`invalido` → borra y pide otro; `activada` → `location.reload()`. Error de red o 503 → reintenta en el próximo ciclo sin borrar la pantalla. 409 → no muestra código. `PantallaBloqueada` lo renderiza debajo del texto si `motivo === 'no-habilitada' && conCodigo`.

- [ ] **Step 4:** `public/sw.js`: en el handler de `fetch`, `return` sin interceptar si `url.pathname.startsWith('/api/')`; `CACHE_VERSION` → `'micro-landing-v8'`.

- [ ] **Step 5: Verificar** local (build + `prod`), con fila temporal `comercios('demo', requiere_activacion=true)`:
  - `curl /demo` sin cookie → contiene "Pantalla no habilitada".
  - `curl -X POST /api/alta -d '{"slug":"demo"}'` → 200 con código de 6 del alfabeto; con `slug: 'granja-elancla'` → 409.
  - `GET` con nonce correcto → `pendiente`; con nonce incorrecto → `invalido`.
  - `activar_codigo_alta` por SQL → `GET` → `activada` + `Set-Cookie: tele=…`; con esa cookie `/demo` muestra precios.
  - Borrar filas de `demo`. Listo para commitear.

---

### Task 5: Renovación de la cookie en `proxy`

**Files:**
- Create: `proxy.ts` (raíz)

**Interfaces:**
- Consumes: `verificarCookie`, `COOKIE_TELE`, `COOKIE_MAX_AGE_S`.

- [ ] **Step 1:** `export function proxy(request: NextRequest)`: si la cookie `tele` verifica con `ACTIVACION_SECRET`, `NextResponse.next()` + `cookies.set(COOKIE_TELE, valor, { mismas opciones, maxAge: COOKIE_MAX_AGE_S })`; si no, `NextResponse.next()` sin tocar. `config.matcher`: `['/', '/((?!api|admin|activar|_next|.*\\..*).*)']`. Leer `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` antes.

- [ ] **Step 2: Verificar** local: con cookie válida, `curl -i /demo` → `Set-Cookie: tele=` con `Max-Age=34560000`; sin cookie → sin `Set-Cookie`; `/api/alta` y `/admin` → sin `Set-Cookie: tele`. Listo para commitear.

---

### Task 6: Login y sesión del panel

**Files:**
- Create: `lib/admin-auth.ts` (server-only), `app/admin/login/page.tsx`, `app/admin/login/actions.ts`, `app/admin/admin.module.css`, `components/BotonAccion.tsx` (client: botón con spinner + `disabled` durante la acción, usado en todo el panel)

**Interfaces:**
- Consumes: Task 2 (`firmarSesion`, `verificarSesion`, `passwordCorrecta`, `COOKIE_ADMIN`, `SESION_ADMIN_MS`).
- Produces: `exigirSesion(): Promise<void>` (redirige a `/admin/login` sin sesión válida; usado por pages y por **cada** Server Action del panel); `exigirPassword(input: string): Promise<boolean>` (1 s de espera si falla). `BotonAccion` props: `{ children, pendiente: boolean, ...ButtonHTMLAttributes }`.

- [ ] **Step 1:** Login: formulario con Server Action `entrar(formData)` → `passwordCorrecta` → cookie `admin` (opciones de Global Constraints) → `redirect('/admin')`; incorrecta → espera 1 s y devuelve error "Contraseña incorrecta". Botón con spinner.

- [ ] **Step 2: Verificar** local con `ADMIN_PASSWORD` en `.env.local` (la elige y carga el usuario): `/admin` sin cookie → 307 a `/admin/login`; contraseña mala → mensaje y ≥1 s; buena → entra; cookie con `Path=/admin; HttpOnly; Secure; SameSite=lax`. Listo para commitear.

---

### Task 7: Vistas Clientes y Bajas (lectura)

**Files:**
- Create: `lib/admin-datos.ts` (server-only), `app/admin/page.tsx`, `app/admin/bajas/page.tsx`, `components/admin/TarjetaCliente.tsx`, `components/admin/FilaTele.tsx`, `components/admin/Avisos.tsx` (+ CSS module)

**Interfaces:**
- Consumes: Task 2 (`colorBadge`, `avisoPago`, `etiquetaRubros`), `getTenant`, `rest()`.
- Produces:

```ts
export interface TeleAdmin { id: string; rubros: string[] | null; activa: boolean; ultimaConexion: string | null }
export interface ClienteAdmin { slug: string; nombre: string; pagadoHasta: string | null; dadoDeBaja: boolean; teles: TeleAdmin[] }
export function listarClientes(): Promise<ClienteAdmin[] | null>  // null = base no disponible
export function rubrosDePlanilla(slug: string): Promise<string[]>   // únicos y ordenados, de getListasPrecios
```

- [ ] **Step 1:** `listarClientes` vía `GET /rest/v1/comercios?select=slug,pagado_hasta,dado_de_baja,teles(id,rubros,activa,ultima_conexion)`; `nombre` de `getTenant(slug)?.nombre ?? slug`.

- [ ] **Step 2:** `/admin`: `exigirSesion()`; `null` → aviso "No se pudo leer la base, probá en un rato"; avisos arriba (vencidos primero); tarjetas de clientes activos ordenadas por nombre; teles con etiqueta de rubros, badge (punto de color + texto), "hace X min/h", id corto debajo solo si dos teles del cliente tienen la misma etiqueta. `/admin/bajas`: clientes con `dadoDeBaja`. Navegación simple entre las dos vistas. Una columna en ≤640px.

- [ ] **Step 3: Verificar** local con filas temporales (2 clientes, uno de baja, teles con conexiones de hace 5, 30 y 120 min y una `activa=false`): cada badge del color esperado; avisos correctos; El Ancla no aparece; vista celular (375px) sin scroll horizontal. Listo para commitear.

---

### Task 8: Acciones del panel

**Files:**
- Create: `app/admin/actions.ts` ('use server'), `components/admin/*` (formularios cliente de cada acción)

**Interfaces:**
- Consumes: Tasks 1, 2, 6, 7.
- Produces (todas llaman `exigirSesion()` primero, `revalidatePath('/admin')`/`('/admin/bajas')` al terminar, y devuelven `{ ok: true } | { ok: false, error: string }`):
  - `cambiarSwitch(teleId: string, activa: boolean)`
  - `cambiarTodas(slug: string, activa: boolean)` — el botón dice "Apagar todas" si alguna está prendida, si no "Prender todas".
  - `registrarPago(slug: string)` — `siguienteMes(pagadoHasta)`; sin fecha → error "Cargá la fecha de pago primero".
  - `cambiarFechaPago(slug: string, fecha: string)` — valida `AAAA-MM-DD`.
  - `nuevaTele(slug: string, codigo: string, rubros: string[])` — `normalizarCodigo`; id nuevo de 6 caracteres `[a-z0-9]` (mismo criterio que `scripts/activar.mts`); `activar_codigo_alta`; error si el código es de otro cliente ("Ese código es de otro cliente"), vencido, usado o inválido.
  - `cambiarRubros(teleId: string, rubros: string[], password: string)` — `exigirPassword`; `[]` = Todo.
  - `darDeBaja(slug: string, password: string)` — `exigirPassword`.
  - `reactivar(slug: string)`.

- [ ] **Step 1:** Implementar acciones y formularios. Rubros con casillas de `rubrosDePlanilla(slug)` + "Todo" (excluyente). Todos los botones con `BotonAccion`. Confirmación con contraseña en un panel desplegable dentro de la tarjeta (sin librerías de modal).

- [ ] **Step 2: Verificar** local contra la base con filas temporales: cada acción cambia la fila esperada (`select` por SQL); contraseña mala en baja/rubros → error y nada cambia; `registrarPago` sobre `2026-01-31` → `2026-02-28`; código de otro cliente → error; spinner visible y botón deshabilitado durante cada acción (verificación visual del usuario en su server). Borrar filas. `npx tsc --noEmit && npm run lint && npm test` verde. Listo para commitear.

---

### Task 9: Alta de clientes, docs y paso a producción

**Files:**
- Modify: `scripts/alta.mts`, `.env.local.example`, `README.md`, `docs/manual-nuevo-cliente.md`, `docs/progreso.md`, `CHANGELOG.md`

- [ ] **Step 1:** `npm run alta`: después de escribir el tenant, `POST /rest/v1/comercios` con `{ slug, requiere_activacion: true }` (`Prefer: resolution=ignore-duplicates`); sin `SUPABASE_*` → aviso "Cargá la fila en comercios a mano" y sigue. Flag `--sin-supabase`.

- [ ] **Step 2: Docs.** `.env.local.example`: `ADMIN_PASSWORD`. Manual: secciones 3 (fila automática), 5 y 6 (Start URL definitiva + código en pantalla + "Nueva tele" en el panel; el link largo queda como plan B), 8 (ya no hace falta "cerrar la activación" para clientes nuevos) y 9 (cobros, switch, rubros y bajas desde el panel); tabla de problemas: "Servicio suspendido" se elimina, suma "no aparece código → cliente de baja o sin fila". README, progreso, CHANGELOG.

- [ ] **Step 3: Producción** (usuario + agente, fuera de horario): el usuario carga `ADMIN_PASSWORD` (Secret) en Vercel; migración ya aplicada (Task 1); push; Redeploy si cargó la variable después. Verificar `/admin/login` en producción, entrar, ver El Látigo.

- [ ] **Step 4: El Látigo** (lo pidió el usuario al final): desde el panel cargar su fecha de pago; verificar que `vufw80` y `7au8no` figuren con badge verde en horario de atención; prender `requiere_activacion` (SQL; el panel no lo expone). Actualizar memoria `project_activacion_pantallas_pendiente`.
