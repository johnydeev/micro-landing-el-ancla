# Rubro por pantalla — diseño

Fecha: 2026-10-05 · Estado: aprobado en brainstorming, pendiente de plan.

## Objetivo

Que un mismo comercio pueda tener varias teles, cada una mostrando solo un
rubro (ej. una de vacuno, otra de cerdo, otra de pollo). Es la base del modelo
comercial "abono por pantalla": la segunda y tercera tele del mismo local pasan
a tener sentido.

Esta es la **etapa 1**: el rubro se elige desde el link. La **etapa 2**
(activación de pantallas, spec aparte) fija el rubro en la activación y el link
deja de servir para elegirlo. Nada de esta etapa se rehace en la etapa 2.

## Decisiones cerradas

| # | Tema | Decisión |
|---|---|---|
| 1 | Qué muestra una tele de rubro X | Ofertas de X + solo los productos de X dentro de las listas de precios (opción C del brainstorming). |
| 2 | Rubro de las listas | Por producto, desde la columna existente **Categoria** (alias aceptado: **Rubro**), ubicada inmediatamente a la izquierda de "Nombre". |
| 3 | Rubro de las ofertas | El super-header arriba de cada bloque de ofertas (hoy: RES / CERDO / POLLO). |
| 4 | Nomenclatura | Rubros sugeridos para clientes nuevos: VACUNO · CERDO · POLLO (a futuro ACHURAS, FIAMBRERÍA, ALMACÉN, VERDULERÍA). **RES y VACUNO son el mismo rubro** (alias), así la planilla de El Ancla no cambia. |
| 5 | Comparación | Sin mayúsculas, sin acentos, sin espacios de más. |
| 6 | Cómo elige la tele | Query param `?rubro=`. Acepta varios separados por coma (`?rubro=cerdo,pollo`). Sin param = todo, como hoy. |
| 7 | Productos/ofertas sin rubro | Solo aparecen en la pantalla sin filtro. |

## Comportamiento

- `/` y `/granja-elancla` → sin cambios respecto de hoy. **La TV actual de El
  Ancla apunta a `/`** (ver `app/page.tsx`), no a `/granja-elancla`; las dos
  rutas aceptan `?rubro=`.
- `/granja-elancla?rubro=cerdo` → listas que tengan al menos un producto
  CERDO, con solo esos productos; ofertas activas del bloque CERDO.
- `?rubro=res` y `?rubro=vacuno` → mismo resultado.
- `?rubro=cerdo,pollo` → unión de los dos rubros.
- `?rubro=` vacío o solo comas → se trata como sin filtro.
- Rubro inexistente (`?rubro=cerdp`) → no hay listas ni ofertas → la pantalla
  muestra el empty state existente (`tenant.textos.sinDatos`). Se detecta al
  instalar, porque el link lo arma el instalador.
- Bloque de ofertas sin super-header → sus ofertas quedan sin rubro.
- Lista sin columna Categoria/Rubro → sus productos quedan sin rubro.
- Rotación, plantillas, header, footer, atenuado: sin cambios. No se muestra
  el nombre del rubro en pantalla.
- Reload periódico (`window.location.reload()`) y watchdog del SW
  (`client.navigate(client.url)`) conservan el query string: verificado en
  `components/PantallaRotativa.tsx` y `public/sw.js`.
- **Rubro con ofertas pero sin productos en listas** (ej. un rubro que solo
  tiene ofertas): hoy el reducer de rotación arranca en modo `tabla` y vuelve
  a `tabla` después del último cartel aunque no haya listas, lo que mostraría
  el empty state ("Estamos actualizando…") entre ofertas. Con filtro por rubro
  este caso pasa a ser normal, así que se corrige: **si no hay listas, la
  pantalla queda solo en modo cartel** (arranca en cartel y rota entre
  ofertas). El caso inverso (listas sin ofertas) ya funciona.
- Rutas `vistaCartel` / `vistaLista`: `?index=N` se aplica sobre los datos ya
  filtrados (`?rubro=cerdo&index=0` = primera oferta de cerdo).
- Service Worker sin red: si la URL con `?rubro=` nunca se cacheó, el
  fallback existente sirve `/` cacheado (todos los rubros). Solo pasa si la
  TV arranca sin internet la primera vez; se acepta.
- La API pública (`/api/<slug>/productos|ofertas`) no filtra, pero su JSON
  suma el campo `rubro` en productos y ofertas (cambio aditivo). Se actualiza
  `docs/api.md`.
- El manifest PWA (`start_url: /<slug>`) no lleva rubro. No afecta al Fire TV,
  que abre el link directo en Silk; queda anotado por si algún día se instala
  como PWA.

## Diseño técnico

### `lib/rubros.ts` (nuevo, puro, testeado)

- `normalizarRubro(raw: string): string | null` — trim, minúsculas, sin
  acentos, colapsa espacios; aplica alias (`res` → `vacuno`). Vacío → `null`.
- `parseRubrosParam(raw: string | string[] | undefined): Set<string> | null` —
  separa por coma, normaliza, descarta vacíos. Sin rubros válidos → `null`
  (= sin filtro). Si llega un array (param repetido), usa todos los valores.
- `filtrarPorRubro(data, rubros)` — recibe `{ listas, ofertas }` y el set (o
  `null`). Con `null` devuelve lo mismo. Con set: productos cuyo `rubro` está
  en el set, listas sin productos se descartan; ofertas cuyo `rubro` está en
  el set. Sin rubro = no pasa el filtro.

