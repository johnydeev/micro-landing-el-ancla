# Activación de pantallas — Parte A: estado de teles en Supabase

Fecha: 2026-10-17 · Estado: **diseño aprobado en chat, spec pendiente de
revisión**. Etapa 2 de
[2026-10-12-activacion-pantallas-opciones.md](2026-10-12-activacion-pantallas-opciones.md)
(opción 2), sobre la etapa 1 ya en producción (link firmado + cookie con id
por tele, `lib/activacion.ts`, `lib/acceso.ts`).

## Objetivo

Que el estado de cada tele y los cobros vivan en una base de datos y no en el
código, para operar sin pushear:

- prender/apagar **cada tele** por separado (hoy solo por comercio);
- ver la **última conexión** de cada tele;
- `requiereActivacion` y `pagadoHasta` editables sin push;
- cambiar el rubro de una tele sin ir al local.

La Parte A deja todo operable desde el **editor de tablas de Supabase**. La
Parte B (spec aparte) suma el panel `/admin` con login, el alta de teles con
código corto y la renovación de la cookie.

## Restricciones

- **Ante la duda, mostrar**: una falla nuestra (Supabase caído, lento,
  pausado, mal configurado) nunca bloquea una tele. Regla heredada de la
  etapa 1.
- La carga de la pantalla no se puede volver notablemente más lenta: una
  sola ida a la base, tiempo límite de 1 s.
- Sin dependencias nuevas: el repo solo depende de `next`, `react`,
  `react-dom`.
- La cookie firmada de la etapa 1 sigue siendo la identidad de la tele; las
  teles ya activadas (`vufw80`, `7au8no` de El Látigo) no se reactivan.
- Granja El Ancla (cliente semilla) sigue sin activación.

## Base de datos

**Proveedor:** Supabase (Postgres), proyecto nuevo `tv-precios` en
`sa-east-1` (São Paulo, misma zona que las funciones de Vercel `gru1`). El
plan gratis admite 2 proyectos activos por organización: se pausa
`emprendeya` (decisión del usuario; `invoices-ia-automation` queda activo).

Elegido sobre Upstash Redis (clave-valor: clientes/teles/pagos sin
relaciones, sin editor cómodo), Neon (sin ventaja sobre Supabase acá) y
Vercel Edge Config (escrituras lentas y limitadas; no sirve para última
conexión). Supabase da editor de tablas como plan B operativo si el panel
falla.

### Tablas

`comercios` — una fila por cliente con activación o control de pago.

| Columna | Tipo | Notas |
|---|---|---|
| `slug` | `text` PK | Igual al slug de `tenants/<slug>.ts` |
| `requiere_activacion` | `boolean not null default false` | Sin cookie válida → "Pantalla no habilitada" |
| `pagado_hasta` | `date null` | Null = sin control de pago |

`teles` — una fila por tele activada.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `text` PK | Id de la cookie (`[a-z0-9]{4,12}`) |
| `comercio` | `text not null` → `comercios(slug) on delete restrict` | No se puede borrar un comercio con teles: primero sus teles |
| `nombre` | `text null` | Etiqueta para humanos ("vacuno") |
| `rubros` | `text[] null` | Null = todo. Canónicos (minúsculas, sin acentos) |
| `activa` | `boolean not null default true` | El switch |
| `ultima_conexion` | `timestamptz null` | |
| `creada_en` | `timestamptz not null default now()` | |

Seguridad: RLS habilitado en ambas tablas **sin políticas** (cerradas para
`anon`/`authenticated`). Solo el servidor accede, con la service role key.
La función `estado_tele` es `security invoker` y se le hace
`revoke execute … from public, anon, authenticated` (PostgREST expone toda
función a la clave anónima por defecto); solo `service_role` la ejecuta.
`pagado_hasta` es `date`: una fecha mal escrita no se puede guardar (hoy la
cubre un test del registro de tenants, que se quita).

### Función `estado_tele`

```
estado_tele(p_comercio text, p_tele text, p_rubros text[]) returns json
```

Una sola llamada por carga (RPC de PostgREST,
`POST /rest/v1/rpc/estado_tele`):

