# Activación Parte A (estado de teles en Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `requiere_activacion`, `pagado_hasta`, el switch por tele, sus rubros y su última conexión vivan en Supabase y se operen sin push.

**Architecture:** Cada carga de pantalla llama una función SQL (`estado_tele`) por RPC con `fetch` y timeout de 1 s; una función pura decide qué mostrar; ante cualquier falla de la base se muestra (regla de la etapa 1). La cookie firmada sigue siendo la identidad de la tele.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript, `node --test` con type stripping, Supabase Postgres + PostgREST (sin `@supabase/supabase-js`).

**Spec:** `docs/superpowers/specs/2026-10-17-activacion-supabase-parte-a-design.md`

## Global Constraints

- Sin dependencias nuevas en `package.json`.
- Ante la duda, mostrar: error, timeout, no-2xx, JSON inválido o env faltante → estado `null` → precios.
- Timeout de la RPC: `AbortSignal.timeout(1000)`; `fetch` con `method: 'POST'`, `cache: 'no-store'`.
- `DIAS_GRACIA_PAGO = 5`.
- Textos: "Servicio suspendido", "Pantalla no habilitada", "Pantalla desactivada".
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (solo servidor).
- Módulos testeados con `node --test`: sin `@/`, sin `server-only`, imports relativos con extensión `.ts`.
- Proyecto Supabase `tv-precios`, región `sa-east-1`. Se pausa `emprendeya`; `invoices-ia-automation` queda activo.
- **Commits y push los hace el usuario** (regla global): cada tarea termina en "listo para commitear", sin `git add`/`git commit`.
- Push solo fuera del horario de atención (cierre 13 h y 20:15).

## Review Focus

- Supabase lento (>1 s) o inalcanzable → la pantalla carga con precios, no se cuelga ni bloquea (Task 4, prueba con URL inválida).
- Tele con `rubros = '{}'` (array vacío) en la base → muestra todo, no "nada" (Task 2, test `rubros vacios de la base = todo`).
- Comercio con fila, `requiere_activacion = false`, sin cookie, con `?rubro=cerdo` → filtra por el param como hoy (Task 2, test `sin cookie usa el param`).
- Fila de tele presente con `activa = false` en un comercio que no requiere activación → igual "Pantalla desactivada" (Task 2, test `switch apagado sin requiere`).
- Respuesta de PostgREST con forma inesperada (`pagado_hasta` como número, `tele` como string) → `null`, no excepción (Task 2, test `parsearEstado rechaza basura`).

---

### Task 1: Proyecto Supabase, tablas y función `estado_tele`

**Files:**
- Create: `supabase/migrations/20261017000000_estado_teles.sql`

**Interfaces:**
- Produces: RPC `POST {SUPABASE_URL}/rest/v1/rpc/estado_tele` con body `{"p_comercio": string, "p_tele": string | null, "p_rubros": string[] | null}` → `{"comercio": {"requiere_activacion": boolean, "pagado_hasta": "AAAA-MM-DD" | null} | null, "tele": {"activa": boolean, "rubros": string[] | null} | null}`. Headers: `apikey` y `Authorization: Bearer` con la service role key.

- [ ] **Step 1: El usuario pausa `emprendeya`** en el dashboard de Supabase. Verificar con `list_projects` que queda `INACTIVE`.

- [ ] **Step 2: Crear el proyecto** `tv-precios` en `sa-east-1` con la MCP de Supabase (`get_cost` + `confirm_cost` + `create_project`), organización `kibajqjlbohrjtvgfhmf`. Esperar `ACTIVE_HEALTHY`.

- [ ] **Step 3: Escribir la migración** con:
  - tablas `comercios` y `teles` con las columnas, tipos y defaults de la sección "Tablas" del spec; FK `teles.comercio → comercios(slug) on delete restrict`;
  - `alter table … enable row level security` en ambas, sin políticas;
  - la función:

