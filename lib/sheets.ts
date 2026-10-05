import 'server-only'

import type { ConfigNegocio, ListaPrecios, Oferta } from '@/types'
import type { Tenant } from '@/types/tenant'
import { parsearConfig, parsearListas, parsearOfertas } from '@/lib/planilla'
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

export async function getListasPrecios(tenant: Tenant): Promise<ListaPrecios[]> {
  const csvUrl = csvUrlDe(tenant.slug)

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return []
  }

  try {
    const res = await fetch(urlSinCache(csvUrl), FETCH_SIN_CACHE)

    if (!res.ok) {
      console.error('Error fetching CSV:', res.status, res.statusText)
      return []
    }

    return parsearListas(await res.text())
  } catch (error) {
    console.error('Error en getListasPrecios:', error)
    return []
  }
}

export async function getConfig(tenant: Tenant): Promise<ConfigNegocio> {
  const csvUrl = csvUrlDe(tenant.slug)
  const gidConfig = tenant.sheets.gidConfig

  if (!csvUrl || !gidConfig) {
    return {}
  }

  const configUrl = urlConGid(csvUrl, gidConfig)

  try {
    const res = await fetch(urlSinCache(configUrl), FETCH_SIN_CACHE)
    if (!res.ok) {
      console.error('Error fetching CSV de configuracion:', res.status)
      return {}
    }
    return parsearConfig(await res.text())
  } catch (error) {
    console.error('Error en getConfig:', error)
    return {}
  }
}

export async function getPantallaData(tenant: Tenant): Promise<{
  listas: ListaPrecios[]
  ofertas: Oferta[]
  configRemota: ConfigNegocio
}> {
  const [listas, ofertas, configRemota] = await Promise.all([
    getListasPrecios(tenant),
    getOfertas(tenant),
    getConfig(tenant),
  ])
  return { listas, ofertas, configRemota }
}

export async function getOfertas(tenant: Tenant): Promise<Oferta[]> {
  const csvUrl = csvUrlDe(tenant.slug)
  const gidOfertas = tenant.sheets.gidOfertas

  if (!csvUrl) {
    console.error(`Falta la variable de entorno ${envKeyCsv(tenant.slug)}`)
    return []
  }
  if (!gidOfertas) {
    console.error(`Tenant ${tenant.slug} sin sheets.gidOfertas`)
    return []
  }

  const ofertasUrl = urlConGid(csvUrl, gidOfertas)

  try {
    const res = await fetch(urlSinCache(ofertasUrl), FETCH_SIN_CACHE)
    if (!res.ok) {
      console.error('Error fetching CSV de ofertas:', res.status)
      return []
    }
    return parsearOfertas(await res.text())
  } catch (error) {
    console.error('Error en getOfertas:', error)
    return []
  }
}
