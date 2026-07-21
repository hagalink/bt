/**
 * Lo que el modelo PROPONE.
 *
 * Esta unión discriminada es la lista blanca entera del sistema. No hay
 * `ejecutar_comando`, no hay `eval`, no hay una vía de escape. Lo que no está
 * aquí no está prohibido: NO EXISTE.
 *
 * Este fichero no importa nada. El núcleo es puro.
 */

export type TipoIntencion = 'leer_fichero' | 'escribir_fichero' | 'borrar_fichero'

export type Intencion =
  | { readonly tipo: 'leer_fichero'; readonly ruta: string }
  | { readonly tipo: 'escribir_fichero'; readonly ruta: string; readonly contenido: string }
  | { readonly tipo: 'borrar_fichero'; readonly ruta: string }

/**
 * Los cuatro regímenes de permiso. El eje del diseño.
 *
 * La frontera entre `autonomo` y `delegado` es la REVERSIBILIDAD, no la
 * cantidad: en cuanto una acción toca el disco, deja de ser autónoma.
 */
export type Regimen =
  /** Sé qué pasa y no rompe nada. Se ejecuta sin preguntar. */
  | 'autonomo'
  /** Perímetro contenido + vía de vuelta. Se ejecuta sin preguntar. */
  | 'delegado'
  /** El humano confirma, y PUEDE entender lo que aprueba. */
  | 'consultado'
  /** Ni preguntando. No hay capacidad. */
  | 'inexistente'

export type MotivoRechazo =
  /** La Guardia solo decide sobre rutas absolutas. */
  | 'ruta_no_absoluta'
  /** Resolver `..`, `.` y enlaces simbólicos es I/O: no es asunto del núcleo. */
  | 'ruta_no_resuelta'
  /**
   * El fichero no existe y su directorio padre tampoco.
   *
   * BT no crea árboles de directorios: eso sería alcance implícito, y el
   * alcance no se infiere, se declara.
   */
  | 'directorio_padre_inexistente'
  /** Fuera del perímetro del proyecto. */
  | 'ruta_fuera_de_raiz'
  /** Dentro de la raíz, pero en un subárbol que el perímetro se reserva. */
  | 'ruta_en_zona_excluida'
  /** La ruta es válida, pero ese tipo de acción no existe bajo esta política. */
  | 'capacidad_inexistente'

/**
 * Una `Intencion` proyectada a lo que se puede registrar.
 *
 * El registro guarda METADATOS, jamás contenido. Esa regla no se sostiene con
 * disciplina —alguien acabaría serializando una `Intencion` entera— sino con
 * un tipo que estructuralmente NO PUEDE transportar el contenido de un
 * fichero. Aunque se serialice el resumen completo, no hay nada que filtrar.
 *
 * Razones: el registro se lee con `tail -f` durante una grabación, y sobre
 * todo, un fichero con las rutas reales del Piloto Y el contenido de sus
 * ficheros es precisamente lo que no debe existir en el disco.
 */
export type ResumenIntencion = {
  readonly tipo: TipoIntencion
  readonly ruta: string
  /** Tamaño del contenido propuesto. `null` si la intención no lleva contenido. */
  readonly bytesDeContenido: number | null
}

export function resumir(intencion: Intencion): ResumenIntencion {
  return {
    tipo: intencion.tipo,
    ruta: intencion.ruta,
    bytesDeContenido:
      intencion.tipo === 'escribir_fichero' ? contarBytes(intencion.contenido) : null,
  }
}

/**
 * Bytes, no caracteres: `ñ` ocupa dos en UTF-8, y un registro que dijera
 * "1 byte" mentiría sobre lo que de verdad se va a escribir en el disco.
 *
 * `TextEncoder` es un global del lenguaje, no un módulo de la plataforma: no
 * hay import, y el núcleo sigue siendo puro. `Buffer` habría sido de Node.
 */
function contarBytes(texto: string): number {
  return new TextEncoder().encode(texto).length
}
