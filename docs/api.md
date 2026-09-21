# API HTTP — micro-landing-el-ancla

Estos handlers existen como **API pública del proyecto**. La página
principal (`app/[tenant]/page.tsx`) no los consume — lee los CSVs
directamente vía `lib/sheets.ts` en el Server Component. Los handlers se mantienen para que terceros puedan reusar
los datos sin reimplementar el parser CSV.

Casos de uso esperados:

- Una segunda pantalla en otra ubicación del local que comparte la
  misma planilla.
- Un widget embebido en otro sitio (la web institucional del cliente,
  un Linktree, etc.).
- Scripts de monitoreo que verifican que los CSVs siguen siendo
  parseables.

Si en el futuro nada de esto se materializa, los handlers pueden
borrarse sin afectar la pantalla principal. Ver `docs/decisiones.md`
si se toma esa decisión.

---

## Endpoints

Todos van bajo **`/api/<tenant>/…`**, donde `<tenant>` es el slug del
comercio en `tenants/index.ts` (ej. `/api/granja-elancla/ofertas`). Slug
desconocido → **404**. Cada tenant lee su propia planilla
(`TENANT_<SLUG>_CSV_URL` + los GIDs de `tenants/<slug>.ts`).

Todos retornan **JSON** y son **GET** públicos (sin autenticación).
Desde sesión 19 **no hay cache**: cada llamada relee el CSV de Google
(`cache: 'no-store'` + parámetro anti-cache en la URL). Antes reusaban la
cache de `fetch` con `revalidate: 60`. Si alguien monta un consumidor con
volumen, conviene que cachee del lado de él — acá no hay nada que lo
proteja de pegarle a Google en cada request. Ver `docs/decisiones.md`.

### `GET /api/<tenant>/productos`

Devuelve las listas de precios parseadas desde la pestaña principal
del Sheets.

**Response:**

```json
[
  {
    "titulo": "POLLO",
    "productos": [
      { "nombre": "Pollo entero", "precio": "3500", "unidad": "kg" },
      { "nombre": "Pechuga", "precio": "5200", "unidad": "kg" }
    ]
  },
  {
    "titulo": "CERDO",
    "productos": [
      { "nombre": "Bondiola", "precio": "6800", "unidad": "kg" }
    ]
  }
]
```

**Notas:**

- El array está vacío (`[]`) si falta `TENANT_<SLUG>_CSV_URL`, si el
  CSV está mal formado, o si no se encuentran filas de encabezado con
  el patrón esperado (`nombre`, `precio`, `unidad`).
- `precio` es siempre **string**, tal como vino del Sheets. El
  formateo (`$1.500`) corre por cuenta del consumidor. Ver
  `formatPrecio` en `components/PantallaRotativa.tsx` para la
  convención aplicada por la pantalla principal.
- Se soportan múltiples listas por hoja, detectadas por bloques de
  encabezado repetidos.

### `GET /api/<tenant>/ofertas`

Devuelve las ofertas activas desde la pestaña con `gid =
tenant.sheets.gidOfertas`.

**Response:**

```json
[
  {
    "nombre": "Asado x 5kg",
    "precio": "18000",
    "imagen": "asado",
    "estado": "ACTIVO",
    "tamano": 3,
    "descripcion": "Solo efectivo",
    "plantilla": "clasico"
  }
]
```

**Notas:**

- Solo se devuelven ofertas con `estado === "ACTIVO"`. Las
  `"INACTIVO"` se filtran en el servidor.
- `imagen` es el **id de la imagen en el catálogo de Cloudinary**
  (`catalogo-comun/<slug>`), compartido por todos los comercios. La pantalla lo
  usa como `https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,w_1200,d_placeholder.png/catalogo-comun/<slug>`.
  Si el slug no existe, Cloudinary sirve una imagen placeholder.
- `tamano` es un entero **1-10** que controla el tamaño de la imagen
  dentro del cartel (1 = más chica = 55%, 10 = más grande = 120%).
  Default `6` (=91%). Es opcional en el Sheets: si falta la columna o
  el valor es inválido (no entero, fuera de rango 1-10), se aplica `6`.
  Mapeo lineal (paso ~7%): 1=55%, 2=62%, 3=69%, 4=77%, 5=84%, 6=91%,
  7=98%, 8=106%, 9=113%, 10=120%. **Nota**: valores 8-10 superan el
  100%, la imagen excede su contenedor y puede solaparse con el título
  o el precio — usar esos valores solo en imágenes que lo toleren.
