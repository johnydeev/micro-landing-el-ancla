/*
 * URLs de imagen en Cloudinary. Solo strings: sin SDK, sin credenciales.
 *
 * Todas las imagenes del proyecto (catalogo de productos, logos, iconos PWA)
 * viven en Cloudinary desde sesion 21. El repo no tiene PNGs salvo el
 * favicon. Ver docs/decisiones.md (ADR "Imagenes en Cloudinary").
 *
 * Las env son NEXT_PUBLIC_ porque estas funciones corren tambien en el
 * cliente (templates de cartel). No son secretos: las URLs resultantes son
 * publicas.
 */

const BASE = 'https://res.cloudinary.com'

function cloudName(): string {
  return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? ''
}

function carpetaCatalogo(): string {
  return process.env.NEXT_PUBLIC_CLOUDINARY_CATALOGO ?? 'catalogo-comun'
}

/*
 * URL generica. Devuelve '' si falta el cloud name: un <img src=""> dispara
 * onError y el cartel se renderiza sin foto, en vez de romper la pantalla.
 */
export function urlImagen(publicId: string, transformaciones: string): string {
  const cloud = cloudName()
  if (!cloud) return ''
  return `${BASE}/${cloud}/image/upload/${transformaciones}/${publicId}`
}

/*
 * Version del dia para la URL (`v20261006`), con la fecha de Argentina.
 *
 * Cloudinary manda las imagenes con `max-age=2592000` (30 dias). Si el
 * usuario reemplaza una foto en Cloudinary con el MISMO nombre, la URL no
 * cambia y la TV (o la PC) sigue mostrando la copia vieja hasta 30 dias
 * (paso con el costillar sin fondo, 06/10/2026). Cloudinary acepta cualquier
 * `v<numero>` en la URL y entrega la version actual (verificado), asi que
 * meter la fecha hace que cada dia sea una URL nueva: una foto reemplazada
 * aparece sola en menos de 24 h. Costo: las fotos se bajan de nuevo una vez
 * por dia (~150 KB cada una).
 */
export function versionDelDia(fecha: Date = new Date()): string {
  const dia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha)
  return `v${dia.replaceAll('-', '')}`
}

/*
 * Imagen de una oferta. `slug` es lo que el cliente escribe en la columna
 * "slug imagen" de su planilla (ej. "asado-de-tira"), sin carpeta ni
 * extension. El catalogo es plano (`catalogo-comun/<slug>`); el rubro va
 * como tag en Cloudinary, no en la ruta. `d_placeholder.png`: si el slug no
 * existe en Cloudinary, sirve la imagen `placeholder.png` de la raiz del
 * cloud en vez de 404.
 */
export function urlOferta(slug: string, fecha: Date = new Date()): string {
  return urlImagen(
    `${versionDelDia(fecha)}/${carpetaCatalogo()}/${slug}`,
    'f_auto,q_auto,w_1200,d_placeholder.png',
  )
}

/*
 * Logo del header. Se ve a lo sumo a ~100px de alto: 400px de ancho sobra.
 * Lleva la version del dia por el mismo motivo que las ofertas.
 */
export function urlLogo(publicId: string, fecha: Date = new Date()): string {
  return urlImagen(`${versionDelDia(fecha)}/${publicId}`, 'f_auto,q_auto,w_400')
}

/*
 * Imagen de preview para cuando se comparte el link (WhatsApp, Telegram, redes).
 * 1200x630 es la relacion que esperan: el logo va centrado sobre fondo blanco.
 * Sin esto, WhatsApp cae al apple-touch-icon del sitio — y ese era global, asi
 * que mostraba el logo del primer comercio en el link de cualquier otro.
 */
export function urlOg(publicId: string): string {
  return urlImagen(publicId, 'f_png,w_1200,h_630,c_pad,b_white')
}

/* Icono PWA derivado del logo: cuadrado, con padding blanco, siempre PNG. */
export function urlIcono(publicId: string, lado: 192 | 512): string {
  return urlImagen(publicId, `f_png,w_${lado},h_${lado},c_pad,b_white`)
}
