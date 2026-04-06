interface LogoSVGProps {
  className?: string
}

export default function LogoSVG({ className }: LogoSVGProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Techo rojo */}
      <polygon points="10,45 60,10 110,45" fill="#E31E24" />
      {/* Bolitas decorativas en el arco del techo */}
      <circle cx="25" cy="38" r="3" fill="#FFFFFF" opacity="0.8" />
      <circle cx="37" cy="28" r="3" fill="#FFFFFF" opacity="0.8" />
      <circle cx="49" cy="22" r="3" fill="#FFFFFF" opacity="0.8" />
      <circle cx="60" cy="20" r="3" fill="#FFFFFF" opacity="0.8" />
      <circle cx="71" cy="22" r="3" fill="#FFFFFF" opacity="0.8" />
      <circle cx="83" cy="28" r="3" fill="#FFFFFF" opacity="0.8" />
      <circle cx="95" cy="38" r="3" fill="#FFFFFF" opacity="0.8" />

      {/* Ancla azul marino */}
      {/* Barra vertical */}
      <rect x="57" y="42" width="6" height="38" rx="2" fill="#1E3A8A" />
      {/* Travesaño horizontal */}
      <rect x="45" y="48" width="30" height="5" rx="2" fill="#1E3A8A" />
      {/* Arco inferior */}
      <path
        d="M38,75 Q60,95 82,75"
        fill="none"
        stroke="#1E3A8A"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Puntas del ancla */}
      <polygon points="35,72 42,78 38,68" fill="#1E3A8A" />
      <polygon points="85,72 78,78 82,68" fill="#1E3A8A" />
      {/* Anillo superior */}
      <circle cx="60" cy="42" r="5" fill="none" stroke="#1E3A8A" strokeWidth="3" />

      {/* Soga marrón enrollada */}
      <path
        d="M50,50 Q55,55 60,50 Q65,45 70,50"
        fill="none"
        stroke="#8B6914"
        strokeWidth="2"
        strokeDasharray="4,3"
        strokeLinecap="round"
      />
      <path
        d="M48,58 Q55,63 60,58 Q65,53 72,58"
        fill="none"
        stroke="#8B6914"
        strokeWidth="2"
        strokeDasharray="4,3"
        strokeLinecap="round"
      />
    </svg>
  )
}