`quitarAcentos` (hoy privada en `lib/sheets.ts`) se mueve a `lib/rubros.ts`
y se exporta; `lib/sheets.ts` la importa de ahí. Así no se duplica y queda
testeable (`lib/sheets.ts` es `server-only` y no se testea directo).

Los tests corren con `node --test` sin bundler: `lib/rubros.ts` solo puede
importar tipos con `import type` (el alias `@/` no se resuelve en runtime),
igual que `lib/plantillas.ts`.

### Rotación (`lib/rotacion.ts`, nuevo)

`rotationReducer` y su estado inicial salen de
`components/PantallaRotativa.tsx` a `lib/rotacion.ts` para poder testearlos.
Cambios de comportamiento:
- `listasCount === 0 && ofertasCount > 0` → modo `cartel` siempre (inicial y
  en cada tick, rotando `cartelIndex`).
- Estado inicial: `tabla` si hay listas, `cartel` si no.
El resto del reducer queda igual.

### Tipos (`types/index.ts`)

- `Producto.rubro?: string` (ya normalizado).
- `Oferta.rubro?: string` (ya normalizado).

### Parseo (`lib/sheets.ts`, luego `lib/planilla.ts`)

> **Addendum post-implementación (05/10):** toda la interpretación del CSV
> se movió de `lib/sheets.ts` a `lib/planilla.ts` (`parsearListas`,
> `parsearOfertas`, `parsearConfig`) para poder testearla con
> `node --test` (`lib/planilla.test.ts`, 16 tests). `lib/sheets.ts` quedó
> con URLs, fetch y manejo de errores. La lógica descripta abajo vive ahora
> en `lib/planilla.ts`. Salida verificada idéntica a producción.

- **Listas:** para cada offset de tabla (`nombre|precio|unidad`), si la celda
  del header en `offset - 1` normalizada es `categoria` o `rubro`, cada
  producto toma `rubro = normalizarRubro(row[offset - 1])`.
- **Ofertas:** buscar la fila inmediatamente anterior al header de ofertas
  (super-header). Para cada bloque, el rubro es la primera celda no vacía
  yendo hacia la izquierda desde `offset` hasta el offset del bloque anterior
  (mismo algoritmo que ya usan los títulos de las listas).

### Páginas

`app/page.tsx`, `app/[tenant]/page.tsx`, `app/[tenant]/vistaCartel/page.tsx`,
`app/[tenant]/vistaLista/page.tsx`: leen `searchParams` (en Next 16 es una
`Promise`), calculan `parseRubrosParam(rubro)` y aplican `filtrarPorRubro`
sobre el resultado de `getPantallaData` antes de pasarlo a
`PantallaRotativa`. `getPantallaData` no cambia de firma.

## Testing

`lib/rubros.test.ts` con `node --test`:
- normalización: mayúsculas, acentos, espacios, alias RES→VACUNO, vacío.
- parseo del param: undefined, vacío, una coma, varios, array, repetidos.
- filtro: `null` devuelve igual; lista mixta conserva solo los del rubro;
  lista sin coincidencias se descarta; sin rubro no pasa; ofertas por rubro;
  unión de dos rubros.

`lib/rotacion.test.ts`:
- tabla→cartel→tabla con listas y ofertas (comportamiento actual intacto).
- solo listas: rota entre listas.
- solo ofertas: arranca en cartel y nunca pasa a tabla.

Validación manual: `tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`,
y contra `npm start` con el demo: `/demo`, `/demo?rubro=cerdo`,
`/demo?rubro=res`, `/demo?rubro=cerdo,pollo`, `/demo?rubro=cerdp`,
`/` y `/granja-elancla` sin param idénticos a producción,
`/granja-elancla?rubro=cerdo` con datos reales.

**Precondición del demo:** en la planilla del demo la columna Categoria dice
RES y **GRANJA** (cerdo y pollo están como GRANJA). Hasta corregirla a
CERDO / POLLO, `/demo?rubro=cerdo` muestra las ofertas de cerdo pero ninguna
lista. Corregirla antes de validar y antes de mostrar el demo dividido por
rubro.

## Fuera de alcance

- Activación de pantallas (etapa 2, spec aparte).
- Filtro por rubro en `/api/<slug>/...`.
- Mostrar el nombre del rubro en pantalla.
- Cambios en la planilla modelo (VACUNO en Categoria, desplegable): los hace
  el usuario, fuera del repo.

## Operación

- El Ancla no abre el lunes 05/10: el push puede salir ese día. Sin `?rubro=`
  la TV actual sigue idéntica, así que el riesgo de deploy es bajo igual.
- Para dividir una tele por rubro: cambiar el link de esa tele a
  `/<slug>?rubro=<rubro>`.
- Planilla de El Ancla, verificada contra el CSV publicado el 05/10: ofertas
  con super-headers `RES` / `CERDO` / `POLLO` sobre la columna `titulo`;
  listas con `Categoria` a la izquierda de `Nombre` y valores RES / CERDO /
  POLLO. Funciona sin tocarla.
- Planilla modelo: los super-headers de ofertas dicen `RUBRO 1` / `RUBRO 2` /
  `RUBRO 3`. Renombrarlos a VACUNO / CERDO / POLLO (o el rubro del cliente);
  si no, el rubro de esas ofertas sería literalmente "rubro 1".
