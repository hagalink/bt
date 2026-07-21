/**
 * La Política es DATOS, no código.
 *
 * Cambiar qué puede hacer BT es editar esta estructura. Nunca es editar la
 * lógica de la Guardia. Si algún día un permiso exige tocar `guardia.ts`, el
 * diseño se ha roto.
 *
 * Este fichero no importa nada. El núcleo es puro.
 */

import type { Regimen, TipoIntencion } from './intencion.js'

export type Politica = {
  /** Raíz absoluta y ya resuelta del proyecto. El perímetro exterior. */
  readonly raiz: string
  /**
   * Subárboles, relativos a la raíz, en régimen `inexistente` aunque estén
   * DENTRO del perímetro.
   *
   * Existe por una razón concreta: el registro de auditoría vive en `logs/`,
   * dentro del proyecto. Sin esta lista, una intención de borrado sobre el
   * propio registro pasaría la contención de rutas y el modelo podría proponer
   * borrar la evidencia. El perímetro se defiende a sí mismo antes que a nada.
   */
  readonly zonasExcluidas: readonly string[]
  readonly regimenes: Readonly<Record<TipoIntencion, Regimen>>
}

/** Los regímenes del MVP. Leer no toca nada; escribir y borrar sí. */
export const REGIMENES_MVP: Readonly<Record<TipoIntencion, Regimen>> = {
  leer_fichero: 'autonomo',
  escribir_fichero: 'delegado',
  borrar_fichero: 'consultado',
}

/** El subárbol del registro de auditoría. */
export const ZONAS_EXCLUIDAS_MVP: readonly string[] = ['logs']

export function crearPolitica(
  raiz: string,
  zonasExcluidas: readonly string[] = ZONAS_EXCLUIDAS_MVP,
  regimenes: Readonly<Record<TipoIntencion, Regimen>> = REGIMENES_MVP,
): Politica {
  return { raiz, zonasExcluidas, regimenes }
}
