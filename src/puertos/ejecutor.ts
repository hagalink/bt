/**
 * Puerto `Ejecutor` — nombrado por su ROL de dominio.
 *
 * Las manos del perímetro. Y la firma es la pieza importante de este fichero:
 *
 *     ejecutar(autorizada: IntencionAutorizada)
 *
 * NO acepta `Intencion`. Solo acepta el tipo sellado que únicamente la Guardia
 * sabe construir. Desde que existe este puerto, saltarse la Guardia deja de
 * ser una mala práctica y pasa a ser un error de compilación CON CONSECUENCIA:
 * la invariante nº4 ya no es una demostración de laboratorio, es la única
 * puerta por la que se entra al disco.
 */

import type { IntencionAutorizada } from '../dominio/guardia.js'

export type FalloEjecucion =
  /** El fichero no está. */
  | 'no_existe'
  /** Es un directorio. El MVP opera sobre ficheros, nunca sobre árboles. */
  | 'no_es_un_fichero'
  /**
   * La ruta se convirtió en un enlace simbólico entre la resolución y la
   * apertura. Es la ventana TOCTOU que #1 dejó documentada, y se cierra aquí.
   */
  | 'enlace_simbolico'
  | 'sin_permiso'
  | 'error_de_entrada_salida'

export type ResultadoEjecucion =
  | { readonly ok: true; readonly tipo: 'leido'; readonly contenido: string }
  | { readonly ok: true; readonly tipo: 'escrito'; readonly bytes: number }
  | { readonly ok: true; readonly tipo: 'borrado' }
  | { readonly ok: false; readonly fallo: FalloEjecucion }

export interface Ejecutor {
  ejecutar(autorizada: IntencionAutorizada): Promise<ResultadoEjecucion>
}
