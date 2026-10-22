'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { exigirPassword, exigirSesion } from '@/lib/admin-auth'
import { normalizarCodigo } from '@/lib/codigo-alta'
import { siguienteMes } from '@/lib/panel'
import { normalizarRubro } from '@/lib/rubros'
import { rest, rpc } from '@/lib/supabase-rest'

/*
 * Acciones del panel /admin (Parte B). Las Server Actions son endpoints POST
 * publicos: cada una llama exigirSesion() PRIMERO (fuera de cualquier
 * try/catch: redirect lanza una excepcion interna). Ninguna tira a la UI:
 * base caida o dato raro = { ok: false, error } legible.
 */

export type ResultadoAccion = { ok: true } | { ok: false; error: string }

const ERROR_BASE: ResultadoAccion = { ok: false, error: 'No se pudo conectar con la base. Probá de nuevo.' }
const PASSWORD_MALA: ResultadoAccion = { ok: false, error: 'Contraseña incorrecta' }
const OK: ResultadoAccion = { ok: true }

const MAX_RUBROS = 30
const MAX_LARGO_RUBRO = 60

function refrescar() {
  revalidatePath('/admin')
  revalidatePath('/admin/bajas')
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= 100
}

/* Fecha de calendario real 'AAAA-MM-DD' (rechaza 2026-02-30). */
function esFecha(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const d = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor
}

/*
 * Rubros canonicos (normalizarRubro, el mismo criterio de la planilla), sin
 * repetidos; [] = Todo -> null en la base. undefined si la forma no es valida.
 */
function limpiarRubros(valor: unknown): string[] | null | undefined {
  if (!Array.isArray(valor) || valor.length > MAX_RUBROS) return undefined
  const rubros = new Set<string>()
  for (const r of valor) {
    if (typeof r !== 'string') return undefined
    const limpio = normalizarRubro(r)
    if (!limpio || limpio.length > MAX_LARGO_RUBRO) return undefined
    rubros.add(limpio)
  }
  return rubros.size === 0 ? null : [...rubros].sort((a, b) => a.localeCompare(b, 'es'))
}

/* PATCH que devuelve las filas tocadas; null = falla de base. */
async function patch(path: string, cambios: object): Promise<unknown[] | null> {
  const respuesta = await rest(path, {
    method: 'PATCH',
    body: JSON.stringify(cambios),
    headers: { Prefer: 'return=representation' },
  })
  if (!respuesta) return null
  try {
    const filas = await respuesta.json()
    return Array.isArray(filas) ? filas : null
  } catch {
    return null
  }
}

/* GET de filas; null = falla de base. */
async function leer<T>(path: string): Promise<T[] | null> {
  const respuesta = await rest(path)
  if (!respuesta) return null
  try {
    const filas = await respuesta.json()
    return Array.isArray(filas) ? (filas as T[]) : null
  } catch {
    return null
  }
}

/* 6 caracteres base36, mismo criterio que scripts/activar.mts. */
function idTeleNuevo(): string {
  return BigInt(`0x${randomBytes(5).toString('hex')}`).toString(36).padStart(6, '0').slice(-6)
}

const q = encodeURIComponent

export async function cambiarSwitch(teleId: string, activa: boolean): Promise<ResultadoAccion> {
  await exigirSesion()
  if (!esTexto(teleId) || typeof activa !== 'boolean') return { ok: false, error: 'Datos inválidos' }
  const filas = await patch(`teles?id=eq.${q(teleId)}`, { activa })
  if (!filas) return ERROR_BASE
  if (filas.length === 0) return { ok: false, error: 'No se encontró la tele' }
  refrescar()
  return OK
}

export async function cambiarTodas(slug: string, activa: boolean): Promise<ResultadoAccion> {
  await exigirSesion()
  if (!esTexto(slug) || typeof activa !== 'boolean') return { ok: false, error: 'Datos inválidos' }
  const filas = await patch(`teles?comercio=eq.${q(slug)}`, { activa })
  if (!filas) return ERROR_BASE
  refrescar()
  return OK
}

export async function registrarPago(slug: string): Promise<ResultadoAccion> {
  await exigirSesion()
  if (!esTexto(slug)) return { ok: false, error: 'Datos inválidos' }
  /* La fecha se lee de la base (no del navegador): "Pago" corre la fecha guardada. */
  const filas = await leer<{ pagado_hasta: string | null }>(`comercios?slug=eq.${q(slug)}&select=pagado_hasta`)
  if (!filas) return ERROR_BASE
  if (filas.length === 0) return { ok: false, error: 'No se encontró el cliente' }
  const actual = filas[0].pagado_hasta
  if (!actual) return { ok: false, error: 'Cargá la fecha de pago primero' }
  if (!esFecha(actual)) return { ok: false, error: 'La fecha guardada es inválida: cargala de nuevo' }

  /* Condicion sobre la fecha anterior: dos "Pago" a la vez (dos pestanas) no corren dos meses. */
  const tocadas = await patch(`comercios?slug=eq.${q(slug)}&pagado_hasta=eq.${actual}`, {
    pagado_hasta: siguienteMes(actual),
  })
  if (!tocadas) return ERROR_BASE
  if (tocadas.length === 0) return { ok: false, error: 'La fecha cambió mientras tanto: revisala' }
  refrescar()
  return OK
}

