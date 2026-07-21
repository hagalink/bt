/**
 * Adaptador `ContencionLinux` — nombrado por su TECNOLOGÍA.
 *
 * Hace el I/O que el núcleo no puede hacer: resolver `..`, `.`, rutas
 * relativas y —lo único que importa de verdad— enlaces simbólicos.
 *
 * Y no decide nada. Resuelve, y delega la decisión en `contener`, que es puro
 * y vive en el dominio. La flecha apunta hacia dentro.
 */

import fs from 'node:fs'
import path from 'node:path'

import type { Politica } from '../dominio/politica.js'
import { contener, type ResultadoContencion } from '../dominio/ruta.js'
import type { Contencion } from '../puertos/contencion.js'

/**
 * Resuelve la raíz del proyecto. Se llama UNA sola vez, al arrancar.
 *
 * El directorio del proyecto puede estar detrás de un enlace simbólico
 * (`/home` → `/var/home` es habitual). Si cada componente resolviera la raíz
 * por su cuenta, dos componentes podrían discrepar y la contención se
 * volvería inconsistente.
 *
 * Lanza si el directorio no existe: sin raíz no hay perímetro, y sin
 * perímetro BT no arranca.
 */
export function resolverRaiz(rutaCruda: string): string {
  return fs.realpathSync(path.resolve(rutaCruda))
}

export function crearContencionLinux(politica: Politica): Contencion {
  return {
    resolver(rutaCruda: string): ResultadoContencion {
      // Normaliza `..`, `.` y resuelve lo relativo contra la raíz. Todavía es
      // álgebra de cadenas: los enlaces simbólicos siguen sin verse.
      const candidata = path.resolve(politica.raiz, rutaCruda)

      const absoluta = existe(candidata)
        ? // El fichero está ahí: `realpath` colapsa la cadena entera de
          // enlaces, incluido el último segmento.
          fs.realpathSync(candidata)
        : // No está. `realpath` sobre la ruta completa lanzaría ENOENT, y
          // crear ficheros nuevos es el caso más común del MVP. Se resuelve
          // el PADRE —que sí tiene que existir— y se le une el nombre.
          //
          // Esto también cierra la puerta trasera del directorio enlazado:
          // si el padre es un enlace hacia fuera, `realpath` lo delata.
          resolverPorElPadre(candidata)

      if (absoluta === null) return { ok: false, motivo: 'directorio_padre_inexistente' }

      return contener(absoluta, politica)
    },
  }
}

/**
 * `lstat` y no `stat`: preguntamos si la entrada existe SIN seguir el enlace.
 * Un enlace roto existe como enlace, y queremos tratarlo aquí y no en el
 * camino de "todavía no existe".
 */
function existe(ruta: string): boolean {
  try {
    fs.lstatSync(ruta)
    return true
  } catch {
    return false
  }
}

/** `null` si el directorio padre no existe. BT no crea árboles de directorios. */
function resolverPorElPadre(candidata: string): string | null {
  try {
    const padreReal = fs.realpathSync(path.dirname(candidata))
    return path.join(padreReal, path.basename(candidata))
  } catch {
    return null
  }
}

/*
 * LIMITACIÓN CONOCIDA — TOCTOU (time-of-check / time-of-use)
 *
 * Entre esta resolución (instante T) y la escritura (instante T+1), un proceso
 * local podría sustituir el último segmento por un enlace simbólico. Esta
 * comprobación no lo impediría.
 *
 * No se cierra aquí a propósito: se cierra donde de verdad importa, que es
 * en el `Ejecutor`, abriendo el fichero con `O_NOFOLLOW`. Si el destino se
 * convirtió en un enlace entre medias, la apertura falla en lugar de seguirlo.
 *
 * Y el modelo de amenaza de BT es el modelo de lenguaje, no otro proceso del
 * mismo usuario con capacidad de plantar enlaces — ese proceso ya podría leer
 * los ficheros directamente. Se documenta en vez de fingir que no existe.
 */