```sql
create or replace function public.estado_tele(p_comercio text, p_tele text, p_rubros text[])
returns json language plpgsql security invoker set search_path = public as $$
declare
  c comercios%rowtype;
  t teles%rowtype;
begin
  select * into c from comercios where slug = p_comercio;
  if not found then
    return json_build_object('comercio', null, 'tele', null);
  end if;
  if p_tele is not null then
    insert into teles (id, comercio, rubros) values (p_tele, p_comercio, p_rubros)
      on conflict (id) do nothing;
    update teles set ultima_conexion = now()
      where id = p_tele and comercio = p_comercio
      returning * into t;
  end if;
  return json_build_object(
    'comercio', json_build_object(
      'requiere_activacion', c.requiere_activacion,
      'pagado_hasta', to_char(c.pagado_hasta, 'YYYY-MM-DD')),
    'tele', case when t.id is null then null
      else json_build_object('activa', t.activa, 'rubros', t.rubros) end);
end $$;

revoke execute on function public.estado_tele(text, text, text[]) from public, anon, authenticated;
grant execute on function public.estado_tele(text, text, text[]) to service_role;
```

- [ ] **Step 4: Aplicar** con `apply_migration` (nombre `estado_teles`).

- [ ] **Step 5: Probar en SQL** (`execute_sql`), en este orden, y borrar los datos al final:
  - `select estado_tele('no-existe', 'abc123', null)` → `{"comercio":null,"tele":null}` y `select count(*) from teles` = 0.
  - `insert into comercios(slug) values ('prueba-a'),('prueba-b')`; `select estado_tele('prueba-a','abc123','{cerdo}')` → `tele.activa = true`, `tele.rubros = ["cerdo"]`, `comercio.pagado_hasta = null`; la fila tiene `ultima_conexion` no nula.
  - `select estado_tele('prueba-b','abc123',null)` → `tele: null` y la fila `abc123` sigue con `comercio = 'prueba-a'`.
  - `update comercios set pagado_hasta = '2026-10-31' where slug='prueba-a'` → `pagado_hasta = "2026-10-31"` en la respuesta.
  - `set role anon; select estado_tele('prueba-a',null,null);` → error de permiso; `select * from teles` como `anon` → 0 filas. `reset role`.
  - `delete from teles; delete from comercios;`

- [ ] **Step 6: `get_advisors` (security)** sin avisos nuevos de RLS ni de la función. Listo para commitear.

---

### Task 2: Decisión pura y validación de la respuesta

**Files:**
- Create: `lib/acceso-decision.ts`
- Test: `lib/acceso-decision.test.ts`

**Interfaces:**
- Consumes: `pagoVencido(pagadoHasta: string, ahoraMs: number, diasGracia: number): boolean` y `type Tele` de `./activacion.ts`; `parseRubrosParam(raw): Set<string> | null` de `./rubros.ts`.
- Produces:

```ts
export const DIAS_GRACIA_PAGO = 5
export interface EstadoBase {
  comercio: { requiereActivacion: boolean; pagadoHasta: string | null } | null
  tele: { activa: boolean; rubros: string[] | null } | null
}
export type Acceso =
  | { tipo: 'ok'; rubros: Set<string> | null }
  | { tipo: 'no-habilitada' }
  | { tipo: 'suspendida' }
  | { tipo: 'desactivada' }
export function parsearEstado(json: unknown): EstadoBase | null
export function decidirAcceso(args: {
  estado: EstadoBase | null
  tele: Tele | null            // ya filtrada: cookie válida y del mismo comercio
  rubroParam: string | string[] | undefined
  ahoraMs: number
}): Acceso
```

