# Pitch de venta

Material para ofrecer el producto. No es documentación técnica: es lo que se
dice y lo que no.

Último uso: octubre 2026, saliendo a ofrecer con el demo ya publicado.

---

## Mensaje para un cliente potencial (WhatsApp)

> Hola [nombre], ¿cuántas veces por semana cambiás un precio? ¿Y qué hacés con
> el cartel?
>
> Armé una pantalla de precios para el local. Lo importante no es la pantalla:
> la manejás desde una planilla de Google en el celular. Cambiás un número y en
> el local ya está.
>
> Para una oferta agregás una fila: nombre, precio, y elegís la foto de una
> lista. Sale el cartel con la foto del corte y el precio grande.
>
> Sin computadora. Un Fire TV de los baratos y la tele que ya tenés.
>
> Mirá: https://precios-el-ancla.vercel.app/demo
>
> Ya está andando todos los días en Granja El Ancla, Florencio Varela.

**Variantes**

- **Si no conocés al dueño**: sacar la pregunta del arranque y empezar directo
  por "Armé una pantalla de precios…". La pregunta funciona con confianza; de un
  desconocido suena a vendedor.
- **Por Instagram**: cortar después del link. Lo de El Ancla va en la respuesta,
  cuando pregunten.

---

## Qué destacar

1. **Se maneja desde el celular.** Es el argumento más fuerte y el que más se
   subestima. Nadie quiere prender una computadora para cambiar el precio del
   asado.
2. **Una oferta es una fila.** Nombre, precio, foto elegida de una lista.
   Para sacarla, "INACTIVO" y desaparece.
3. **No hay que instalar nada.** Un Fire TV barato y la tele que ya está.
4. **Hay un caso real andando**, no una maqueta.

## Qué NO decir

- **Nada de "multitenant", "Cloudinary", "Next.js", "deploy".** A un comerciante
  no le dice nada y suena a que va a salir caro.
- **El precio, no antes del demo.** Que primero vea la pantalla. Si se habla de
  plata antes de que la vea, la conversación arranca torcida.

---

## Links

| Para qué | URL |
|---|---|
| Demo para mostrar | https://precios-el-ancla.vercel.app/demo |
| Cliente real | https://precios-el-ancla.vercel.app/granja-elancla |

El demo es un comercio ficticio ("Carnicería San Martín") que reusa el catálogo
de imágenes compartido. Ver `tenants/demo.ts`.

**Ojo con el dominio**: hoy todo cuelga de `precios-el-ancla.vercel.app`, que es
el nombre del primer cliente. Para un prospecto queda raro. Cuando entre el
primer cliente pago conviene agregar un dominio genérico en Vercel → Domains,
**sin borrar el viejo** (la TV de El Ancla apunta ahí).
