import { NextResponse, type NextRequest } from 'next/server'

import { COOKIE_TELE, OPCIONES_COOKIE_TELE, verificarCookie } from '@/lib/activacion'

/*
 * Renueva la cookie de la tele en cada visita: la cookie vive 400 dias contando
 * desde la ultima vez que se seteo, asi una tele que anda no vence nunca.
 * Cookie ausente o invalida: no se toca (ni se borra). Cualquier excepcion:
 * la request sigue sin cambios, esto nunca puede romper la carga.
 * Runtime: Node.js (default de proxy en Next 16), por eso sirve node:crypto.
 */
export function proxy(request: NextRequest) {
  try {
    const secreto = process.env.ACTIVACION_SECRET
    const valor = request.cookies.get(COOKIE_TELE)?.value
    if (!secreto || !valor || !verificarCookie(valor, secreto)) return NextResponse.next()

    const respuesta = NextResponse.next()
    respuesta.cookies.set(COOKIE_TELE, valor, OPCIONES_COOKIE_TELE)
    return respuesta
  } catch {
    return NextResponse.next()
  }
}

/* Ojo: el punto va como [.] porque Next descarta el backslash de \. al compilar el matcher
   y '.*..*' dejaria afuera cualquier ruta con al menos un caracter. */
export const config = {
  matcher: ['/', '/((?!api|admin|activar|_next|.*[.].*).*)'],
}
