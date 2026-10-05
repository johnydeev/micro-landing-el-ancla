# Cartelería de precios

Cartelería digital para comercios de barrio: una pantalla que rota entre la lista de precios y los carteles de ofertas, corriendo 24/7 en un Fire TV colgado en el local. Un solo deploy sirve a varios comercios, cada uno en su propia URL, con su paleta, sus textos y su planilla.

**[Ver la pantalla en vivo →](https://precios-el-ancla.vercel.app/)** (Granja El Ancla, el primer cliente) · **[Demo →](https://precios-el-ancla.vercel.app/demo)** (comercio ficticio, para mostrar el producto)

![Pantalla de precios: tabla de precios y cartel de oferta](docs/img/pantalla.png)

<sub>Los dos modos entre los que rota la pantalla: tabla de precios (izquierda) y cartel de superoferta (derecha). Datos reales de la planilla del cliente.</sub>

---

## El problema

Granja El Ancla (Florencio Varela, desde 1984) mostraba sus precios en carteles impresos. Cada cambio de precio implicaba imprimir de nuevo, y en un rubro donde los valores se mueven seguido, los carteles quedaban desactualizados o directamente desaparecían.

El requisito real era más exigente que "hacer una landing":

- **Quien carga los precios no es técnico.** Tenía que poder actualizar desde algo que ya usa: una planilla de Google Sheets.
- **La pantalla no tiene teclado ni alguien que la atienda.** Corre en un Fire TV, sobre el navegador Silk, sin que nadie la mire durante horas. Si se cuelga, se queda colgada hasta que alguien lo note.
- **El costo tiene que ser cero.** Es un comercio de barrio: la solución no puede generar una factura mensual.

Todo lo que sigue son decisiones tomadas contra esas tres restricciones. Después del primer cliente apareció la cuarta: **el mismo deploy tiene que servir al siguiente comercio sin volver a armar nada.**

---

## Cómo funciona

```
Google Sheets del comercio (publicado como CSV)        Cloudinary (catálogo de imágenes)
        │                                                        │
        │  3 fetch en paralelo (productos · ofertas · config)     │  URL por slug, transformada al vuelo
        ▼                                                        ▼
Server Component  app/[tenant]/page.tsx  →  getPantallaData(tenant)
        │
        │  props del primer render (SSR)
        ▼
Client Component  PantallaRotativa.tsx
        │
        ├── templates/tabla/Clasica.tsx      (lista de precios)
        └── templates/cartel/<plantilla>.tsx (cartel de oferta, elegible por oferta desde la planilla)

Service Worker  ──  watchdog anti-freeze + cache network-first (incluye Cloudinary)
```

El dueño del negocio agrega una fila en la planilla y la oferta aparece en pantalla en la próxima recarga. No toca código, no entra a un panel, no hay deploy.

La planilla no trae solo datos: una pestaña `configuracion` controla el comportamiento de la pantalla — segundos de cartel, segundos de tabla, horarios de atenuado, horarios de atención, WhatsApp e Instagram del local. Cambiar el ritmo de la rotación es editar una celda.

Cada comercio vive en `/<slug>` (`/granja-elancla`). Su configuración —nombre, paleta, textos, GIDs de la planilla— está en `tenants/<slug>.ts`. La URL de su CSV, que da acceso a toda la planilla, está en una variable de entorno y no en el repo.

---

## Decisiones técnicas

Las que más definieron el proyecto. Cada una está documentada con su alternativa descartada en [`docs/decisiones.md`](docs/decisiones.md) y el [`CHANGELOG.md`](CHANGELOG.md).

### 1. Watchdog en el Service Worker, no en el main thread

Un kiosko que corre días enteros en hardware limitado termina congelándose: el main thread se muere y la pantalla queda con datos viejos, sin que nadie se entere.

La primera versión detectaba el freeze desde el propio main thread. No servía: **cualquier mecanismo en el main thread es inútil si el thread está muerto.**

La solución fue mover el watchdog al Service Worker, que corre en otro thread. Si deja de recibir señales de vida de la página, fuerza la recarga desde afuera. A eso se suma un reload preventivo cada 30 minutos que limpia memoria y listeners acumulados.

### 2. Polling eliminado: −99,4% de requests

La versión original consultaba Sheets periódicamente: **~4.320 requests por día**. Reemplazar el polling por recargas programadas lo bajó a **~25 requests diarios**, sin perder frescura de datos para el caso de uso real (los precios cambian algunas veces por día, no cada 20 segundos).

### 3. Imágenes en Cloudinary, con un catálogo universal

Las fotos de producto vivieron primero en el repo, con un pipeline propio de compresión (`sharp` en `prebuild`, un hook `pre-commit` y un workflow de GitHub Actions). Funcionaba, pero eran cuatro mecanismos para cuidar archivos de un solo cliente, y no escalaba a varios comercios subiendo imágenes.

Hoy todas las imágenes están en Cloudinary, en un **catálogo con nomenclatura universal** (`asado-de-tira`, `pollo-entero`) compartido por todos los clientes. La app arma la URL con `f_auto,q_auto,w_1200` y Cloudinary entrega WebP/AVIF al ancho justo — mejor que lo que hacía el pipeline, sin código propio. El repo no tiene PNGs salvo el favicon. `next/image` sigue descartado: consume cuota en la capa gratuita de Vercel.

### 4. Sin cache: el precio que ves es el precio de ahora

La pantalla usaba ISR (`revalidate = 60`) hasta que apareció la pregunta que importaba: *"si corrijo un precio y aprieto actualizar, ¿lo toma?"*. Con stale-while-revalidate, no.

Hoy corre con `export const dynamic = 'force-dynamic'` y los fetch en `cache: 'no-store'` con parámetro anti-cache. Cada recarga trae precios frescos.

**Trade-off aceptado y documentado:** sin ISR no hay última-versión-buena. Si Google Sheets falla, los lectores devuelven `[]` y la pantalla muestra el empty state hasta la próxima recarga (hasta 30 minutos). Se evaluó un fallback en `localStorage` y el cliente lo descartó: para este caso de uso, mostrar un precio viejo es peor que no mostrar nada.

### 5. Multitenant por path, sin SaaS

Para el segundo cliente había tres caminos: un deploy por comercio, un SaaS con registro y panel, o un solo deploy con N comercios por path. Se eligió el tercero: `carteleria.vercel.app/<slug>`, un archivo tipado por comercio en `tenants/`, y las URLs de las planillas en variables de entorno. Sin auth, sin base de datos, sin panel. El alta de un cliente es un archivo, una variable y un logo.

Los diseños son un **catálogo de plantillas**: hoy una tabla y un cartel, sin colores fijos (todo entra por CSS variables desde la paleta del comercio). Cada oferta puede elegir su plantilla de cartel desde un desplegable en la planilla; si no elige, usa la default del comercio.

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| UI | React 19, Tailwind CSS 4 |
| Lenguaje | TypeScript |
| Datos | Google Sheets publicado como CSV, una planilla por comercio |
| Imágenes | Cloudinary (catálogo universal, transformaciones por URL) |
| Offline / resiliencia | Service Worker (network-first + watchdog), PWA por comercio |
| Tests | `node --test` (sin dependencias) |
| CI | GitHub Actions: tipos + lint + tests + build en cada push |
| Deploy | Vercel |

---

## Estructura

```
app/
  page.tsx           "/" renderiza el comercio DEFAULT_TENANT
  [tenant]/          pantalla, rutas de dev, manifest PWA y error/loading por comercio
  api/[tenant]/      /api/<slug>/productos | ofertas | config
tenants/             un archivo por comercio + registro
templates/           catálogo de diseños: tabla/ y cartel/
components/          PantallaRotativa (rotación, reload, watchdog), Header, Footer, overlays
lib/                 lectura y parseo de los CSV, URLs de Cloudinary, helpers del alta; todo testeado
scripts/             `npm run alta`: alta de cliente desde la terminal
types/               tipos compartidos (Oferta, Tenant, …)
docs/                bitácora de implementación, decisiones técnicas, specs, planes y el pitch de venta
.github/workflows/   CI
```

---

## Desarrollo local

```bash
npm install
cp .env.local.example .env.local   # completar cloud name y la URL del CSV
npm run dev
```

Variables de entorno (ver [`.env.local.example`](.env.local.example)):

| Variable | Para qué |
|---|---|
| `DEFAULT_TENANT` | Slug del comercio que se sirve en `/` |
| `NEXT_PUBLIC_DEFAULT_TENANT` | Mismo valor, para el error boundary de `/` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloud name de Cloudinary |
| `NEXT_PUBLIC_CLOUDINARY_CATALOGO` | Carpeta base del catálogo (`catalogo-comun`, plana; el rubro va como tag) |
| `TENANT_<SLUG>_CSV_URL` | Una por comercio: URL del CSV publicado de su planilla |

Scripts:

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm test        # node --test sobre lib/ y tenants/
npm run lint
npm run alta    # alta de un cliente (ver abajo)
```

Rutas de desarrollo: `/<slug>/vistaLista?index=N` y `/<slug>/vistaCartel?index=N` fijan la pantalla en un modo sin rotación.

---

## Alta de un cliente

Probado de punta a punta el 01/10/2026 con el comercio de muestra (`/demo`).
Lleva unos 20 minutos. Los pasos 1 a 4 son manuales; el 5 lo hace el script.

### 1. La planilla del cliente

1. Abrir el link de copia de la planilla modelo y nombrarla "Precios \<Comercio>".
2. Cargar las 4 pestañas: `Tablas de Precios`, `Ofertas`, `Configuracion`,
   `Precios`. Si tenés los datos en archivos, es más rápido
   **Archivo → Importar → Subir → Reemplazar hoja actual**, una pestaña por vez
   (ojo: pararse en la pestaña correcta antes de importar, porque reemplaza la
   que esté a la vista). Google filtra por `.csv` en ese diálogo: si tenés
   `.tsv`, convertilos antes.
3. En `_catalogo`, pegar el `IMPORTRANGE` al catálogo maestro y apretar
   "Permitir acceso". Ocultar esa hoja.
4. **Archivo → Compartir → Publicar en la web → Todo el documento → CSV →
   Publicar.** Copiar la URL (`…/pub?output=csv`).

### 2. Verificar los slugs de imagen

Cada valor de `slug imagen` tiene que existir en Cloudinary. **No alcanza con
abrir la URL de la imagen**: por `d_placeholder` y por la caché del CDN, un slug
inexistente o borrado puede devolver 200 igual. Se verifica con la Admin API
(`npm run verificar` en el repo del catálogo).

Si un slug no existe, el cartel sale con el placeholder gris — no rompe nada,
pero se ve mal en una demo.

### 3. El logo

Subirlo a Cloudinary como `logos/<slug>`. Dos cosas que confunden:

- La **carpeta** de la Media Library (`asset_folder`) no forma parte del
  `public_id`. Mover el archivo a la carpeta `logos` no alcanza.
- El **Display name** tampoco es el `public_id`. Hay que editar el public_id
  propiamente dicho.

Verificar: `https://res.cloudinary.com/<cloud>/image/upload/logos/<slug>` tiene
que dar 200.

### 4. Secretos en `.env.local` (una sola vez, no por cliente)

`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `VERCEL_TOKEN`,
`VERCEL_PROJECT_ID` (ver `.env.local.example`). Sin comillas, como el resto del
archivo. El token de Vercel conviene con expiración larga: con 1 día hay que
rehacerlo en cada alta.

### 5. `npm run alta`

Pregunta nombre, slug, eslogan, dos colores, badge, contactos, la URL de la
planilla y la ruta del logo (vacío si ya lo subiste). Con eso:

- lee `/pubhtml` de la planilla y **resuelve los gids solo** (busca las pestañas
  "ofertas" y "config" por nombre);
- sube el logo a Cloudinary como `logos/<slug>`;
- escribe `tenants/<slug>.ts` y lo registra en `tenants/index.ts`;
- crea `TENANT_<SLUG>_CSV_URL` en Vercel y en tu `.env.local`;
- corre `npm test`.

Flags: `--force` (sobreescribir un tenant), `--sin-logo`, `--sin-vercel`.
Acepta respuestas por pipe: `npm run alta < cliente.txt`.

La paleta completa se deriva de los dos colores; `tenants/<slug>.ts` queda
editable a mano.

### 6. Commit y push

**Fuera del horario de atención de los comercios que ya están en producción**:
el push redeploya para todos, y sus pantallas recargan dentro de los 30 minutos.
Son 1-2 segundos de interrupción, pero mejor evitarlos con público en el local.

Después del deploy, verificar `<dominio>/<slug>`. Si no ves el cambio en tu
navegador, **Ctrl+F5**: el CSS y el HTML viejos quedan cacheados.

### Si cambiás el slug de un tenant existente

El nombre de la variable de entorno se deriva del slug, así que cambia también
(`TENANT_<SLUG_NUEVO>_CSV_URL`). **Primero la variable en Vercel, después el
push.** Al revés, la ruta nueva queda sin datos hasta que la cargues.

Un **Redeploy** en Vercel no trae código nuevo: solo rehace el build del commit
que ya estaba desplegado. Para que salga un cambio del repo hay que pushear.

## Estado

En producción desde mayo de 2026 con Granja El Ancla, corriendo todos los días en el local. Desde octubre de 2026 el mismo deploy sirve también el comercio de muestra en `/demo`.

**Lo que falta no es técnico: es vender.** El producto está listo para ofrecer —
hay un caso real andando, un demo publicado y el alta de un cliente nuevo es un
checklist de 20 minutos. El material para ofrecerlo está en
[`docs/pitch-venta.md`](docs/pitch-venta.md).

Pendientes conocidos:

- Validar el watchdog en el navegador Silk real del Fire TV (hoy probado en Chrome de escritorio). Es lo único que nunca se probó en el hardware de verdad.
- Medir la latencia de publicación del CSV de Google (`/pub`) si el cliente nota demora al actualizar precios.
- Dominio genérico: todo vive bajo `precios-el-ancla.vercel.app`, que es el nombre del primer cliente. Se agrega uno nuevo en Vercel → Domains cuando entre el primer cliente pago, **sin borrar el viejo** (la TV de El Ancla apunta ahí).
- Limpiezas del alta del demo, opcionales: borrar `TENANT_CARNICERIA_SAN_MARTIN_CSV_URL` de Vercel y renombrar el logo a `logos/demo` (hoy sigue como `logos/carniceria-san-martin`; funciona igual).

Lo que probablemente aparezca cuando haya clientes: más plantillas de cartel
(hoy hay una sola, y es el diferencial visual más barato de construir) y fotos
de otros rubros en el catálogo, si se vende a almacén o verdulería.

---

Desarrollado por [Jonathan Castro](https://www.linkedin.com/in/johnydeev/) · [Portfolio](https://castro-jonathan-portfolio.vercel.app)
