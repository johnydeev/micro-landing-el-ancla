# Manual: nuevo cliente de punta a punta

De "cerré la venta" a "las teles andan solas en el local". Armado el
12/10/2026 con lo aprendido en El Látigo (2 teles). Detalle técnico del alta
en el README ("Alta de un cliente"); acá está el orden completo y las trampas.

Tiempo total: ~1 h de escritorio + ~20 min por tele.

---

## 0. Antes de empezar: qué pedirle al cliente

- [ ] Nombre del comercio, eslogan (puede ir vacío), horarios, WhatsApp,
      Instagram — **reales**: El Látigo quedó con `11 2222 3333` de relleno.
- [ ] Logo en buena calidad (PNG con fondo o SVG).
- [ ] Dos colores de marca (flyer, cartel, logo).
- [ ] Lista de productos con precio, unidad y **rubro** (vacuno, cerdo,
      pollo…) y ofertas.
- [ ] Cuántas teles y **qué rubros muestra cada una**.
- [ ] Contraseña del wifi del local.
- [ ] Cada tele: que tenga HDMI libre y un enchufe cerca para el Fire TV.
- [ ] Fire TV Stick: lo compra el cliente (la puesta en marcha no lo incluye).
- [ ] Fecha de cobro del abono (para `pagadoHasta`).

Referencia comercial (05/10/2026): puesta en marcha $150.000 sin Fire TV;
abono $35.000 con 1 tele, $30.000 c/u con 2 o más.

---

## 1. Planilla del cliente

1. Abrir el link de copia de la planilla modelo → nombrarla
   "Precios \<Comercio>".
2. Cargar las 4 pestañas: `Tablas de Precios`, `Ofertas`, `Configuracion`,
   `Precios`.
   - Con archivos: **Archivo → Importar → Subir → Reemplazar hoja actual**,
     parado en la pestaña correcta (reemplaza la que está a la vista). Solo
     `.csv`.
   - **Columna de rubro** (`Categoria` o `Rubro`) en cada producto, y
     super-header de rubro arriba de cada bloque de ofertas. Sin rubro, el
     producto no aparece en ninguna tele con rubro fijo.
   - Escribir el rubro igual en todos lados (`vacuno` y `res` son lo mismo;
     acentos y mayúsculas no importan).
   - No dejar celdas vacías entre `Precio` y `Unidad`: rompe el parser.
3. Pestaña `Configuracion`: horarios, WhatsApp e Instagram **reales**. Lo de
   la planilla le gana a lo del código: si acá queda un número de relleno, se
   ve en pantalla aunque el código esté bien.
4. `_catalogo`: pegar el `IMPORTRANGE` al catálogo maestro → "Permitir
   acceso" → ocultar la hoja.
5. **Archivo → Compartir → Publicar en la web → Todo el documento → CSV →
   Publicar.** Guardar la URL `…/pub?output=csv`.

## 2. Imágenes

1. Cada `slug imagen` tiene que existir en Cloudinary (`catalogo-comun/<slug>`).
   Verificar con `npm run verificar` en el repo del catálogo: abrir la URL no
   alcanza (un slug inexistente puede dar 200 por el placeholder y la caché).
2. Logo como `logos/<slug>`. Ojo: la carpeta de la Media Library y el
   "Display name" **no** son el `public_id`; hay que editar el public_id.
   Verificar `https://res.cloudinary.com/<cloud>/image/upload/logos/<slug>`
   → 200. (`npm run alta` lo puede subir solo.)

## 3. Alta en el código

1. `.env.local` con los secretos (una sola vez, no por cliente):
   `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `VERCEL_TOKEN`,
   `VERCEL_PROJECT_ID`, `ACTIVACION_SECRET`.
2. `npm run alta` → nombre, slug, eslogan, dos colores, badge, contactos, URL
   de la planilla, logo. Escribe `tenants/<slug>.ts`, lo registra, crea
   `TENANT_<SLUG>_CSV_URL` en Vercel y en `.env.local`, corre los tests.
3. Revisar `tenants/<slug>.ts` a mano:
   - `defaults.whatsapp` / `instagram` / `horarios` reales.
   - Paleta: probar en `npm run dev` → `localhost:3000/<slug>`. Si el
     primario lleva texto blanco encima, no puede ser un color claro (caso El
     Látigo: amarillo al `acento`, negro de primario).
   - **No** poner todavía `requiereActivacion` (bloquearía las teles antes de
     instalarlas).
4. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
5. Commit + push **fuera del horario de atención de los comercios que ya
   están en producción** (El Ancla cierra 13 h y 20:15): el push redeploya
   para todos.
6. Verificar `https://tv-precios.vercel.app/<slug>` (Ctrl+F5) y probar un
   rubro: `/<slug>?rubro=cerdo`.

