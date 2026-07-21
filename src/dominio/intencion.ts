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