1. Si `p_tele` no es null **y existe** la fila de `comercios` para
   `p_comercio`: inserta la tele si no existe (`id`, `comercio`,
   `rubros = p_rubros`) — **autoregistro** — y actualiza
   `ultima_conexion = now()` (`insert … on conflict do nothing` + `update`).
   Una tele cuyo `comercio` en la base no coincide con `p_comercio` no se
   toca **y se devuelve como `tele: null`**.
2. Devuelve `{ comercio: {requiere_activacion, pagado_hasta} | null,
   tele: {activa, rubros} | null }`. `pagado_hasta` como texto
   `'AAAA-MM-DD'` (lo que espera `pagoVencido`).

Sin fila de `comercios` no se registra nada y devuelve `comercio: null`
(equivale a "sin activación ni control de pago"). Así El Ancla y el demo
siguen como hoy, y un comercio nuevo entra en la base cuando se le carga su
fila.

La migración vive versionada en `supabase/migrations/<timestamp>_estado_teles.sql`.

## Flujo de cada carga

`resolverAcceso(tenant, rubroParam)` (en `lib/acceso.ts`, ya usado por las 4
pages de pantalla) pasa a:

1. Leer y verificar la cookie `tele` (igual que hoy). Una cookie de otro
   comercio se ignora.
2. Llamar `estado_tele` vía `fetch` (`POST`, `cache: 'no-store'`) con
   `AbortSignal.timeout(1000)`, siempre — también sin cookie, para saber si
   el comercio requiere activación. Cualquier error, timeout, respuesta
   no-2xx o JSON inesperado → estado `null` y `console.error('[supabase] …')`.
3. Decidir con una función pura (abajo).
4. Mantener el log `[tele] {...}` existente.

### Decisión (función pura)

Entrada: estado de la base (`null` si falló), tele de la cookie (o null),
`?rubro=` y la hora actual. Orden:

| # | Condición | Resultado |
|---|---|---|
| 1 | `comercio.pagado_hasta` vencido hace más de `DIAS_GRACIA_PAGO` (5) | `suspendida` → "Servicio suspendido" |
| 2 | `comercio.requiere_activacion` y no hay tele válida | `no-habilitada` → "Pantalla no habilitada" |
| 3 | Hay tele en la base con `activa = false` | `desactivada` → "Pantalla desactivada" (nuevo) |
| 4 | Si no | `ok` con rubros: si hay fila de la tele en la base, **sus** rubros (null/vacío = todo, aunque la cookie diga otra cosa); si no hay fila pero sí cookie, los de la cookie; sin cookie, el `?rubro=` |

"Tele válida" (fila 2) = cookie con firma válida y del mismo comercio; no
depende de que la base devuelva la fila (si el autoregistro no devolvió la
tele, se sigue con los rubros de la cookie). La fila 3 aplica aunque el
comercio no requiera activación: el switch por tele funciona igual.

Estado `null` (la base falló): se saltean 1–3 y se muestra (`ok`, rubros de la
cookie o del `?rubro=`). Mientras Supabase esté caído, un aparato sin activar
también ve precios: costo aceptado de "ante la duda, mostrar".

### Cambios en el código

- `lib/activacion.ts`: sin cambios (`pagoVencido` se reutiliza).
- `lib/acceso-decision.ts` (nuevo, puro, testeable con `node --test`):
  `decidirAcceso(...)` y `parsearEstado(json)` (validación de la forma de la
  respuesta). Sin `@/` ni `server-only`; imports relativos con extensión
  `.ts` (`./activacion.ts`, `./rubros.ts`), como el resto de módulos
  testeados.
- `lib/estado-tele.ts` (nuevo, `server-only`): `fetch` a la RPC con timeout
  + `parsearEstado`; `null` ante cualquier problema. La service role key
  nunca sale del servidor.
- `lib/acceso.ts`: orquesta cookie → `estadoTele` → `decidirAcceso`; el tipo
  `Acceso` suma `{ tipo: 'desactivada' }`.
- `components/PantallaBloqueada.tsx`: texto para `desactivada`.
- `types/tenant.ts` y tenants: **se quitan** `requiereActivacion` y
  `pagadoHasta` (una sola fuente de verdad: la base). Se quita el test de
  `pagadoHasta` en `tenants/registro.test.ts`.
