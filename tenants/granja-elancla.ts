import type { Tenant } from '@/types/tenant'

export const granjaElAncla: Tenant = {
  slug: 'granja-elancla',
  nombre: 'Granja El Ancla',
  eslogan: 'Desde 1984, una tradición en Florencio Varela',
  logo: 'logos/granja-elancla',

  textos: {
    badgeOferta: 'SUPER OFERTA',
    sinDatos: 'Estamos actualizando la lista de precios.',
  },

  paleta: {
    primario: '#E31E24',
    secundario: '#1E3A8A',
    fondo: '#FFFFFF',
    textoPrimario: '#1E3A8A',
    textoSecundario: '#6b7280',
    filaImpar: '#FFF0F0',
  },

  tipografia: {
    tabla: 230,
    footer: 135,
  },

  plantillaCartelDefault: 'clasico',

  sheets: {
    gidOfertas: '2121126279',
    gidConfig: '1038483630',
  },

  defaults: {
    segundosCartel: 3,
    segundosTabla: 3,
    horarios: 'MAR a SAB: 8:15 a 13hs y 16:30 a 20:15hs | DOM: 8:15 a 13hs',
    whatsapp: '11 6000 7394',
    instagram: '@granja_elancla',
  },
}
