import sharp from 'sharp'
import { readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

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

/*
 * Ahorro minimo para justificar reescribir el archivo.
 *
 * Recomprimir un PNG ya comprimido puede seguir raspando unos pocos bytes cada
 * vez (sharp elige filtros levemente distintos sobre la imagen ya redimensionada).
 * Sin este umbral el pipeline NO es idempotente: cada pasada produce un archivo
 * marginalmente distinto, y como el workflow de GitHub Actions commitea el
 * resultado, eso serian commits y deploys por ahorros de 4 bytes.
 *
 * Lo detecto el test "es idempotente" en optimize-images.test.mjs.
 */
const MIN_AHORRO_BYTES = 1024

/*
 * Comprime una imagen in-place y devuelve su peso final en bytes.
 *
 * Solo sobreescribe si el resultado es mas liviano que el original. Esa guarda
 * es lo que hace al pipeline IDEMPOTENTE: una segunda pasada sobre un archivo
 * ya optimizado no lo toca. De eso depende que el workflow de GitHub Actions no
 * entre en un loop de commits (ver docs/superpowers/specs/2026-08-09-*).
 *
 * Exportada para poder testearla contra un directorio temporal sin tocar
 * public/ (ver optimize-images.test.mjs).
 */
export async function optimizar(filePath, resizeWidth) {
  const before = (await stat(filePath)).size
  const buf = await sharp(filePath)
    .resize({ width: resizeWidth, withoutEnlargement: true })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer()

  if (before - buf.length > MIN_AHORRO_BYTES) {
    await writeFile(filePath, buf)
    console.log(
      `✓ ${filePath}: ${(before / 1024).toFixed(0)}KB -> ${(buf.length / 1024).toFixed(0)}KB`,
    )
    return buf.length
  }

  console.log(`= ${filePath}: ya optimizado (${(before / 1024).toFixed(0)}KB)`)
  return before
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

// Solo corre el pipeline real cuando se invoca directo
// (`node scripts/optimize-images.mjs`, que es lo que hace el hook `prebuild`).
// Sin esta guarda, importar el modulo desde un test ejecutaria la compresion
// sobre public/ como efecto secundario del import.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