## 4. Cuenta de Amazon del cliente

- **Una cuenta por cliente** (El Ancla + El Látigo comparten una por historia;
  desde el tercero, separadas). Amazon da de baja en masa cuentas con muchos
  Fire TV: una sola cuenta para todos = todos caídos a la vez.
- Mail: probar alias Gmail `tumail+cliente@gmail.com`; si Amazon lo rechaza,
  dominio propio con reenvío. El mail no se puede cambiar cómodo después.
- Sin tarjeta cargada. Verificación en dos pasos con tu teléfono.
- Guardar en el gestor de contraseñas: cuenta, contraseña, PIN de Prime Video,
  y por cada tele: nombre, número de serie, id de tele, rubros.

## 5. Links de activación

```bash
npm run activar -- <slug> <rubros> 6
```

- Uno por tele (`vacuno`, `cerdo,pollo`, `todo`). Anotar el **id** que
  imprime.
- El último número son las horas de vigencia: generarlos **el mismo día**, con
  margen (6 h). Vencido → "Link de activacion invalido o vencido"; se genera
  otro, no pasa nada.
- Nunca mandar un link de activación por WhatsApp a nadie: activa cualquier
  aparato que lo abra, con el id de la tele.

## 6. Fire TV (por tele, ~20 min)

Se puede hacer en casa y llevarlo configurado; en el local solo falta el wifi.

1. Enchufar el Fire TV con **su cargador al enchufe** (no al USB de la tele:
   se reiniciaría cada vez que apagan la tele).
2. Wifi → vincular a la cuenta del cliente: el Fire TV muestra un código →
   en el celular, **amazon.com/code**.
3. "¿Restaurar apps de un dispositivo anterior?" → **No**.
4. PIN de Prime Video si lo pide (olvidado → **amazon.com/pin**).
5. En amazon.com → Administrar contenido y dispositivos: nombrar el aparato
   (`<cliente> - <rubro>`) y anotar el número de serie.
6. Configuración → Preferencias → **Zona horaria → Argentina/Buenos Aires**
   (el atenuado por horario usa la hora del aparato).
7. Instalar actualizaciones pendientes (Configuración → Mi Fire TV →
   Información), para que no se reinicie con el local abierto.

### Fully Kiosk Browser

1. Lupa → instalar **Downloader** (ícono naranja, AFTVnews).
2. Configuración → Mi Fire TV → **Información** → parado en el nombre del
   aparato, **7 veces el botón central** → volver → aparece "Opciones para
   desarrolladores" → **Instalar apps desconocidas → Downloader: sí**.
3. Downloader → `fully-kiosk.com` → columna **BROWSER** → "Get APK file" →
   **Fully Kiosk Browser APK (regular edition)** (no EMM, no Single App) →
   Instalar → borrar el APK.
4. Quick Start de Fully: **Start URL = link de activación**, los tres switches
   apagados → Start using Fully → tiene que mostrar **solo su rubro**.
5. **Cambiar la Start URL ya** (mantener apretado atrás → Settings → Web
   Content Settings → Start URL) a `https://tv-precios.vercel.app/<slug>`.
   Borrar también `activar/`: si queda `/activar/<slug>`, la tele arranca en
   "Link de activacion invalido" (nos pasó).
6. Web Content Settings y recargas:
   - Auto Reload after Page Error: **60**
   - Auto Reload on Internet Reconnect: **sí**
   - Todos los "Delete … on Auto Reload" (cache, webstorage, history,
     **cookies**): **no**. Cookies = activación; webstorage = último dato
     bueno.
   - Load Current Page on Auto Reload / Skip Auto Reload if Showing Start
     URL: **no**.
   - Whitelist y Blacklist vacías; Load Error URL on Disconnection en **0**.
7. Device Management → **Launch on Boot: sí**. Pide "Display Over Other
   Apps" y falla (Fire OS no lo deja dar): cuando el cartel muestre
   **IGNORE**, apretarlo. Con Cancel vuelve a aparecer en cada arranque tapando
   los precios. Arranca solo igual.
