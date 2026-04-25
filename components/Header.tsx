'use client'

import { useState } from 'react'
import { negocioConfig } from '@/config/negocio'
import LogoSVG from './LogoSVG'

export default function Header() {
  const [imgError, setImgError] = useState(false)

  return (
    <header
      className="flex items-center justify-center px-10 py-[0.7vh]"
      style={{ height: '16%', backgroundColor: '#E31E24' }}
    >
      {/* Izquierda: Logo + texto */}
      <div className="flex items-center gap-[1.5vw]">
        {imgError ? (
          <LogoSVG className="h-[10vh] w-auto" />
        ) : (
          <img
            src={negocioConfig.logo}
            alt={negocioConfig.nombre}
            className="h-[10vh] w-auto"
            onError={() => setImgError(true)}
          />
        )}
        <div className="flex flex-col">
          <span
            className="font-bold text-white uppercase tracking-wider"
            style={{ fontSize: 'clamp(14px, 2.2vw, 36px)' }}
          >
            {negocioConfig.nombre}
          </span>
          <span
            className="text-white/90 italic"
            style={{ fontSize: 'clamp(8px, 1vw, 18px)' }}
          >
            {negocioConfig.eslogan}
          </span>
        </div>
      </div>

      {/* Derecha: Ofertas
      <div className="flex flex-col items-end text-white pr-10">
        <span
          className="tracking-wide"
          style={{ fontSize: 'clamp(8px, 1.2vw, 20px)' }}
        >
          ✦ {negocioConfig.tagline} ✦
        </span>
        <span
          className="font-black uppercase"
          style={{ fontSize: 'clamp(16px, 3.2vw, 52px)', lineHeight: 1 }}
        >
          {negocioConfig.titulo}
        </span>
      </div> */}
    </header>
  )
}
