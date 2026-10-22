import AccionesCliente from '@/components/admin/AccionesCliente'
import Avisos from '@/components/admin/Avisos'
import ControlesTele from '@/components/admin/ControlesTele'
import NavAdmin from '@/components/admin/NavAdmin'
import styles from '@/components/admin/panel.module.css'
import TarjetaCliente from '@/components/admin/TarjetaCliente'
import { exigirSesion } from '@/lib/admin-auth'
import { type ClienteAdmin, listarClientes, rubrosDePlanilla } from '@/lib/admin-datos'
import { etiquetaRubros } from '@/lib/panel'

/* Vista Clientes: comercios activos (dado_de_baja = false) con sus teles. */
export default async function AdminPage() {
  await exigirSesion()
  const { clientes, rubros, ahoraMs } = await cargar()

  return (
    <>
      <NavAdmin actual="clientes" />
      <h1 className={styles.titulo}>Clientes</h1>
      {clientes === null ? (
        <p className={styles.error}>No se pudo leer la base, probá en un rato.</p>
      ) : (
        <ListaClientes clientes={clientes.filter((c) => !c.dadoDeBaja)} rubros={rubros} ahoraMs={ahoraMs} />
      )}
    </>
  )
}

function ListaClientes({
  clientes,
  rubros,
  ahoraMs,
}: {
  clientes: ClienteAdmin[]
  rubros: Map<string, string[]>
  ahoraMs: number
}) {
  if (clientes.length === 0) return <p className={styles.vacio}>No hay clientes activos.</p>
  const ordenados = [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return (
    <>
      <Avisos clientes={ordenados} ahoraMs={ahoraMs} />
      <div className={styles.lista}>
        {ordenados.map((c) => {
          const opciones = rubros.get(c.slug) ?? []
          return (
            <TarjetaCliente
              key={c.slug}
              cliente={c}
              ahoraMs={ahoraMs}
              acciones={
                <AccionesCliente
                  slug={c.slug}
                  nombre={c.nombre}
                  pagadoHasta={c.pagadoHasta}
                  cantidadTeles={c.teles.length}
                  algunaPrendida={c.teles.some((t) => t.activa)}
                  opciones={opciones}
                />
              }
              controlesTele={(t) => (
                <ControlesTele
                  teleId={t.id}
                  activa={t.activa}
                  rubros={t.rubros}
                  etiqueta={etiquetaRubros(t.rubros)}
                  opciones={opciones}
                />
              )}
            />
          )
        })}
      </div>
    </>
  )
}

/* Fuera del componente: el "ahora" se toma una vez por request, despues de leer la base. */
async function cargar() {
  const clientes = await listarClientes()
  /* Rubros elegibles (Nueva tele / Cambiar rubros) de la planilla de cada cliente activo, en paralelo. */
  const activos = (clientes ?? []).filter((c) => !c.dadoDeBaja)
  const listas = await Promise.all(activos.map((c) => rubrosDePlanilla(c.slug)))
  const rubros = new Map(activos.map((c, i) => [c.slug, listas[i]]))
  return { clientes, rubros, ahoraMs: Date.now() }
}