8. Permisos de Fully (Configuración → Aplicaciones → Fully → Permisos):
   micrófono en Rechazar ("Preguntar siempre" también sirve); **nunca**
   "Permitir".
9. Tipeo: con el control remoto. La app Amazon Fire TV del celular como
   teclado no siempre deja iniciar sesión, y un teclado con receptor USB no se
   conecta al Fire TV (el USB es de la tele). Un teclado **Bluetooth** sí.
   Cuidado con vincular por Bluetooth algo que no es tuyo: aparecen teles
   vecinas ("[TV] …").

### Encuadre

Muchas teles hacen zoom y recortan los bordes (logo cortado arriba, borde
izquierdo afuera, footer pegado abajo). En la tele: Imagen → Tamaño/Ajuste
de imagen → **Ajustar a pantalla** (Samsung: "Screen Fit"). Si no existe:
Fire TV → Pantalla y sonidos → Pantalla → Calibrar pantalla.
**Quedó bien cuando se ve el punto de estado en la esquina superior
derecha** (verde online, ámbar último dato bueno, rojo sin internet).

### Prueba final de cada tele

- [ ] Desenchufar 10 s y enchufar → arranca sola en Fully, en su rubro, sin
      carteles encima.
- [ ] Rota entre tablas y carteles de oferta de su rubro.
- [ ] Punto de estado visible y verde.
- [ ] En los logs de Vercel (proyecto `carteleria`, retienen 1 h) aparece
      `[tele] {"id":"<id>",…}` con sus rubros. Pedímelo y lo miro.

## 7. En el local

1. Conectar cada Fire TV al wifi del local (la activación no se pierde al
   cambiar de red).
2. Encuadre de cada tele (punto de estado visible).
3. Prueba final de cada tele.
4. Explicarle al dueño:
   - precios y ofertas se cambian en la planilla; las teles se actualizan
     solas en ≤10 min;
   - no tocar la configuración de Fully ni borrar datos de la app (pierde la
     activación);
   - si una tele muestra "Pantalla no habilitada": avisarte.

## 8. Cerrar la activación (fuera de horario)

Con **todas** las teles del cliente activadas y probadas:

```ts
// tenants/<slug>.ts
requiereActivacion: true,
pagadoHasta: 'AAAA-MM-DD',
```

Test + push fuera del horario de atención. Desde ahí, un aparato sin
activar ve "Pantalla no habilitada"; las teles activadas siguen igual.
Verificar desde tu PC: `/<slug>` tiene que mostrar el bloqueo.

Si el dueño quiere ver las pantallas en su celular: link de activación propio
con id aparte (`npm run activar -- <slug> todo`), abierto en Chrome (no en el
navegador de WhatsApp).

## 9. Mantenimiento

- **Cobro mensual**: correr `pagadoHasta` y pushear. Vencido + 5 días →
  "Servicio suspendido" en todas sus teles; vuelve sola al pushear la fecha
  nueva (≤10 min).
- **Tele reseteada o Fully reinstalado**: se pierde la cookie → link nuevo,
  pasos 6.4 y 6.5.
- **Cookie de activación**: dura 400 días (límite de Chrome). Renovar antes
  (pendiente: que lo haga el panel).
- **Cambio de rubro de una tele**: link nuevo con los rubros nuevos.

## Problemas conocidos

| Síntoma | Causa | Arreglo |
|---|---|---|
| "Link de activacion invalido o vencido" al arrancar | Start URL quedó con el link o con `/activar/` | Start URL = `https://tv-precios.vercel.app/<slug>` |
| Muestra todos los rubros | Sin cookie (otro navegador, cookies borradas) | Activar de nuevo |
| Cartel "Permissions required" en cada arranque | Se apretó Cancel | Apretar IGNORE |
| Ícono de micrófono en la esquina | Sin resolver (no es el permiso de Fully) | Pendiente: ADB para ver qué app lo usa |
| Bordes cortados, punto de estado invisible | Overscan de la tele | Ajustar a pantalla |
| WhatsApp/horarios viejos en el footer | Pestaña `Configuracion` de la planilla | Corregir la celda (sin push) |
| Alexa dice otra hora | Zona horaria del Fire TV | Preferencias → Zona horaria |
