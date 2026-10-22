/*
 * Espera una promesa como maximo `ms`; si tarda mas (o falla), devuelve
 * `valorSiVence`. La promesa original sigue corriendo: solo se deja de esperar.
 * `alVencer` se llama solo si vence el tiempo (para loguear).
 *
 * Modulo sin `@/` ni Next: se testea con `node --test`.
 */
export function conLimite<T>(promesa: Promise<T>, ms: number, valorSiVence: T, alVencer?: () => void): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      alVencer?.()
      resolve(valorSiVence)
    }, ms)
    promesa.then(
      (valor) => {
        clearTimeout(timer)
        resolve(valor)
      },
      () => {
        clearTimeout(timer)
        resolve(valorSiVence)
      },
    )
  })
}
