import sharp from 'sharp'
import { readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/*
 * Formaliza el pipeline de compresion que se corrio a mano en la sesion del
 * 19/06/2026 (33.3 MB -> 4.4 MB en public/ofertas). Ese paso manual se
 * olvido dos veces: imagenes nuevas subidas despues (lechon.png en sesion 9,
 * y de nuevo rabito-huesito-cuerito/mondongo/pechitox2/rabo mas tarde)
 * quedaron sin optimizar y reprodujeron el mismo riesgo de freeze en el
 * Fire TV por presion de memoria/decodificacion (ver docs/decisiones.md).
 *
 * Corriendo esto en "prebuild", ya no depende de que alguien se acuerde.
 */

const OFERTAS_DIR = 'public/ofertas'
const LOGO_PATH = 'public/logo.png'
const MAX_BYTES = 500 * 1024 // umbral de sesion 9: alertar si algo supera 500 KB

async function optimizar(filePath, resizeWidth) {
  const before = (await stat(filePath)).size
  const buf = await sharp(filePath)
    .resize({ width: resizeWidth, withoutEnlargement: true })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer()

  if (buf.length < before) {
    await writeFile(filePath, buf)
    console.log(
      `✓ ${filePath}: ${(before / 1024).toFixed(0)}KB -> ${(buf.length / 1024).toFixed(0)}KB`,
    )
  } else {
    console.log(`= ${filePath}: ya optimizado (${(before / 1024).toFixed(0)}KB)`)
  }

  return buf.length
}

async function main() {
  let huboSobrepeso = false

  const ofertas = (await readdir(OFERTAS_DIR)).filter((f) => f.endsWith('.png'))
  for (const file of ofertas) {
    const size = await optimizar(path.join(OFERTAS_DIR, file), 1200)
    if (size > MAX_BYTES) {
      huboSobrepeso = true
      console.warn(`⚠ ${file} sigue pesando ${(size / 1024).toFixed(0)}KB tras optimizar`)
    }
  }

  // El logo se ve a lo sumo a `clamp(50px, 8vh, 100px)` de alto — 400px de
  // ancho es de sobra y evita cargar un asset de mas de 1MB para un logo.
  await optimizar(LOGO_PATH, 400)

  if (huboSobrepeso) {
    // Advertencia, no bloqueante: fallar el build por esto arriesgaria un
    // deploy en produccion por un caso limite (una imagen ya comprimida al
    // maximo que sharp puede sin perder calidad). Revisar a mano si conviene.
    console.warn(
      '\nAlgunas imagenes de ofertas siguen pesando mas de 500KB tras la compresion automatica.',
    )
    console.warn('Revisar manualmente si conviene recortar la imagen o aceptar el peso actual.')
  }
}

main()
