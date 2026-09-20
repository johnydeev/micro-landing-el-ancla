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
  return process.env.NEXT_PUBLIC_CLOUDINARY_CATALOGO ?? 'catalogo'
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
 * Imagen de una oferta. `slug` es lo que el cliente escribe en la columna
 * "slug imagen" de su planilla (ej. "asado-de-tira"), sin carpeta ni
 * extension. `d_placeholder.png`: si el slug no existe en Cloudinary, sirve
 * la imagen `placeholder.png` de la raiz del cloud en vez de 404.
 */
export function urlOferta(slug: string): string {
  return urlImagen(`${carpetaCatalogo()}/${slug}`, 'f_auto,q_auto,w_1200,d_placeholder.png')
}

/* Logo del header. Se ve a lo sumo a ~100px de alto: 400px de ancho sobra. */
export function urlLogo(publicId: string): string {
  return urlImagen(publicId, 'f_auto,q_auto,w_400')
}

/* Icono PWA derivado del logo: cuadrado, con padding blanco, siempre PNG. */
export function urlIcono(publicId: string, lado: 192 | 512): string {
  return urlImagen(publicId, `f_png,w_${lado},h_${lado},c_pad,b_white`)
}
