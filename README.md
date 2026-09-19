# micro-landing El Ancla

Cartelería digital para una carnicería: una pantalla que rota entre la lista de precios y los carteles de ofertas, corriendo 24/7 en un Fire TV colgado en el local.

**[Ver la pantalla en vivo →](https://precios-el-ancla.vercel.app/)**

<!-- TODO: reemplazar por una captura real de la pantalla (o un GIF de la rotación).
     Es lo primero que mira cualquiera que entra al repo.
![Pantalla de precios](docs/img/pantalla.png)
-->

---

## El problema

Granja El Ancla (Florencio Varela, desde 1984) mostraba sus precios en carteles impresos. Cada cambio de precio implicaba imprimir de nuevo, y en un rubro donde los valores se mueven seguido, los carteles quedaban desactualizados o directamente desaparecían.

El requisito real era más exigente que "hacer una landing":

- **Quien carga los precios no es técnico.** Tenía que poder actualizar desde algo que ya usa: una planilla de Google Sheets.
- **La pantalla no tiene teclado ni alguien que la atienda.** Corre en un Fire TV, sobre el navegador Silk, sin que nadie la mire durante horas. Si se cuelga, se queda colgada hasta que alguien lo note.
- **El costo tiene que ser cero.** Es un comercio de barrio: la solución no puede generar una factura mensual.

Todo lo que sigue son decisiones tomadas contra esas tres restricciones.

---

## Cómo funciona

```
Google Sheets (publicado como CSV)
        │
        │  3 fetch en paralelo (productos · ofertas · config)
        ▼
Server Component  app/page.tsx  →  getPantallaData()
        │
        │  props del primer render (SSR)
        ▼
Client Component  PantallaRotativa.tsx
        │
        └── rota tabla de precios ⇄ cartel de oferta cada 3-12 s (configurable desde la planilla)

Service Worker  ──  watchdog anti-freeze + cache network-first
```

El dueño del negocio agrega una fila en la planilla y la oferta aparece en pantalla en la próxima recarga. No toca código, no entra a un panel, no hay deploy.

La planilla no trae solo datos: una pestaña `configuracion` controla el comportamiento de la pantalla — segundos de cartel, segundos de tabla, minutos de actualización, horarios de atención, WhatsApp e Instagram del local. Cambiar el ritmo de la rotación es editar una celda.

---

## Decisiones técnicas

Las cuatro que más definieron el proyecto. Cada una está documentada con su alternativa descartada en [`docs/progreso.md`](docs/progreso.md) y el [`CHANGELOG.md`](CHANGELOG.md).

### 1. Watchdog en el Service Worker, no en el main thread

Un kiosko que corre días enteros en hardware limitado termina congelándose: el main thread se muere y la pantalla queda con datos viejos, sin que nadie se entere.

La primera versión detectaba el freeze desde el propio main thread. No servía: **cualquier mecanismo en el main thread es inútil si el thread está muerto.**

La solución fue mover el watchdog al Service Worker, que corre en otro thread. Si deja de recibir señales de vida de la página, fuerza la recarga desde afuera. A eso se suma un reload preventivo cada 30 minutos que limpia memoria y listeners acumulados.

### 2. Polling eliminado: −99,4% de requests

La versión original consultaba Sheets periódicamente: **~4.320 requests por día**. Reemplazar el polling por recargas programadas lo bajó a **~25 requests diarios**, sin perder frescura de datos para el caso de uso real (los precios cambian algunas veces por día, no cada 20 segundos).

### 3. Sin `next/image`, con compresión propia en CI

`next/image` optimiza imágenes en Vercel, pero esa optimización tiene cuota en el plan gratuito. Para un proyecto que tiene que costar $0 de forma indefinida, la dependencia era un riesgo a futuro.

En su lugar hay dos capas propias de compresión: un script de optimización con **Sharp** en el `prebuild`, y un workflow de **GitHub Actions** que comprime las imágenes que entran por commit. Resultado medido: 3,2 MB → 387 KB en las imágenes más pesadas.

### 4. Sin cache: el precio que ves es el precio de ahora

La pantalla usaba ISR (`revalidate = 60`) hasta que apareció la pregunta que importaba: *"si corrijo un precio y aprieto actualizar, ¿lo toma?"*. Con stale-while-revalidate, no.

Hoy corre con `export const dynamic = 'force-dynamic'` y los fetch en `cache: 'no-store'` con parámetro anti-cache. Cada recarga trae precios frescos.

**Trade-off aceptado y documentado:** sin ISR no hay última-versión-buena. Si Google Sheets falla, los lectores devuelven `[]` y la pantalla muestra el empty state hasta la próxima recarga (hasta 30 minutos). La mitigación con `localStorage` está identificada pero todavía no implementada — para este caso de uso, mostrar un precio viejo es peor que no mostrar nada.

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| UI | React 19, Tailwind CSS 4 |
| Lenguaje | TypeScript |
| Datos | Google Sheets publicado como CSV |
| Imágenes | Sharp (compresión en prebuild y en CI) |
| Offline / resiliencia | Service Worker (network-first + watchdog), PWA |
| CI | GitHub Actions |
| Deploy | Vercel |

---

## Estructura

```
app/               Server Components, páginas y API routes (/api/productos, /api/ofertas, /api/config)
components/        UI, con PantallaRotativa como componente central
lib/               Lectura y parseo de los CSV de Sheets
config/            Parámetros de la pantalla (tiempos de rotación, etc.)
scripts/           Optimización de imágenes
types/             Tipos compartidos
docs/              Bitácora de implementación y decisiones técnicas
.github/workflows/ CI: tests y compresión automática de imágenes
```

---

## Desarrollo local

```bash
npm install
cp .env.local.example .env.local   # completar con los datos de tu planilla
npm run dev
```

Variables de entorno (ver [`.env.local.example`](.env.local.example)):

| Variable | Para qué |
|---|---|
| `GOOGLE_SHEETS_CSV_URL` | CSV público de la pestaña de productos |
| `GOOGLE_SHEETS_GID_OFERTAS` | GID de la pestaña de ofertas |
| `GOOGLE_SHEETS_GID_CONFIG` | GID de la pestaña de configuración |

Scripts:

```bash
npm run dev               # desarrollo
npm run build             # build (corre optimize:images en prebuild)
npm run test              # node --test sobre scripts/
npm run optimize:images   # compresión con Sharp
```

---

## Estado

En producción desde [TODO: mes/año], corriendo todos los días en el local.

Pendientes conocidos:

- Validar el watchdog en el navegador Silk real del Fire TV (hoy probado en Chrome de escritorio).
- Verificar end-to-end el workflow de compresión de imágenes en CI.

---

Desarrollado por [Jonathan Castro](https://www.linkedin.com/in/johnydeev/) · [Portfolio](https://castro-jonathan-portfolio.vercel.app)
