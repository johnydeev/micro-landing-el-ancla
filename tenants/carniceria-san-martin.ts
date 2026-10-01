import type { Tenant } from '@/types/tenant'

// Generado por `npm run alta` el 2026-10-01. Editable a mano.
export const carniceriaSanMartin: Tenant = {
  slug: 'carniceria-san-martin',
  nombre: 'Carnicería San Martín',
  eslogan: 'Desde 1972, calidad de barrio',
  logo: 'logos/carniceria-san-martin',

  textos: {
    badgeOferta: 'SUPER OFERTA',
    sinDatos: 'Estamos actualizando la lista de precios.',
  },

  paleta: {
    primario: '#1B5E20',
    secundario: '#212121',
    fondo: '#FFFFFF',
    textoPrimario: '#212121',
    textoSecundario: '#6B7280',
    filaImpar: '#EDF2ED',
  },

  tipografia: {
    tabla: 230,
    footer: 135,
  },

  plantillaCartelDefault: 'clasico',

  sheets: {
    gidOfertas: '1771634698',
    gidConfig: '261041124',
  },

  defaults: {
    segundosCartel: 3,
    segundosTabla: 3,
    horarios: 'MAR a SAB: 8 a 13hs y 16:30 a 20:30hs | DOM: 8 a 13hs',
    whatsapp: '11 5555 4444',
    instagram: '@carniceria_sanmartin',
  },
}
