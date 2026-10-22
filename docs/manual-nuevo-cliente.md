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
- [ ] Fecha de cobro del abono (se carga en el panel `/admin`, en `pagado_hasta`).

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
   `VERCEL_PROJECT_ID`, `ACTIVACION_SECRET`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` (las dos últimas también en Vercel, Production),
   y `ADMIN_PASSWORD` solo en Vercel (Secret, Production): es la contraseña del
   panel `/admin`.
2. `npm run alta` → nombre, slug, eslogan, dos colores, badge, contactos, URL
   de la planilla, logo. Escribe `tenants/<slug>.ts`, lo registra, crea
   `TENANT_<SLUG>_CSV_URL` en Vercel y en `.env.local`, **crea la fila del
   cliente en `comercios`** (Supabase) y corre los tests. Flag `--sin-supabase`
   si no querés tocar la base; sin `SUPABASE_*` avisa "Cargá la fila en
   comercios a mano" y sigue.
3. Revisar `tenants/<slug>.ts` a mano:
   - `defaults.whatsapp` / `instagram` / `horarios` reales.
   - Paleta: probar en `npm run dev` → `localhost:3000/<slug>`. Si el
     primario lleva texto blanco encima, no puede ser un color claro (caso El
     Látigo: amarillo al `acento`, negro de primario).
4. **Fila del cliente en Supabase**: la crea `npm run alta` (`slug` del tenant,
   `requiere_activacion` en **true**, `pagado_hasta` vacío). Verificar que
   aparece en el panel `/admin` (vista Clientes). Solo si el script avisó que
   no pudo: cargarla a mano en `tv-precios` → Table Editor → `comercios` con
   `requiere_activacion` en true. Sin esta fila sus teles no se registran, no
   muestran código y no se pueden bloquear.
5. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
6. Commit + push **fuera del horario de atención de los comercios que ya
   están en producción** (El Ancla cierra 13 h y 20:15): el push redeploya
   para todos.
7. Verificar `https://tv-precios.vercel.app/<slug>` (Ctrl+F5) y probar un
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

## 5. Activar las teles: código en pantalla

Las teles no llevan link: la Start URL es la definitiva y la tele muestra un
código que se carga en el panel (ver 6, Fully, pasos 4 y 5).

- Panel: `https://tv-precios.vercel.app/admin` (contraseña = `ADMIN_PASSWORD`).
  Se usa también desde el celular.
- **Plan B** (panel caído o tele que no muestra código): link largo firmado,
  `npm run activar -- <slug> <rubros> 6` (`vacuno`, `cerdo,pollo`, `todo`).
  Anotar el **id** que imprime. El último número son las horas de vigencia:
  generarlo **el mismo día**, con margen (6 h). Vencido → "Link de activacion
  invalido o vencido"; se genera otro.
- Nunca mandar un link de activación por WhatsApp a nadie: activa cualquier
  aparato que lo abra. El código del panel no tiene ese problema: solo lo
  activa quien lo ve en la pantalla y entra al panel.

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
4. Quick Start de Fully: **Start URL = `https://tv-precios.vercel.app/<slug>`**
   (la definitiva), los tres switches apagados → Start using Fully. Con el
   cliente nuevo (`requiere_activacion` en true) muestra "Pantalla no
   habilitada" y un **código de activación** (ej. `K7M-2QX`).
5. **Activar la tele**: en el panel `/admin` → cliente → **Nueva tele** →
   escribir el código (sin guion, mayúsculas o minúsculas) y marcar sus
   rubros (ninguno = todo) → **Activar tele**. En ≤5 s la tele recarga y muestra **solo
   su rubro**. El código vence a los 15 min: si venció, la tele pide otro sola
   (o recargarla). Plan B: link largo de la sección 5 como Start URL, y
   después volver a la definitiva borrando también `activar/` (si queda
   `/activar/<slug>`, arranca en "Link de activacion invalido").
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
   vecinas ("[TV] …"). Con el código de 6 caracteres casi no hace falta teclado.

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
- [ ] En el panel `/admin` la tele aparece con su rubro y badge verde.
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

## 8. Cierre de la instalación (sin push)

Con **todas** las teles del cliente activadas y probadas:

1. En el panel `/admin` verificar que figuran todas sus teles con el rubro
   correcto y badge verde (se registran solas al activarlas).
