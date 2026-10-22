# Panel de administración — Parte B

Fecha: 2026-10-19 · Estado: **borrador para revisión del usuario**. Sobre la
Parte A en producción
([2026-10-17-activacion-supabase-parte-a-design.md](2026-10-17-activacion-supabase-parte-a-design.md)):
Supabase `tv-precios` con tablas `comercios` y `teles`, función
`estado_tele`, decisión pura en `lib/acceso-decision.ts`.

## Intención

El dueño del sistema (único usuario del panel) quiere operar a sus clientes
y sus teles **sin tocar código ni el editor de Supabase**, desde el celular
en el local o desde la compu en su casa:

- ver de un vistazo todas las teles, agrupadas por cliente, qué muestra cada
  una y si está andando;
- enterarse de los pagos por vencer y vencidos, para avisarle al cliente;
- cortar el servicio **él mismo**, apagando teles (nunca automático);
- dar de alta teles sin tipear links largos con el control remoto (lo que
  más costó en la instalación de El Látigo);
- dar de baja un cliente y poder reactivarlo con un clic.

Éxito: instalar una tele nueva = poner `tv-precios.vercel.app/<cliente>`
en el Fire TV + cargar un código de 6 caracteres en el panel.

## Objetivos

1. Login con una contraseña.
2. Vista **Clientes**: clientes activos con sus teles.
3. Avisos de pago (por vencer ≤3 días, vencido) y botón **Pagó**.
4. Switch por tele y **Apagar todas** por cliente.
5. **Nueva tele** con código corto.
6. **Cambiar rubros** de una tele (pide contraseña).
7. **Dar de baja** un cliente (pide contraseña) y vista **Bajas** con
   **Reactivar** (un clic).
8. Renovación automática de la cookie de cada tele.
9. Quitar el corte automático por pago de la Parte A.

## No objetivos (v1)

Borrar una tele, pasar una tele a otro cliente, historial de pagos,
varios usuarios o roles, notificaciones (mail/WhatsApp), alta de clientes
desde el panel (sigue `npm run alta`), mostrar El Ancla (no usa
activación), migrar a Vercel Pro (pendiente aparte: el plan Hobby no permite
uso comercial).

## Anti-objetivos (sería un fracaso aunque funcione)

- Que el sistema corte una tele solo, sin que el dueño lo decida.
- Que una falla nuestra (Supabase caído, código vencido, cookie) deje en
  negro la tele de un cliente que paga. Regla heredada: **ante la duda,
  mostrar**.
- Que el código de alta permita activar una tele a quien no sea el dueño.
- Sobreingeniería: el usuario lo pidió explícito ("algo simple").

## Restricciones

- Next.js 16 (leer `node_modules/next/dist/docs/` antes de tocar APIs; el
  middleware se llama `proxy`).
- Sin dependencias nuevas salvo que no haya alternativa razonable.
- Todo botón que dispare una acción asíncrona muestra spinner (`Loader2`
  con `animate-spin` o equivalente) y queda `disabled` mientras corre
  (regla global del usuario), incluidos botones de solo ícono.
- Responsive: usable con el pulgar en un celular y cómodo en una compu.
- Base solo desde el servidor con `SUPABASE_SERVICE_ROLE_KEY`; tablas con
  RLS sin políticas, funciones cerradas a `anon`/`authenticated` (igual que
  la Parte A).
- Commits y push los hace el usuario, fuera del horario de atención.

## Decisiones del usuario

