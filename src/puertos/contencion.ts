/**
 * Puerto `Contencion` — nombrado por su ROL de dominio, no por su tecnología.
 *
 * Traduce una ruta del mundo real —relativa, con `..`, o escondida detrás de
 * un enlace simbólico— en una `RutaContenida` verificada, o en un rechazo
 * tipado.
 *
 * Es la única frontera del sistema que toca el disco para decidir, y existe
 * por una razón concreta: un enlace simbólico solo se puede ver preguntándole
 * al sistema de ficheros. Para una función pura, un enlace es una cadena de
 * texto perfectamente inocente.
 */

import type { ResultadoContencion } from '../dominio/ruta.js'

export interface Contencion {
  /**
   * @param rutaCruda ruta tal como llega del mundo real. Puede ser relativa,
   *                  contener `..`, o apuntar a un enlace simbólico.
   */
  resolver(rutaCruda: string): ResultadoContencion
}
