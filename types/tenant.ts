import type { PlantillaCartelId } from '@/lib/plantillas'

/*
 * Configuracion de un comercio (tenant). Un archivo por cliente en tenants/,
 * registrado en tenants/index.ts. Lo que NO esta aca: la URL del CSV de su
 * planilla (env TENANT_<SLUG>_CSV_URL, ver lib/tenant-env.ts).
 */
export interface Tenant {
  /** Segmento de URL: /<slug>. Igual a la clave en el registro. */
  slug: string
  nombre: string
  eslogan: string
  /** public_id del logo en Cloudinary, ej. "logos/granja-elancla". */
  logo: string
  textos: {
    /** Badge del cartel de oferta. El Ancla: "SUPER OFERTA". */
    badgeOferta: string
    /** Primera linea del empty state de la tabla. */
    sinDatos: string
  }
  paleta: {
    primario: string
    secundario: string
    fondo: string
    textoPrimario: string
    textoSecundario: string
    filaImpar: string
  }
  /** Escala en %: 100 = normal, 115 = 15% mas grande. */
  tipografia: {
    tabla: number
    footer: number
  }
  plantillaCartelDefault: PlantillaCartelId
  sheets: {
    gidOfertas: string
    gidConfig: string
  }
  /** Fallback si la pestana CONFIG del Sheets no trae la clave. */
  defaults: {
    segundosCartel: number
    segundosTabla: number
    horarios: string
    whatsapp: string
    instagram: string
  }
}