2. Cargar la **fecha de pago** del cliente (completar **Fecha de pago** y apretar **Guardar fecha**;
   sin apretarlo no se guarda. **Pagó** la corre al mismo día del mes siguiente).

No hace falta "cerrar la activación": el cliente nuevo ya nace con
`requiere_activacion = true` (lo crea `npm run alta`), así que un aparato sin
activar ve "Pantalla no habilitada" desde el primer día. Verificar desde tu PC
(navegador sin la cookie): `/<slug>` tiene que mostrar el bloqueo con el código.

Excepción: clientes anteriores a la Parte B (El Látigo) tienen la fila creada
a mano; si `requiere_activacion` está en false, prenderlo por SQL en Supabase
(el panel no lo expone): `update comercios set requiere_activacion = true
where slug = '<slug>';`.

Si el dueño quiere ver las pantallas en su celular: link de activación propio
con id aparte (`npm run activar -- <slug> todo`), abierto en Chrome (no en el
navegador de WhatsApp), o una **Nueva tele** más con su código.

## 9. Mantenimiento (desde el panel `/admin`)

- **Cobro mensual**: botón **Pagó** (corre `pagado_hasta` al mismo día del mes
  siguiente) o completar **Fecha de pago** y apretar **Guardar fecha**. El panel solo **avisa**: "por vencer" (≤3
  días) y "vencido" con los días de atraso. El sistema **nunca corta solo**:
  si el cliente no paga, vos decidís y apagás.
- **Apagar o prender**: switch por tele (la tele muestra "Pantalla
  desactivada") o **Apagar todas / Prender todas** por cliente (≤10 min, sin
  push).
- **Última conexión de una tele**: badge de cada tele (verde < 15 min, ámbar
  15-60 min, rojo > 60 min o nunca, gris si está apagada). La tele reporta
  cada ~10 min mientras está prendida.
- **Tele reseteada o Fully reinstalado**: se pierde la cookie → Start URL
  definitiva y **Nueva tele** con el código nuevo (pasos 6.4 y 6.5). Queda
  como una tele más: apagar la vieja.
- **Cookie de activación**: la renueva sola `proxy.ts` mientras la tele esté
  prendida (dura 400 días, límite de Chrome). Una tele apagada más de 400 días
  hay que volver a activarla.
- **Cambio de rubro de una tele**: **Cambiar rubros** en el panel (pide la
  contraseña; vacío = todo), sin ir al local.
- **Baja de un cliente**: **Dar de baja** (pide la contraseña). Sus teles
  muestran "Pantalla no habilitada", deja de autoregistrar teles y pasa a la
  vista **Bajas**. **Reactivar** (un clic) lo devuelve como estaba.

## Problemas conocidos

| Síntoma | Causa | Arreglo |
|---|---|---|
| "Link de activacion invalido o vencido" al arrancar | Start URL quedó con el link o con `/activar/` | Start URL = `https://tv-precios.vercel.app/<slug>` |
| Muestra todos los rubros | Sin cookie (otro navegador, cookies borradas), o `teles.rubros` vacío | Activar de nuevo, o Cambiar rubros en el panel |
| "Pantalla desactivada" | `teles.activa = false` | Prender el switch en el panel |
| "Pantalla no habilitada" con código | Tele sin activar (primera vez, o cookie borrada) | Cargar el código en el panel → Nueva tele |
| "Pantalla no habilitada" y el panel no la muestra | Cliente dado de baja | Reactivar en la vista Bajas del panel |
| No aparece el código en la pantalla bloqueada | Cliente dado de baja | Verificar la vista Bajas y reactivar; plan B con `npm run activar` |
| La pantalla muestra precios sin bloqueo ni código | Sin fila en `comercios` (no hay bloqueo, por eso no hay código) | Crear la fila con `npm run alta` o en Supabase |
| El código dice vencido o inválido | Pasaron 15 min o se escribió mal | Recargar la tele (pide uno nuevo) y cargarlo antes |
| Cartel "Permissions required" en cada arranque | Se apretó Cancel | Apretar IGNORE |
| Ícono de micrófono en la esquina | Sin resolver (no es el permiso de Fully) | Pendiente: ADB para ver qué app lo usa |
| Bordes cortados, punto de estado invisible | Overscan de la tele | Ajustar a pantalla |
| WhatsApp/horarios viejos en el footer | Pestaña `Configuracion` de la planilla | Corregir la celda (sin push) |
| Alexa dice otra hora | Zona horaria del Fire TV | Preferencias → Zona horaria |