- [ ] **Step 1: Escribir los tests** en `lib/acceso-decision.test.ts` (con `ahoraMs = Date.parse('2026-10-20T12:00:00-03:00')`, `TELE = { id: 'k3x9q2', tenant: 'el-latigo', rubros: ['vacuno'] }`, helper `rubros(acceso)` que devuelve `[...acceso.rubros].sort()` o `null`):
  - `estado null muestra con rubros de la cookie` → `ok`, `['vacuno']`; con `tele: null` y `rubroParam: 'cerdo'` → `['cerdo']`.
  - `comercio null es sin control` → con `tele: null`, `rubroParam: undefined` → `ok`, `null`.
  - `pago vencido suspende` → `pagadoHasta: '2026-10-14'` → `suspendida`; `'2026-10-15'` → `ok` (límite de 5 días de gracia).
  - `suspendida gana a todo` → vencido + tele con `activa: false` → `suspendida`.
  - `requiere sin tele no habilita` → `requiereActivacion: true`, `tele: null` → `no-habilitada`.
  - `requiere con tele sin fila usa la cookie` → `requiereActivacion: true`, `estado.tele: null`, tele de cookie → `ok`, `['vacuno']`.
  - `switch apagado` → `estado.tele.activa: false` → `desactivada`.
  - `switch apagado sin requiere` → `requiereActivacion: false` + `activa: false` → `desactivada`.
  - `rubros de la base ganan a la cookie` → base `['cerdo','pollo']`, cookie `['vacuno']` → `['cerdo','pollo']`.
  - `rubros null de la base = todo` y `rubros vacios de la base = todo` → `null`.
  - `sin cookie usa el param` → comercio con fila, `requiereActivacion: false`, `tele: null`, `rubroParam: 'cerdo'` → `['cerdo']`.
  - `parsearEstado acepta la respuesta de la RPC` → `{comercio:{requiere_activacion:true,pagado_hasta:'2026-10-31'},tele:{activa:false,rubros:['cerdo']}}` → `{comercio:{requiereActivacion:true,pagadoHasta:'2026-10-31'},tele:{activa:false,rubros:['cerdo']}}`; `{comercio:null,tele:null}` → igual con nulls.
  - `parsearEstado rechaza basura` → `null`, `'x'`, `{}`, `{comercio:{requiere_activacion:'si'},tele:null}`, `{comercio:{requiere_activacion:true,pagado_hasta:20261031},tele:null}`, `{comercio:null,tele:'x'}`, `{comercio:null,tele:{activa:true,rubros:[1]}}` → todos `null`.

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test lib/acceso-decision.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar** `lib/acceso-decision.ts` con las firmas de arriba y el orden de la tabla del spec (suspendida → no-habilitada → desactivada → ok). Rubros de la base: array vacío o `null` → `null`; se pasan por `new Set` tal cual (ya canónicos). Sin fila de tele: `tele.rubros` de la cookie (mismo criterio); sin cookie: `parseRubrosParam(rubroParam)`. `parsearEstado` valida tipos campo por campo y mapea a camelCase.

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test lib/acceso-decision.test.ts`
Expected: PASS, 0 fail.

- [ ] **Step 5: Listo para commitear.**

---

### Task 3: Conectar la base a las pantallas y quitar los campos del código

**Files:**
- Create: `lib/estado-tele.ts`
- Modify: `lib/acceso.ts`, `components/PantallaBloqueada.tsx`, `types/tenant.ts`, `tenants/registro.test.ts`, `lib/activacion.ts` (comentarios), `.env.local.example`, `README.md` ("Activación de una tele"), `docs/manual-nuevo-cliente.md` (secciones 0, 3, 8, 9 y tabla de problemas), `docs/progreso.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `EstadoBase`, `Acceso`, `parsearEstado`, `decidirAcceso`, `DIAS_GRACIA_PAGO` (Task 2); RPC de Task 1.
- Produces: `estadoTele(comercio: string, tele: Tele | null): Promise<EstadoBase | null>` en `lib/estado-tele.ts` (`import 'server-only'`); `resolverAcceso(tenant, rubroParam): Promise<Acceso>` mantiene firma; `lib/acceso.ts` re-exporta `type Acceso` y `DIAS_GRACIA_PAGO` desde `./acceso-decision`.

- [ ] **Step 1: `lib/estado-tele.ts`**: sin `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY` → `console.error('[supabase] faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: se muestra la pantalla igual')` y `null`. Si no, `fetch(`${url}/rest/v1/rpc/estado_tele`, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(1000), headers: { apikey, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_comercio, p_tele: tele?.id ?? null, p_rubros: tele?.rubros ?? null }) })`. No-2xx, excepción o `parsearEstado` → `null` con `console.error('[supabase] …')` que incluya status o mensaje.

- [ ] **Step 2: `lib/acceso.ts`**: tras leer y filtrar la cookie (código actual), `const estado = await estadoTele(tenant.slug, tele)` y `return decidirAcceso({ estado, tele, rubroParam, ahoraMs: Date.now() })`. Mantener el log `[tele]` y `COOKIE_TELE` exportado (lo importa `app/activar/[...partes]/route.ts`). Borrar la lógica de `tenant.pagadoHasta`/`tenant.requiereActivacion`. **Falta `ACTIVACION_SECRET`** (falla nuestra): mantener el `console.error` actual y decidir con `estado: null` sin llamar a la base — si no, un comercio con `requiere_activacion` bloquearía todas sus teles por una variable faltante.

