/*
 * La URL del CSV publicado de cada cliente NO va en tenants/<slug>.ts: el
 * repo es publico y esa URL da acceso a la planilla completa del cliente
 * (todas las pestanas). Vive en una variable de entorno de Vercel, una por
 * tenant, con nombre derivado del slug.
 *
 * Alta de un cliente = agregar TENANT_<SLUG>_CSV_URL en Vercel.
 */

export function envKeyCsv(slug: string): string {
  return `TENANT_${slug.toUpperCase().replace(/-/g, '_')}_CSV_URL`
}

export function csvUrlDe(slug: string): string | undefined {
  const value = process.env[envKeyCsv(slug)]
  return value ? value : undefined
}
