# Optimización de imágenes automática — Spec

**Estado:** decisiones cerradas, listo para implementar.
**Fecha:** 2026-08-09 (decisiones cerradas 2026-08-10)
**Pedido original:** correr `scripts/optimize-images.mjs` una vez por día.

---

## 1. Estado actual

`scripts/optimize-images.mjs` corre en el hook `prebuild` de npm — o sea, en
cada `npm run build`, incluido cada deploy de Vercel.

- Procesa `public/ofertas/*.png` (resize 1200px + PNG compressionLevel 9)
  y `public/logo.png` (400px).
- Sobreescribe el archivo **solo si el resultado es más liviano**.
- Advierte si algo queda >500KB, pero **no falla el build**.

Peso actual: **4.94 MB** en `public/ofertas/`, todas ya optimizadas. Seis
archivos >300KB; el mayor `costillar.png` con 576KB (caso límite conocido y
aceptado — `sharp` no lo baja más sin pérdida visible).

No existe `.github/workflows/`. No hay CI ni suite de tests hoy.

---

## 2. Decisiones tomadas

| # | Decisión | Resuelto |
|---|---|---|
| 1 | ¿Trigger diario? | **No.** Descartado — ver §3 |
| 2 | ¿Qué hace con el resultado? | **Commit directo a `master`**, sin PR |
| 3 | ¿Tests? | **Sí**, agregar suite mínima |

---

## 3. Por qué se descartó el trigger diario

Las imágenes de `public/ofertas/` **solo cambian cuando alguien commitea una
imagen nueva**. No se suben por panel, no vienen del Sheets, no se generan en
runtime.

Un job diario encontraría trabajo únicamente el día en que se commiteó una
imagen — y ese día el trigger por `push` ya lo cubre. Las otras 364 corridas no
harían nada.

**Trigger elegido:** `push` a `master` que toque PNGs, más `workflow_dispatch`
(botón manual) para forzar una pasada.

---

## 4. Problema que esto sí resuelve

El script comprime en el contenedor efímero de Vercel. Vercel sirve la imagen
liviana ✓, pero **el resultado nunca vuelve al repo**.

Hoy el repo está limpio porque en sesiones 9 y 16 se corrió el pipeline a mano y
se commitearon los resultados. El problema es **prospectivo**: la próxima imagen
pesada que se commitee queda pesada en git para siempre.

Consecuencias que el workflow evita:

| Consecuencia | Impacto |
|---|---|
| El repo carga originales pesados en su historia de git | Clonar más lento, crece con cada imagen |
| Cada build recomprime desde el original pesado | Segundos de CPU por deploy |
| En local se sirven las imágenes sin comprimir | El dev server muestra archivos pesados |

---

## 5. Riesgos aceptados

### 5.1 El robot commitea a `master`

Va contra la regla del proyecto de que **los commits los hace el usuario**. Se
planteó la alternativa (abrir un PR para aprobación manual) y **el usuario eligió
explícitamente el commit directo**. Queda registrado como decisión consciente.

### 5.2 Deploy automático

Un commit del bot a `master` dispara deploy de Vercel. Las pantallas del local
hacen `location.reload()` cada 30 min, así que dentro de esa ventana cada
pantalla se recarga con el build nuevo. Interrupción visual: 1-2 segundos.

Mitigación: como el trigger es `push` (no un cron nocturno), esto ocurre
únicamente cuando el usuario ya estaba commiteando una imagen — o sea, ya estaba
provocando un deploy de todos modos. **El workflow no agrega deploys que no
fueran a ocurrir igual.**

### 5.3 Loop infinito

El commit del bot es un `push` a `master`, que volvería a disparar el workflow.
Sin guard, loop infinito.

**Dos defensas, ambas necesarias:**

1. `if: github.actor != 'github-actions[bot]'` en el job — corta la reentrada.
2. El script es **idempotente por construcción** (`if (buf.length < before)`):
   la segunda pasada no produce cambios, así que no habría nada que commitear
   aunque el guard fallara. Esto queda cubierto por un test (§7).

---

## 6. Refactor necesario del script

`scripts/optimize-images.mjs` hoy no es testeable: los paths están hardcodeados
y llama a `main()` al importarse (importarlo desde un test ejecutaría el
pipeline real sobre `public/`).

Cambios mínimos, **sin alterar comportamiento**:

- Exportar `optimizar(filePath, resizeWidth)`.
- Envolver la llamada a `main()` en un guard de entrypoint, para que solo corra
  cuando el script se invoca directo (`node scripts/optimize-images.mjs`) y no
  cuando un test lo importa.

No cambia nada de la lógica de compresión, ni los umbrales, ni la salida por
consola.

---

## 7. Tests

**Runner:** `node --test` (incorporado en Node 18+). **Cero dependencias
nuevas** — decisión deliberada: el proyecto tiene 1.700 líneas y no justifica
sumar Vitest/Jest.

