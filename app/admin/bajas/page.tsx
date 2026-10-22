import BotonReactivar from '@/components/admin/BotonReactivar'
import NavAdmin from '@/components/admin/NavAdmin'
import styles from '@/components/admin/panel.module.css'
import TarjetaCliente from '@/components/admin/TarjetaCliente'
import { exigirSesion } from '@/lib/admin-auth'
import { listarClientes } from '@/lib/admin-datos'

/* Vista Bajas: comercios con dado_de_baja = true con Reactivar (un clic). */
export default async function BajasPage() {
  await exigirSesion()
  const { clientes, ahoraMs } = await cargar()
  const bajas = (clientes ?? [])
    .filter((c) => c.dadoDeBaja)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <>
      <NavAdmin actual="bajas" />
      <h1 className={styles.titulo}>Bajas</h1>
      {clientes === null ? (
        <p className={styles.error}>No se pudo leer la base, probá en un rato.</p>
      ) : bajas.length === 0 ? (
        <p className={styles.vacio}>No hay clientes dados de baja.</p>
      ) : (
        <div className={styles.lista}>
          {bajas.map((c) => (
            <TarjetaCliente key={c.slug} cliente={c} ahoraMs={ahoraMs} acciones={<BotonReactivar slug={c.slug} />} />
          ))}
        </div>
      )}
    </>
  )
}

/* Fuera del componente: el "ahora" se toma una vez por request, despues de leer la base. */
async function cargar() {
  const clientes = await listarClientes()
  return { clientes, ahoraMs: Date.now() }
}
