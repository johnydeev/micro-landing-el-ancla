import type { Tenant } from '@/types/tenant'

// Generado por `npm run alta` el 2026-10-06. Editable a mano.
export const elLatigo: Tenant = {
  slug: 'el-latigo',
  nombre: 'Frigorífico El Látigo',
  eslogan: '',
  logo: 'logos/el-latigo',

  textos: {
    badgeOferta: 'SUPER OFERTA',
    sinDatos: 'Estamos actualizando la lista de precios.',
  },

  // Paleta del flyer del comercio (amarillo y negro). El amarillo va de
  // fondo porque el primario lleva texto blanco encima (barras, badge).
  paleta: {
    primario: '#111111', // barras de arriba y abajo, precios, badge
    secundario: '#2A2A2A', // fondo del titulo de cada lista
    fondo: '#FFF7A8', // filas claras: amarillo crema, mas suave a pantalla completa
    textoPrimario: '#111111',
    textoSecundario: '#4A4A12', // "por KG", oliva oscuro
    filaImpar: '#F3DD3E', // filas alternadas: amarillo dorado, bien distinto de la clara
    acento: '#F9F908', // amarillo del logo: titulo de cada lista, banda y circulo del cartel
    textoAcento: '#111111',
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
    horarios: 'Lun a Sab de 8 a 13hs y 16 a 20Hs - Dom de 8 a 13Hs.',
    whatsapp: '11 2222 3333',
    instagram: '@frigoellatigo',
  },
}
