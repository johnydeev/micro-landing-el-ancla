# Activación de pantallas — opciones (pendiente de decisión)

Fecha: 2026-10-12 · Estado: **brainstorming en pausa, sin decisión**. Retomar
en otra sesión eligiendo entre la Opción 1 y la Opción 2.

## Problema

Hoy cualquiera que tenga el link (`tv-precios.vercel.app/<slug>?rubro=...`)
puede abrir la pantalla en cualquier tele, sin límite. El modelo comercial
cobra **por tele** (El Látigo: 2 TVs a $30.000 c/u; 1 TV = $35.000), así que
hace falta que:

1. ninguna tele nueva funcione sin que el dueño del sistema la habilite;
2. el rubro de cada tele quede fijo (hoy se cambia editando `?rubro=` en el
   link — es la "etapa 2" prevista en
   `2026-10-05-rubro-por-pantalla-design.md`);
3. si un cliente deja de pagar, sus teles se puedan apagar.

Contexto de la decisión: el usuario descartó un contrato en papel ("nadie
respeta contratos sin respaldo oficial") y prefiere que la restricción la
haga el código. Es la segunda mejora de escala planteada para ~20 clientes /
~40 TVs; la primera (último dato bueno) ya está en producción (sesión 24).

---

## Opción 1 — Activación "solo código" (sin base de datos)

Propuesta original. Mantiene las decisiones de base del proyecto: sin base
de datos y sin login.

**Cómo funciona**

- El dueño del sistema genera un **link de activación firmado** (secreto en
  una variable de entorno), con vencimiento corto (~15 min), que incluye
  comercio + rubros. Se abre una vez en el Fire TV al instalar.
- La tele queda con una **cookie firmada** (comercio + rubros). Sin esa
  cookie, el link común muestra "Pantalla no habilitada · contactá a ...".
- El rubro sale de la cookie, no del `?rubro=` del link: el cliente no lo
  puede cambiar.
- El demo sigue público (flag por comercio, ej. `requiereActivacion`).

**Control de pago — tres variantes discutidas**

| Variante | Cómo | Contra |
|---|---|---|
| A. Permanente | Habilitada hasta que se desactive a mano (cambio en el código del comercio + push). | Hay que acordarse de desactivar. |
| B. Vencimiento por tele | Cada activación dura ~35 días; se renueva cuando el cliente paga. | Hay que renovar cada tele. |
| **C. `pagadoHasta` por comercio (recomendada)** | Activación una sola vez al instalar; en `tenants/<slug>.ts` una línea `pagadoHasta: 'AAAA-MM-DD'`. Vencida (con unos días de gracia), sus teles muestran "Servicio suspendido". Al cobrar, se actualiza una fecha y se pushea. | Cada renovación es un push. |

**Límites**: sin base de datos no hay forma de ver cuántas teles hay
encendidas ni cuándo se conectó cada una; un técnico hábil podría copiar la
cookie a otro aparato.

---

## Opción 2 — Panel de administración con base de datos (propuesta del usuario)

Panel en `tv-precios.vercel.app/admin`, solo para el dueño del sistema, con
**todas las teles agrupadas por cliente** y un **switch** para activar o
desactivar cada una, sin tocar código ni pushear.

**Rompe dos decisiones de base**: "sin base de datos" y "sin login".

**Cómo se encararía**

1. **Identidad por tele**: al activarla, cada tele recibe un id propio
   guardado en el aparato (cookie firmada).
2. **Base de datos chica: Upstash Redis** (Vercel Marketplace). Por tele:
   cliente, rubro, activa sí/no, última conexión.
3. **En cada recarga** (cada 10 min) la tele consulta "¿estoy activa?":
   - sí → muestra precios y registra "me conecté ahora";
   - no → cartel "Pantalla desactivada";
   - apagar desde el panel → la tele se apaga en ≤ 10 min.
4. **Panel** (`/admin`, con contraseña):
   - teles agrupadas por cliente, con switch, rubro y última conexión
     (verde si se conectó hace poco, rojo si hace horas que no aparece:
     apagada o sin internet);
   - botón **"Nueva tele"** que genera el link de activación para abrir en
     el Fire TV al instalar.

**Regla de seguridad**: si Upstash no responde, **ante la duda, mostrar**.
Una tele de un cliente que paga nunca se apaga por una falla nuestra.

**Costo estimado** (20 clientes / 40 TVs, 1 lectura + 1 escritura por
recarga cada 10 min): ~350 mil comandos/mes. Plan gratis de Upstash: 500
mil/mes → $0 a esta escala. Es una dependencia más que mantener.

**Partes, cada una con su propio spec → plan → implementación**

1. **Base y activación**: Upstash, identidad de tele, consulta en cada
   carga, regla "ante la duda, mostrar". Sola ya sirve (activar/desactivar
   por comando mientras se arma el panel).
2. **Panel**: login, lista por cliente, switches, última conexión, "Nueva
   tele".

---

## Pendiente para la próxima sesión

1. Elegir **Opción 1** (con variante A/B/C) u **Opción 2** (Upstash + panel).
2. Si es la 2: confirmar sumar Upstash Redis a la cuenta de Vercel y
   arrancar el brainstorming de la parte 1 (base y activación).
3. En cualquier caso: definir qué pasa con las teles ya instaladas (El Ancla,
   El Látigo) — hay que activarlas al pasar a producción, coordinando la
   visita/horario.