- Login: **una sola contraseña**, en la variable de Vercel `ADMIN_PASSWORD`.
- Cada tele se identifica por **lo que muestra** ("Vacuno", "Cerdo y
  pollo", "Todo"). Sin campo nombre en la vista.
- Badge con los colores de la pantalla: verde, ámbar, rojo.
- Cobros: el panel **solo avisa**: "vence en ≤3 días" y "vencido" (sin
  corte). El corte es manual con el switch.
- Botón **Pagó**: corre `pagado_hasta` al **mismo día del mes siguiente**.
- Eliminar cliente = **baja**: pide contraseña; sus teles quedan en
  "Pantalla no habilitada"; pasa a la vista **Bajas**; **Reactivar** con
  un clic lo devuelve como estaba.
- Cambiar rubros de una tele: pide contraseña.
- Alta con código corto (flujo de abajo).

## Diseño

### Datos (migración nueva sobre la Parte A)

`comercios` suma `dado_de_baja boolean not null default false`.
`pagado_hasta` sigue igual pero pasa a ser **solo informativo**.
`teles.nombre` queda en la base sin usar en el panel.

Tabla nueva `codigos_alta`:

| Columna | Tipo | Notas |
|---|---|---|
| `codigo` | `text` PK | 6 caracteres del alfabeto sin ambiguos (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`) |
| `comercio` | `text` → `comercios(slug)` | El de la URL donde se pidió |
| `nonce_sha256` | `text` | Hash del secreto que solo conoce la tele (ver alta) |
| `vence_en` | `timestamptz` | Creación + 15 min |
| `tele_id` | `text null` | Se completa cuando el dueño lo activa |

RLS sin políticas. Los códigos vencidos se borran de forma oportunista
(al crear uno nuevo, borrar los vencidos).

`estado_tele` cambia:
- si `comercios.dado_de_baja`: **no autoregistra** y devuelve el flag;
- devuelve `dado_de_baja` dentro de `comercio`.

### Decisión (cambia `lib/acceso-decision.ts`)

Orden nuevo:

1. `comercio.dadoDeBaja` → `no-habilitada` (aunque tenga cookie).
2. `comercio.requiereActivacion` y no hay tele válida → `no-habilitada`.
3. Tele con `activa = false` → `desactivada`.
4. Si no → `ok` (rubros: base > cookie > `?rubro=`, como hoy).

Se elimina `suspendida` (corte por pago) y `DIAS_GRACIA_PAGO`. Estado
`null` (falla de la base) sigue mostrando.

### Alta de una tele con código

1. El instalador pone en el Fire TV la Start URL definitiva
   `tv-precios.vercel.app/<cliente>`.
2. El cliente tiene `requiere_activacion = true`, así que sin cookie la
   página muestra `PantallaBloqueada` "Pantalla no habilitada".
3. En esa pantalla, un componente cliente pide un código a un route handler
   (`POST /api/alta`, con el slug). El servidor genera `codigo` + un
   `nonce` aleatorio, guarda `sha256(nonce)` y devuelve los dos. La tele
   guarda `{codigo, nonce, vence}` en `localStorage` y reutiliza el código
   mientras no venza (la pantalla se recarga sola cada 10 min).
4. La pantalla muestra el código grande: "Código de activación: K7M-2QX".
5. Cada 5 s la tele consulta `GET /api/alta?codigo=…&nonce=…`. Respuestas:
   pendiente / vencido (pide uno nuevo) / activada. Cuando está activada, el
   route handler **pone la cookie firmada** de la tele (mismo formato que
   `firmarCookie` de la etapa 1) y la tele recarga.
6. En el panel, **Nueva tele**: el dueño escribe el código (sin guion, sin
   distinguir mayúsculas) y marca los rubros. El servidor valida que el
   código exista y no venció, crea la fila en `teles` (id nuevo, comercio
   del código, rubros elegidos, `activa = true`) y completa
   `codigos_alta.tele_id`.

Por qué el nonce: el código se ve en la vidriera; sin el nonce, cualquiera
que lo lea podría consultar antes que la tele y quedarse con la cookie. El
nonce nunca se muestra.

Los rubros elegibles en **Nueva tele** y **Cambiar rubros** son los que
aparecen en la planilla de ese cliente (los mismos que usa
`filtrarPorRubro`), más "Todo".

`npm run activar` (link firmado) sigue como plan B.

*Decisión del constructor:* un cliente dado de baja muestra "Pantalla no
habilitada" **sin código**, y `POST /api/alta` rechaza clientes dados de
baja o sin fila.

*Decisión del constructor:* `public/sw.js` deja de cachear `/api/*` (el
polling lleva el nonce y no debe quedar guardado) y se sube
`CACHE_VERSION`.

### Panel

Rutas bajo `/admin` (fuera de `app/[tenant]`):

- `/admin/login`: campo contraseña. Comparación en tiempo constante contra
  `ADMIN_PASSWORD`. Correcta → cookie de sesión firmada (HMAC con
  `ACTIVACION_SECRET`, distinta de la de las teles), `httpOnly`, `secure`,
  `sameSite=lax`, `path=/admin`, 30 días. Incorrecta → espera 1 s antes de
  responder (*decisión del constructor*: en lugar del bloqueo tras 5
  intentos que se mencionó en la charla, que necesitaría guardar intentos en
  la base; con una contraseña larga alcanza). Sin `ADMIN_PASSWORD` configurada, el panel no deja entrar.
- `/admin` (**Clientes**) y `/admin/bajas` (**Bajas**): Server Components
  que leen la base. Sin sesión válida → redirigen al login. Cada acción del
  panel valida la sesión en el servidor; las que piden contraseña la vuelven
  a comparar.

**Vista Clientes** (clientes con fila en `comercios` y `dado_de_baja =
false`; nombre visible tomado de `tenants/`):

- Arriba, **Avisos**: clientes con pago vencido (con días de atraso) y con
  vencimiento en ≤3 días.
- Por cliente: nombre, fecha de pago (editable), botón **Pagó**, botón
  **Apagar todas** (si todas están apagadas, el mismo botón dice **Prender
  todas** — *decisión del constructor*, para cuando el cliente paga),
  botón **Nueva tele**, botón **Dar de baja**.
- Por tele: rubros que muestra ("Vacuno", "Cerdo y pollo", "Todo"),
  badge, hace cuánto se conectó, switch, botón **Cambiar rubros**. Si dos
  teles del mismo cliente muestran lo mismo, debajo el id corto.

**Badge** (por `ultima_conexion` y `activa`):

| Color | Condición |
|---|---|
| Verde | conectada hace < 15 min |
| Ámbar | entre 15 y 60 min |
| Rojo | > 60 min o nunca |
| Gris | `activa = false` (apagada a propósito) |

Fuera del horario de atención es normal ver todo en rojo.

**Pagó**: `pagado_hasta` = mismo día del mes siguiente a la fecha
anterior (no a hoy). Si ese día no existe, el último del mes. Sin fecha
cargada, el botón pide cargarla.

**Dar de baja**: pide contraseña → `dado_de_baja = true`. Las teles y sus
switches quedan como estaban en la base.

**Vista Bajas**: clientes con `dado_de_baja = true`, con **Reactivar** (un
clic, sin contraseña) → `dado_de_baja = false`; todo vuelve como estaba.

### Renovación de la cookie

En `proxy` (Next 16), para las rutas de pantalla: si la request trae una
cookie `tele` con firma válida, se reenvía con `maxAge` de 400 días. Una
tele prendida nunca llega al vencimiento. Cookie inválida o ausente: no se
toca.

### Alta de clientes

`npm run alta` crea además la fila en `comercios` con
`requiere_activacion = true` (necesita `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` en `.env.local`). Así un cliente nuevo nunca
muestra precios a aparatos sin activar y su pantalla ya muestra el código.

### Puesta en marcha de El Látigo (al final)

Prender `requiere_activacion`, cargar `pagado_hasta` desde el panel y
verificar sus dos teles (`vufw80`, `7au8no`).

## Lo que queda al constructor

Estructura de componentes y archivos, estilos (siguiendo los CSS modules del
proyecto), textos menores, cómo se muestra "hace cuánto", el formato visual
del código en pantalla, cómo se agrupan las consultas a la base, y si las
acciones del panel van por Server Actions o route handlers.

## Pruebas esperadas

Funciones puras con `node --test`: decisión nueva (baja, sin suspendida),
color del badge, avisos de pago, "Pagó" (incluye 31 → fin de mes), formato y
normalización del código. SQL de la migración probado en la base (baja sin
autoregistro, código vencido, nonce incorrecto). Punta a punta local: alta
con código, switch, cambiar rubros, baja y reactivar, login incorrecto.
