/**
 * La contención de rutas. Función pura. Responde a UNA pregunta:
 * ¿está esta ruta dentro del perímetro?
 *
 * Es la mitad de la decisión. La otra mitad —¿está permitida esta acción?—
 * vive en `guardia.ts`. Separarlas no es cosmética: son dos preguntas
 * distintas, con dos motivos de rechazo distintos, y mezclarlas hace que
 * ninguna de las dos se pueda auditar de un vistazo.
 *
 * Lo que esta función NO hace: resolver. No toca el disco, no sigue enlaces
 * simbólicos, no consulta si un fichero existe. Exige que la ruta llegue ya
 * resuelta, y ese trabajo es de un adaptador.
 *
 * Este fichero no importa nada en tiempo de ejecución. El núcleo es puro.
 */

import type { MotivoRechazo } from './intencion.js'
import type { Politica } from './politica.js'

/**
 * BT es Linux (Wayland, GNOME). El separador es `/`.
 *
 * Se declara aquí en vez de importar `node:path` para que `dominio/` no
 * importe NADA de la plataforma. La pureza del núcleo es una invariante, no
 * una aspiración.
 */
const SEPARADOR = '/'

/**
 * Marca privada de la contención.
 *
 * `declare const` con `unique symbol`: existe para el compilador, no en
 * tiempo de ejecución. Como este símbolo no se exporta, NINGÚN otro módulo
 * puede construir un valor de tipo `RutaContenida`. La única vía es `contener`.
 *
 * Consecuencia: la Guardia no puede decidir sobre una ruta que no haya pasado
 * por el perímetro, porque no compila. Igual que `IntencionAutorizada`, la
 * garantía la impone el compilador y no la disciplina de quien escribe.
 *
 * Por qué el tipo vive en `dominio/` y no en el adaptador: si viviera fuera,
 * la Guardia tendría que importar de `adaptadores/`, y ninguna flecha sale
 * del núcleo hacia afuera (invariante nº2). El adaptador hace el I/O y delega
 * aquí la decisión.
 */
declare const marcaContenida: unique symbol

export type RutaContenida = {
  readonly [marcaContenida]: true
  /** Ruta absoluta, resuelta y verificada contra la raíz del proyecto. */
  readonly absoluta: string
}

export type ResultadoContencion =
  | { readonly ok: true; readonly ruta: RutaContenida }
  | { readonly ok: false; readonly motivo: MotivoRechazo }

/**
 * La ÚNICA fábrica de `RutaContenida`. No se exporta.
 *
 * La aserción de tipo de esta línea es el privilegio completo de la
 * contención, y está contenida en una sola función para que se pueda auditar
 * de un vistazo.
 */
function sellar(absoluta: string): RutaContenida {
  return { absoluta } as RutaContenida
}

/**
 * Una ruta está "resuelta" si no queda nada por interpretar: sin `.`, sin
 * `..`, sin segmentos vacíos (que es lo que produce `//` o una barra final).
 *
 * Esto NO sustituye a `realpathSync` en el adaptador: los enlaces simbólicos
 * solo se pueden detectar tocando el disco. Aquí se cierra la puerta a lo que
 * se puede cerrar sin I/O.
 */
function estaResuelta(ruta: string): boolean {
  const segmentos = ruta.split(SEPARADOR).slice(1)
  return segmentos.every((s) => s !== '' && s !== '.' && s !== '..')
}

/**
 * Contención por prefijo, con el separador incluido a propósito.
 *
 * Sin el separador, `/casa/proyecto-malo` empieza por `/casa/proyecto` y
 * colaría. Con él, no. La raíz misma tampoco es un objetivo válido: es un
 * directorio, no un fichero sobre el que actuar.
 */
function estaDentroDe(ruta: string, prefijo: string): boolean {
  return ruta.startsWith(prefijo + SEPARADOR)
}

function rechazar(motivo: MotivoRechazo): ResultadoContencion {
  return { ok: false, motivo }
}

/**
 * Traduce una ruta ya resuelta en una `RutaContenida`, o en un rechazo tipado.
 *
 * El orden de las comprobaciones importa y va de fuera hacia dentro: forma de
 * la ruta, perímetro exterior y, por último, zonas reservadas. Así el motivo
 * de rechazo es siempre el más preciso disponible — un `logs/` de otro
 * proyecto está fuera de la raíz, no en una zona excluida.
 */
export function contener(rutaResuelta: string, politica: Politica): ResultadoContencion {
  if (!rutaResuelta.startsWith(SEPARADOR)) return rechazar('ruta_no_absoluta')
  if (!estaResuelta(rutaResuelta)) return rechazar('ruta_no_resuelta')
  if (!estaDentroDe(rutaResuelta, politica.raiz)) return rechazar('ruta_fuera_de_raiz')

  for (const zona of politica.zonasExcluidas) {
    const raizDeZona = politica.raiz + SEPARADOR + zona
    if (rutaResuelta === raizDeZona || estaDentroDe(rutaResuelta, raizDeZona)) {
      return rechazar('ruta_en_zona_excluida')
    }
  }

  return { ok: true, ruta: sellar(rutaResuelta) }
}