export async function cambiarFechaPago(slug: string, fecha: string): Promise<ResultadoAccion> {
  await exigirSesion()
  if (!esTexto(slug)) return { ok: false, error: 'Datos inválidos' }
  if (!esFecha(fecha)) return { ok: false, error: 'Fecha inválida' }
  const filas = await patch(`comercios?slug=eq.${q(slug)}`, { pagado_hasta: fecha })
  if (!filas) return ERROR_BASE
  if (filas.length === 0) return { ok: false, error: 'No se encontró el cliente' }
  refrescar()
  return OK
}

type RespuestaActivar = { ok: true; comercio: string } | { ok: false; motivo: string }

const MOTIVOS_ALTA: Record<string, string> = {
  invalido: 'Ese código no existe',
  vencido: 'El código venció: esperá que la tele muestre uno nuevo',
  usado: 'Ese código ya se usó',
  comercio: 'El cliente está dado de baja',
}

export async function nuevaTele(slug: string, codigo: string, rubros: string[]): Promise<ResultadoAccion> {
  await exigirSesion()
  if (!esTexto(slug) || typeof codigo !== 'string') return { ok: false, error: 'Datos inválidos' }
  const normalizado = normalizarCodigo(codigo)
  if (!normalizado) return { ok: false, error: 'El código tiene 6 caracteres (ej. K7M-2QX)' }
  const rubrosLimpios = limpiarRubros(rubros)
  if (rubrosLimpios === undefined) return { ok: false, error: 'Rubros inválidos' }

  /* Antes de activar: el codigo tiene que ser de ESTE cliente (no se activa nada si no). */
  const codigos = await leer<{ comercio: string }>(`codigos_alta?codigo=eq.${normalizado}&select=comercio`)
  if (!codigos) return ERROR_BASE
  if (codigos.length === 0) return { ok: false, error: MOTIVOS_ALTA.invalido }
  if (codigos[0].comercio !== slug) return { ok: false, error: 'Ese código es de otro cliente' }

  /*
   * Segundo intento solo si el primero fallo sin respuesta (ej. id repetido,
   * rarisimo). Si el primero en realidad entro y se perdio la respuesta, el
   * segundo dice "usado": se mira si el codigo quedo con alguno de nuestros ids.
   */
  const intentados: string[] = []
  for (let intento = 0; intento < 2; intento++) {
    const id = idTeleNuevo()
    intentados.push(id)
    const r = await rpc<RespuestaActivar>('activar_codigo_alta', {
      p_codigo: normalizado,
      p_tele_id: id,
      p_rubros: rubrosLimpios,
    })
    if (!r) continue
    if (r.ok) {
      refrescar()
      return OK
    }
    if (r.motivo === 'usado' && intento > 0) {
      const usados = await leer<{ tele_id: string | null }>(`codigos_alta?codigo=eq.${normalizado}&select=tele_id`)
      if (usados?.[0]?.tele_id && intentados.includes(usados[0].tele_id)) {
        refrescar()
        return OK
      }
    }
    return { ok: false, error: MOTIVOS_ALTA[r.motivo] ?? 'No se pudo activar el código' }
  }
  return ERROR_BASE
}

export async function cambiarRubros(teleId: string, rubros: string[], password: string): Promise<ResultadoAccion> {
  await exigirSesion()
  if (!esTexto(teleId)) return { ok: false, error: 'Datos inválidos' }
  const rubrosLimpios = limpiarRubros(rubros)
  if (rubrosLimpios === undefined) return { ok: false, error: 'Rubros inválidos' }
  if (typeof password !== 'string' || !(await exigirPassword(password))) return PASSWORD_MALA
  const filas = await patch(`teles?id=eq.${q(teleId)}`, { rubros: rubrosLimpios })
  if (!filas) return ERROR_BASE
  if (filas.length === 0) return { ok: false, error: 'No se encontró la tele' }
  refrescar()
  return OK
}

export async function darDeBaja(slug: string, password: string): Promise<ResultadoAccion> {
  await exigirSesion()
  if (!esTexto(slug)) return { ok: false, error: 'Datos inválidos' }
  if (typeof password !== 'string' || !(await exigirPassword(password))) return PASSWORD_MALA
  const filas = await patch(`comercios?slug=eq.${q(slug)}`, { dado_de_baja: true })
  if (!filas) return ERROR_BASE
  if (filas.length === 0) return { ok: false, error: 'No se encontró el cliente' }
  refrescar()
  return OK
}

export async function reactivar(slug: string): Promise<ResultadoAccion> {
  await exigirSesion()
  if (!esTexto(slug)) return { ok: false, error: 'Datos inválidos' }
  const filas = await patch(`comercios?slug=eq.${q(slug)}`, { dado_de_baja: false })
  if (!filas) return ERROR_BASE
  if (filas.length === 0) return { ok: false, error: 'No se encontró el cliente' }
  refrescar()
  return OK
}