Archivo: `scripts/optimize-images.test.mjs`. Trabaja sobre un directorio
temporal con imágenes generadas al vuelo — **nunca toca `public/`**.

| Test | Qué garantiza |
|---|---|
| Reduce el peso de una imagen grande | El pipeline efectivamente comprime |
| Respeta el ancho máximo | El resize a 1200px se aplica |
| **Es idempotente** | Segunda pasada = cero cambios. **Previene el loop de commits del §5.3** |
| No agranda una imagen ya chica | El guard `buf.length < before` funciona |
| No corrompe el archivo | La salida sigue siendo un PNG válido y legible |

Nuevo script en `package.json`:
`"test": "node --test \"scripts/**/*.test.mjs\""`.

> **Corrección 2026-09-19**: ese glob no funciona en Node 20 (el del workflow)
> y hizo fallar las 3 primeras corridas. Quedó `"test": "node --test"` sin
> argumentos. Ver `CHANGELOG.md` sesión 20.

### Bug encontrado por el test de idempotencia

El test falló en la primera corrida y destapó un problema real:

```
316320 !== 316324
```

Recomprimir un PNG **ya comprimido** sigue raspando unos pocos bytes en cada
pasada — `sharp` elige filtros levemente distintos sobre la imagen ya
redimensionada. Con la guarda original (`buf.length < before`), un ahorro de 4
bytes bastaba para reescribir el archivo.

Con el workflow commiteando en automático, eso significa **commit + deploy +
recarga de todas las pantallas del local para ahorrar 4 bytes**.

**Fix aplicado:** umbral de ahorro mínimo (`MIN_AHORRO_BYTES = 1024`). El
archivo se reescribe solo si la compresión ahorra más de 1 KB. Por debajo de eso
se considera ya optimizado y no se toca.

Esto **modifica la lógica del script** (ver §9), pero era necesario: sin el
umbral el pipeline no es idempotente y la automatización no es segura.

Verificado sobre datos reales después del fix: `npm run optimize:images` no
reescribe ninguna de las 21 imágenes de `public/ofertas/` y `git status` queda
limpio.

---

## 8. Workflow

Archivo: `.github/workflows/optimize-images.yml`

```yaml
name: Optimizar imágenes

on:
  push:
    branches: [master]
    paths:
      - 'public/ofertas/**.png'
      - 'public/logo.png'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  optimizar:
    # Corta el loop: ignora los push que hizo el propio bot.
    if: github.actor != 'github-actions[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      # Corre primero: si el pipeline está roto, no queremos que commitee nada.
      - run: npm test

      - run: npm run optimize:images

      - name: Commitear si cambió algo
        run: |
          if git diff --quiet -- public/; then
            echo "Sin cambios, nada que commitear."
            exit 0
          fi
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add public/
          git commit -m "chore: optimizar imágenes de ofertas"
          git push
```

**Orden importa:** los tests corren **antes** de optimizar. Si el script está
roto, el job falla sin haber tocado el repo.

### Configuración requerida en GitHub

Una sola vez, en **Settings → Actions → General → Workflow permissions**:
seleccionar **`Read and write permissions`**. Sin esto el `git push` falla con
`403`.

---

## 9. Qué NO entra

- **No se tocan los parámetros de compresión** de `optimize-images.mjs`
  (`resize` 1200px, `compressionLevel: 9`, `effort: 10`). Sí se agregó el umbral
  `MIN_AHORRO_BYTES` — desviación respecto del plan original, forzada por el bug
  de idempotencia que encontró el test (ver §7).
- **No se toca el hook `prebuild`.** Sigue corriendo en cada build como segunda
  línea de defensa: si Actions se desactiva o el workflow falla, Vercel igual
  sirve imágenes optimizadas.
- **No se agrega umbral bloqueante.** El script advierte >500KB sin fallar, y se
  mantiene así: `costillar.png` (576KB) ya está en ese estado de forma aceptada,
  y hacerlo bloqueante rompería deploys por un caso conocido.
- **No se migra a WebP/AVIF.** Cambiaría el contrato `/ofertas/{slug}.png` que
  usa el cliente al subir imágenes (ver `docs/decisiones.md`).
- **No hay trigger por schedule.** Descartado en §3.

---

## 10. Verificación

1. `npm test` en local: todos los tests en verde.
2. `npm run optimize:images` en local: con el repo como está hoy, todas las
   imágenes salen `= ya optimizado` y `git status` queda limpio (prueba de
   idempotencia sobre datos reales).
3. Mergear el workflow y dispararlo a mano desde **Actions → Optimizar imágenes
   → Run workflow**. Esperado: verde, sin commit (nada que optimizar).
4. Prueba end-to-end: commitear un PNG sin optimizar a `public/ofertas/`. El
   workflow debe dispararse, comprimirlo, y commitear la versión liviana.