- [ ] **Step 3: `PantallaBloqueada.tsx`**: sumar `desactivada: 'Pantalla desactivada'` a `TEXTOS`; actualizar el comentario (vuelve sola al prender el switch o correr `pagado_hasta` en Supabase).

- [ ] **Step 4: Quitar** `requiereActivacion` y `pagadoHasta` de `types/tenant.ts` y el test `pagadoHasta, si esta, …` de `tenants/registro.test.ts`. Actualizar comentarios de `lib/activacion.ts` que los nombran.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sin errores; todos los tests pasan.
Run: `grep -rn "requiereActivacion\|pagadoHasta" lib app components types tenants`
Expected: solo `pagoVencido(pagadoHasta…)` en `lib/activacion.ts` y el campo `pagadoHasta` de `EstadoBase` en `lib/acceso-decision.ts` (+ su test); ningún `tenant.pagadoHasta` ni `requiereActivacion`.

- [ ] **Step 6: Docs**: `.env.local.example` suma `SUPABASE_URL=` y `SUPABASE_SERVICE_ROLE_KEY=` con comentario (solo servidor, Production en Vercel). README y manual: alta de cliente suma "fila en `comercios`" (sin ella sus teles no se registran ni se bloquean); bloqueo, cobro y switch se hacen en el editor de tablas de Supabase sin push; tabla de problemas suma "Pantalla desactivada → switch `activa` en `teles`". `docs/progreso.md` (Abierto) y `CHANGELOG.md` (sesión de Parte A).

- [ ] **Step 7: Listo para commitear.**

---

### Task 4: Prueba de punta a punta y paso a producción

**Files:** ninguno nuevo (datos de prueba en Supabase, se borran).

**Interfaces:**
- Consumes: todo lo anterior; `npm run activar` (sin cambios).

- [ ] **Step 1: El usuario** carga `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (valores del proyecto `tv-precios`: `get_project_url`; la service role key la copia del dashboard → Settings → API).

- [ ] **Step 2: Build local**: `npm run build`, levantar la config `prod` de `.claude/launch.json` (puerto 3100). Insertar `comercios('demo')`. Generar `URL_PUBLICA=http://localhost:3100 npm run activar -- demo cerdo 1`, abrir con `curl -i` para obtener la cookie.

- [ ] **Step 3: Verificar con curl + cookie** sobre `/demo`, cambiando la base entre pasos:
  - primera carga → 200 con precios; `teles` tiene la fila con `rubros {cerdo}` y `ultima_conexion` reciente; log `[tele]`.
  - `update teles set activa=false` → body contiene "Pantalla desactivada".
  - `activa=true`, `update comercios set requiere_activacion=true` → sin cookie: "Pantalla no habilitada"; con cookie: precios.
  - `pagado_hasta = '2026-01-01'` → "Servicio suspendido".
  - `rubros = '{pollo}'` → precios solo de pollo con la misma cookie.
  - Reiniciar el server con `SUPABASE_URL=https://no-existe.invalid` y `requiere_activacion=true` → sin cookie: 200 con precios y log `[supabase]`; tiempo de respuesta < 2 s.
  - `/` (El Ancla, sin fila en `comercios`) con y sin cookie de `demo` → 200 con precios de El Ancla; `teles` no gana filas.
  - Borrar las filas de `demo`. **Todo este paso va antes del push** (Step 6): es la base de producción y una fila de `demo` con `requiere_activacion` bloquearía el demo público.

- [ ] **Step 4: El usuario** carga las dos variables en Vercel (Production, `SUPABASE_SERVICE_ROLE_KEY` como Secret).

- [ ] **Step 5: Insertar** `comercios('el-latigo')` con `requiere_activacion = false`, `pagado_hasta = null`.

- [ ] **Step 6: Push del usuario fuera de horario.** Tras el deploy (≤10 min), verificar en `teles` las filas `vufw80` (`{vacuno}`) y `7au8no` (`{cerdo,pollo}`) con `ultima_conexion` reciente, y en logs de Vercel ningún `[supabase]`.

- [ ] **Step 7: Nombrar** las teles (`nombre = 'vacuno'`, `'cerdo y pollo'`). Cuando el usuario pase la fecha: `requiere_activacion = true` y `pagado_hasta` en `el-latigo`, desde el editor, sin push. Verificar desde una PC sin cookie: "Pantalla no habilitada".

- [ ] **Step 8:** Actualizar la memoria `project_activacion_pantallas_pendiente` (Parte A en producción; falta Parte B).
