# API HTTP — micro-landing-el-ancla

Estos handlers existen como **API pública del proyecto**. La página
principal (`app/page.tsx`) ya no los consume — desde el refactor de
sesión 1 lee los CSVs directamente vía `lib/sheets.ts` en el Server
Component. Los handlers se mantienen para que terceros puedan reusar
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

Todos retornan **JSON** y son **GET** públicos (sin autenticación).
Reusan la cache de `fetch` del Server Component (`revalidate: 60`):
las llamadas a Google Sheets se hacen como mucho una vez por minuto
por instancia.

### `GET /api/productos`

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

- El array está vacío (`[]`) si falta `GOOGLE_SHEETS_CSV_URL`, si el
  CSV está mal formado, o si no se encuentran filas de encabezado con
  el patrón esperado (`nombre`, `precio`, `unidad`).
- `precio` es siempre **string**, tal como vino del Sheets. El
  formateo (`$1.500`) corre por cuenta del consumidor. Ver
  `formatPrecio` en `components/PantallaRotativa.tsx` para la
  convención aplicada por la pantalla principal.
- Se soportan múltiples listas por hoja, detectadas por bloques de
  encabezado repetidos.

### `GET /api/ofertas`

Devuelve las ofertas activas desde la pestaña con `gid =
GOOGLE_SHEETS_GID_OFERTAS`.

**Response:**

```json
[
  {
    "nombre": "Asado x 5kg",
    "precio": "18000",
    "imagen": "asado",
    "estado": "ACTIVO"
  }
]
```

**Notas:**

- Solo se devuelven ofertas con `estado === "ACTIVO"`. Las
  `"INACTIVO"` se filtran en el servidor.
- `imagen` es el **slug del PNG** dentro de `public/ofertas/`. La
  pantalla principal lo usa como `/ofertas/{slug}.png`.
- Si falta `GOOGLE_SHEETS_GID_OFERTAS` o el CSV no contiene la fila de
  encabezado esperada (`titulo`, `precio`, `slug imagen`, `estado`),
  devuelve `[]`.

### `GET /api/config`

Devuelve la configuración remota desde la pestaña con `gid =
GOOGLE_SHEETS_GID_CONFIG`.

**Response:**

```json
{
  "segundosCartel": 6,
  "segundosTabla": 3,
  "minutosActualizacion": 1,
  "horarios": "MAR a SAB: 8:15 a 13hs y 16:30 a 20:15hs",
  "whatsapp": "11 6000 7394",
  "instagram": "@granja_elancla"
}
```

**Notas:**

- Cualquier clave puede faltar — la pantalla principal hace
  `configRemota.x ?? negocioConfig.x` y cae al default local
  (`config/negocio.ts`).
- Las claves numéricas (`segundosCartel`, `segundosTabla`,
  `minutosActualizacion`) se parsean a número. Si el CSV trae un
  string no numérico para esas claves, se ignoran.
- Las claves se aceptan con varias variantes (mayúsculas, con
  acentos, sinónimos en español). Ver `CONFIG_ALIASES` en
  `lib/sheets.ts`.
- Si faltan `GOOGLE_SHEETS_CSV_URL` o `GOOGLE_SHEETS_GID_CONFIG`,
  devuelve `{}`.

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
