'use client'

import { useState, type CSSProperties } from 'react'

import type { Oferta } from '@/types'
import type { Tenant } from '@/types/tenant'
import { formatPrecio } from '@/lib/precio'
import { urlOferta } from '@/lib/cloudinary'
import styles from '@/app/page.module.css'

export interface CartelProps {
  oferta: Oferta
  textos: Tenant['textos']
}

/*
 * Mapeo de la escala 1-10 de la columna "tamano" del Sheets a un porcentaje
 * del wrapper de la imagen. Lineal: rango 55%-120%, paso de ~7,22% entre
 * niveles (redondeado a entero). El default es el nivel 6 (= 91%).
 * Ampliado a rango 55-120% en sesion 14 (antes 55-100%) porque el cliente
 * queria que las imagenes mas grandes pudieran exceder el wrapper.
 *
 * OJO: niveles 8-10 (>100%) hacen que la imagen sea mas grande que su
 * contenedor y pueda solaparse con el titulo o el circulo de precio del
 * cartel. Es intencional (el cliente lo pidio) pero hay que usar esos
 * valores altos solo en imagenes que visualmente lo toleren.
 */
const TAMANO_OFERTA_A_ESCALA: Record<number, string> = {
  1: '55%',
  2: '62%',
  3: '69%',
  4: '77%',
  5: '84%',
  6: '91%',
  7: '98%',
  8: '106%',
  9: '113%',
  10: '120%',
}

const TAMANO_OFERTA_ESCALA_DEFAULT = TAMANO_OFERTA_A_ESCALA[6]

/*
 * Cartel clasico: badge a la izquierda sobre diagonal, foto al centro,
 * precio en circulo. Sin colores fijos (CSS vars --c-*). El badge y el
 * empty state salen de tenant.textos, asi que sirve para cualquier rubro.
 */
export default function CartelClasico({ oferta, textos }: CartelProps) {
  const [imgError, setImgError] = useState(false)

  // El contrato con el cliente es cargar un slug del catalogo. Aun asi
  // re-slugificamos para que la pantalla no se rompa si se equivoca, y lo
  // logueamos solo en dev.
  const slug = oferta.imagen.toLowerCase().trim().replace(/\s+/g, '-')
  if (process.env.NODE_ENV !== 'production' && slug !== oferta.imagen) {
    console.warn(
      `[ofertas] "${oferta.imagen}" se re-slugify como "${slug}". ` +
        `Cargar el slug correcto en la planilla (columna "slug imagen").`,
    )
  }

  const escalaImagen = TAMANO_OFERTA_A_ESCALA[oferta.tamano] ?? TAMANO_OFERTA_ESCALA_DEFAULT
  const imageVars = { '--cartel-image-scale': escalaImagen } as CSSProperties

  // Las dos lineas del badge: "SUPER OFERTA" -> SUPER / OFERTA. Si el tenant
  // usa una sola palabra ("OFERTA"), va en una linea.
  const [badgeArriba, ...badgeResto] = textos.badgeOferta.split(' ')

  return (
    <div className={styles.cartel}>
      <div className={styles.cartelDiagonal} />

      <div className={`${styles.cartelBadge} ${styles.pulseSuperOferta}`}>
        {badgeArriba}
        {badgeResto.length > 0 && (
          <>
            <br />
            {badgeResto.join(' ')}
          </>
        )}
      </div>

      {oferta.descripcion && (
        <div className={styles.cartelAclaracion}>
          {/* Cada coma en la celda "Nota" del Sheets es un salto de linea
              explicito, para que el cliente controle el corte sin depender
              del wrap automatico del CSS. */}
          {oferta.descripcion
            .split(',')
            .map((linea) => linea.trim())
            .filter(Boolean)
            .map((linea, i) => (
              <div key={i}>{linea}</div>
            ))}
        </div>
      )}

      <div className={styles.cartelTitleWrap}>
        <div className={styles.cartelTitle}>{oferta.nombre}</div>
      </div>

      {!imgError && (
        <div className={styles.cartelImageWrap}>
          {/* crossOrigin: la respuesta de Cloudinary llega como CORS (no
              opaca) y el Service Worker la puede cachear sin el padding de
              cuota que Chrome aplica a respuestas opacas. */}
          <img
            src={urlOferta(slug)}
            alt={oferta.nombre}
            width={800}
            height={800}
            crossOrigin="anonymous"
            onError={() => setImgError(true)}
            className={`${styles.cartelImage} ${styles.pulseImage}`}
            style={imageVars}
          />
        </div>
      )}

      <div className={`${styles.cartelPrice} ${styles.pulsePrice}`}>
        <span className={styles.cartelPriceText}>{formatPrecio(oferta.precio)}</span>
      </div>
    </div>
  )
}