- `descripcion` es una **aclaración/condición corta de la oferta** (ej.
  "Solo efectivo", "Válido de lunes a viernes") — **no** una descripción
  del producto. Se muestra en un badge debajo de "SUPER OFERTA". Columna
  opcional (alias aceptados: `descripcion`, `aclaracion`, `condicion`,
  `detalle`, `nota`), posicionada después de `tamaño` si esa columna
  existe, o después de `estado` si no. Si falta o está vacía, el string
  es `""` y el badge no se renderiza. Cada coma en el valor se muestra
  como salto de línea explícito en el cartel.
- `plantilla` es el **id del diseño de cartel** elegido para esa oferta
  (columna opcional; alias aceptados: `plantilla`, `diseño`, `diseno`,
  `template`; posición libre en las 4 celdas después de `estado`). El
  valor se normaliza (minúsculas, sin acentos, espacios → guiones) y se
  valida contra `PLANTILLAS_CARTEL` en `lib/plantillas.ts` (hoy solo
  `clasico`). Si falta la columna, está vacía o el valor no existe, la
  clave **se omite** del JSON y la pantalla usa
  `tenant.plantillaCartelDefault`.
- Si falta `TENANT_<SLUG>_CSV_URL` o el CSV no contiene la fila de
  encabezado esperada (`titulo`, `precio`, `slug imagen`, `estado`),
  devuelve `[]`. Las columnas `tamaño`/`escala`/`size`,
  `descripcion`/`aclaracion`/`condicion`/`detalle`/`nota` y
  `plantilla`/`diseño`/`template` son **opcionales** — ver
  `docs/decisiones.md` para los nombres aceptados.

### Atenuado de pantalla por horario (config)

La pestaña CONFIG soporta dos claves opcionales para atenuar la
pantalla en un rango horario (formato 24hs, `"HH"` o `"HH:MM"`):

| Clave (alias aceptados) | Ejemplo | Descripción |
|---|---|---|
| `atenuar desde` / `inicio atenuado` | `13` o `13:00` | Hora en que empieza el atenuado |
| `atenuar hasta` / `fin atenuado` | `16` o `16:00` | Hora en que termina el atenuado |

Si falta cualquiera de las dos, o el formato es inválido, la
atenuación queda **desactivada**. Soporta rangos que cruzan
medianoche (ej. `23` a `6`). Ver `components/DimOverlay.tsx` y la
nota sobre ahorro de energía en `docs/decisiones.md`.

### `GET /api/<tenant>/config`

Devuelve la configuración remota desde la pestaña con `gid =
tenant.sheets.gidConfig`.

**Response:**

```json
{
  "segundosCartel": 6,
  "segundosTabla": 3,
  "horarios": "MAR a SAB: 8:15 a 13hs y 16:30 a 20:15hs",
  "whatsapp": "11 6000 7394",
  "instagram": "@granja_elancla"
}
```

**Notas:**

- Cualquier clave puede faltar — la pantalla principal hace
  `configRemota.x ?? tenant.defaults.x` y cae al default del comercio
  (`tenants/<slug>.ts`).
- Las claves numéricas (`segundosCartel`, `segundosTabla`) se parsean
  a número. Si el CSV trae un string no numérico para esas claves, se
  ignoran.
- `minutosActualizacion` **ya no existe** (removida en sesión 20; sin
  efecto desde sesión 10). Si la planilla todavía tiene la fila, se
  ignora como cualquier clave desconocida.
- Las claves se aceptan con varias variantes (mayúsculas, con
  acentos, sinónimos en español). Ver `CONFIG_ALIASES` en
  `lib/sheets.ts`.
- Si falta `TENANT_<SLUG>_CSV_URL` o `tenant.sheets.gidConfig`, devuelve
  `{}`.

---

## CORS

Los handlers no setean `Access-Control-Allow-Origin`. Si en el futuro
se usan desde un dominio distinto al del deploy, hay que agregar el
header en cada `Response.json(...)` o en un middleware.

---

## Versionado

No hay versionado formal de estos endpoints. Cualquier breaking change
(cambio de shape del JSON, ej. renombrar `imagen` a `slug`) debe
documentarse en `CHANGELOG.md` bajo `### Breaking` y comunicarse a
quien esté consumiendo. Hoy no hay consumidores conocidos.