- Variables de entorno (Vercel Production y `.env.local`): `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (secreto). Sin ellas → estado `null` → se
  muestra (con `console.error`), igual que hoy sin `ACTIVACION_SECRET`.
- Comentarios que nombran los campos viejos: `lib/activacion.ts`,
  `components/PantallaBloqueada.tsx`.
- Docs: `.env.local.example`, README ("Activación de una tele"),
  `docs/manual-nuevo-cliente.md` (secciones 0, 3, 8 y 9: el alta suma la fila
  en `comercios`; bloqueo y cobros desde Supabase, sin push),
  `docs/progreso.md` y CHANGELOG. El spec de opciones queda como registro
  histórico, sin tocar.

Hoy ningún tenant tiene `requiereActivacion` ni `pagadoHasta` cargados
(verificado): quitarlos no cambia el comportamiento de nadie.

## Pruebas

- `lib/acceso-decision.test.ts`: cada fila de la tabla de decisión; estado
  `null`; comercio `null`; rubros base > cookie > param; tele activa con
  comercio vencido (gana suspendida); `requiere` con tele de otro comercio.
- `parsearEstado` (en `lib/acceso-decision.test.ts`): respuestas válidas,
  `null`s y basura.
- SQL: `anon` no puede ejecutar `estado_tele` ni leer las tablas.
- SQL: probar `estado_tele` en la base (autoregistro, no pisar tele de otro
  comercio, comercio inexistente) antes de conectar el código.
- Punta a punta con build de producción local contra Supabase: activar tele
  de prueba (comercio `demo` con fila temporal), apagar switch → "Pantalla
  desactivada", vencer pago → "Servicio suspendido", URL de Supabase inválida
  → se muestra. Borrar las filas de prueba al terminar.
- `tsc`, `lint`, `test`, `build` en CI como siempre.

## Paso a producción

1. El usuario pausa `emprendeya`. Se crea `tv-precios` (sa-east-1) y se
   aplica la migración.
2. El usuario carga `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel
   (Production, secreto) y en `.env.local`.
3. Fila `el-latigo` en `comercios` con `requiere_activacion = false`,
   `pagado_hasta = null`.
4. Push fuera del horario de atención. Verificar en `teles` que `vufw80` y
   `7au8no` se registran solas en su próxima carga (≤10 min) con sus rubros.
5. Prender `requiere_activacion` y cargar `pagado_hasta` de El Látigo desde el
   editor de Supabase (sin push), cuando el usuario tenga la fecha de pago.
6. Nombrar las teles (`nombre`) desde el editor.

Rollback: revertir el commit. Las cookies no cambian, así que las teles
siguen andando con la etapa 1.

## Límites conocidos (aceptados)

- **Switch y cobros tardan hasta 10 min** en llegar a la tele (su recarga,
  `RELOAD_INTERVAL_MS` en `PantallaRotativa.tsx`).
- **Sin internet**, el Service Worker muestra la última pantalla guardada:
  una tele recién apagada o suspendida que se queda offline sigue mostrando
  precios hasta volver a conectarse.
- **Cookie copiada a otro aparato**: comparten id y `ultima_conexion` se
  mezcla. Detectarlo queda para la Parte B.
- **Falta `ACTIVACION_SECRET`**: no se puede leer ninguna cookie; se decide
  con estado `null` (se muestra), igual que hoy. Sin esto, un comercio con
  `requiere_activacion` quedaría bloqueado entero por una variable faltante.
- **Un link de activación nuevo crea otra tele** (otro id, `activa = true`):
  apagar una tele no impide reactivar ese aparato con un link nuevo. Los
  links solo los genera el dueño del sistema, así que es aceptable.
- **Cada carga espera a Supabase** (misma región: milisegundos; peor caso,
  1 s de timeout), también en El Ancla aunque no tenga fila.

## Fuera de alcance (Parte B)

Login y pantalla `/admin`; alta de tele con código corto (tabla de códigos);
renovar la cookie antes de los 400 días; historial de pagos (decidido: solo
`pagado_hasta`); caché de estado (innecesaria con ~40 teles).
