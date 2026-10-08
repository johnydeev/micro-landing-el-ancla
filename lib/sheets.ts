import 'server-only'

import type { ConfigNegocio, EstadoLectura, EstadoPantalla, ListaPrecios, Oferta } from '@/types'
import type { Tenant } from '@/types/tenant'
import { leerListas, leerOfertas, parsearConfig } from '@/lib/planilla'
import { csvUrlDe, envKeyCsv } from '@/lib/tenant-env'

/*
 * Lectura de la planilla del comercio: baja los CSV publicados de Google
 * Sheets y se los pasa a lib/planilla.ts, que los interpreta (y es lo que
 * tiene tests). Aca solo viven las URLs, el fetch y el manejo de errores.
 */

function urlConGid(baseUrl: string, gid: string): string {
  if (/[?&]gid=\d+/.test(baseUrl)) {
    return baseUrl.replace(/([?&])gid=\d+/, `$1gid=${gid}`)
  }
  const sep = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${sep}gid=${gid}`
}

/*
 * Agrega un parametro unico a la URL del CSV para que ningun cache
 * intermedio (el CDN de Google, un proxy del ISP, el del local) pueda
 * devolver una copia vieja.
 *
 * Google sirve el CSV publicado con `Cache-Control: private, max-age=300`.
 * Sin este parametro, apretar "actualizar" en el Fire TV podia seguir
 * mostrando precios de hasta 5 minutos atras aunque nuestro server pidiera
 * el CSV de nuevo. Google ignora el parametro (verificado: mismo contenido,
 * status 200), asi que es seguro.
 *
 * OJO: esto NO acelera el pipeline de publicacion de Google. Con una URL
 * `/pub?output=csv`, Google puede tardar en exponer la edicion mas reciente
 * en el CSV publicado. Ver docs/decisiones.md.
 */
function urlSinCache(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}_cb=${Date.now()}`
}

/*
 * Opciones de fetch compartidas por los tres lectores.
 *
 * `no-store`: la pantalla del local es un display de precios — cuando el
 * cliente corrige un precio en el Sheets y aprieta "actualizar" en el Fire
 * TV, tiene que ver el precio nuevo en ese reload, no en el siguiente. Con
 * el `revalidate: 60` anterior (+ ISR en la page) el primer reload despues
 * de expirar servia la version vieja y recien regeneraba en background.
 * Ver docs/decisiones.md.
 */
const FETCH_SIN_CACHE = { cache: 'no-store' } as const

/*
 * Resultado de leer una parte de la planilla. `error` = fetch fallido,
 * respuesta no-2xx, falta de configuracion (env/gid) o CSV sin encabezados.
 * `ok` con datos vacios = planilla bien armada pero vacia (decision del
 * comercio). La TV usa el estado para decidir si muestra lo guardado
 * (lib/ultimo-dato-bueno.ts).
 */
export interface Lectura<T> {
  datos: T
  estado: EstadoLectura
}

export async function getListasPrecios(tenant: Tenant): Promise<Lectura<ListaPrecios[]>> {
  const csvUrl = csvUrlDe(tenant.slug)

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return { datos: [], estado: 'error' }
  }

  try {
    const res = await fetch(urlSinCache(csvUrl), FETCH_SIN_CACHE)

    if (!res.ok) {
      console.error('Error fetching CSV:', res.status, res.statusText)
      return { datos: [], estado: 'error' }
    }

    const { datos, ok } = leerListas(await res.text())
    return { datos, estado: ok ? 'ok' : 'error' }
  } catch (error) {
    console.error('Error en getListasPrecios:', error)
    return { datos: [], estado: 'error' }
  }
}

export async function getConfig(tenant: Tenant): Promise<Lectura<ConfigNegocio>> {
  const csvUrl = csvUrlDe(tenant.slug)
  const gidConfig = tenant.sheets.gidConfig

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return { datos: {}, estado: 'error' }
  }
  // Pestaña de configuracion opcional: sin gid no es una falla.
  if (!gidConfig) {
    return { datos: {}, estado: 'ok' }
  }

  const configUrl = urlConGid(csvUrl, gidConfig)

  try {
    const res = await fetch(urlSinCache(configUrl), FETCH_SIN_CACHE)
    if (!res.ok) {
      console.error('Error fetching CSV de configuracion:', res.status)
      return { datos: {}, estado: 'error' }
    }
    return { datos: parsearConfig(await res.text()), estado: 'ok' }
  } catch (error) {
    console.error('Error en getConfig:', error)
    return { datos: {}, estado: 'error' }
  }
}

export async function getPantallaData(tenant: Tenant): Promise<{
  listas: ListaPrecios[]
  ofertas: Oferta[]
  configRemota: ConfigNegocio
  estado: EstadoPantalla
  /** Date.now() del server al armar la pagina (vigencia del ultimo dato bueno). */
  generadoEn: number
}> {
  const [listas, ofertas, config] = await Promise.all([
    getListasPrecios(tenant),
    getOfertas(tenant),
    getConfig(tenant),
  ])
  return {
    listas: listas.datos,
    ofertas: ofertas.datos,
    configRemota: config.datos,
    estado: { listas: listas.estado, ofertas: ofertas.estado, config: config.estado },
    generadoEn: Date.now(),
  }
}

export async function getOfertas(tenant: Tenant): Promise<Lectura<Oferta[]>> {
  const csvUrl = csvUrlDe(tenant.slug)
  const gidOfertas = tenant.sheets.gidOfertas

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return { datos: [], estado: 'error' }
  }
  if (!gidOfertas) {
    console.error(`Tenant ${tenant.slug} sin sheets.gidOfertas`)
    return { datos: [], estado: 'error' }
  }

  const ofertasUrl = urlConGid(csvUrl, gidOfertas)

  try {
    const res = await fetch(urlSinCache(ofertasUrl), FETCH_SIN_CACHE)
    if (!res.ok) {
      console.error('Error fetching CSV de ofertas:', res.status)
      return { datos: [], estado: 'error' }
    }
    const { datos, ok } = leerOfertas(await res.text())
    return { datos, estado: ok ? 'ok' : 'error' }
  } catch (error) {
    console.error('Error en getOfertas:', error)
    return { datos: [], estado: 'error' }
  }
}
