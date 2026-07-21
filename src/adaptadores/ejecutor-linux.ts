/**
 * Adaptador `EjecutorLinux` — nombrado por su TECNOLOGÍA.
 *
 * El primer código del proyecto que modifica el disco. Tres operaciones, y ni
 * una más.
 *
 * Lo que este fichero NO contiene, y es lo que de verdad importa:
 *
 *   · sin `mkdir` — crear directorios es alcance implícito, y el alcance no se
 *     infiere, se declara
 *   · sin borrado recursivo — el MVP borra ficheros, jamás árboles. Un
 *     `rm -rf` por voz es indefendible
 *   · sin `child_process`, sin `exec`, sin `eval` — la tesis
 *   · sin construir rutas — la ruta llega verificada; el Ejecutor no la
 *     re-deriva, porque ahí es donde se cuelan los fallos
 *
 * Todas esas ausencias están verificadas por `tests/invariantes.test.ts` en
 * cada ejecución de la suite. Una ausencia que no se comprueba es solo una
 * afirmación.
 */

import fsp from 'node:fs/promises'
import { constants as C } from 'node:fs'

import type { Ejecutor, FalloEjecucion, ResultadoEjecucion } from '../puertos/ejecutor.js'
import type { IntencionAutorizada } from '../dominio/guardia.js'

/**
 * `O_NOFOLLOW` en TODA apertura.
 *
 * La contención (#1) resolvió los enlaces simbólicos, así que la ruta que
 * llega aquí no puede ser un enlace: es el destino real. Si en el momento de
 * abrir resulta serlo, es que alguien la sustituyó entre la comprobación y el
 * uso — la ventana TOCTOU. Con `O_NOFOLLOW` la apertura falla en lugar de
 * seguir el enlace, y la ventana se cierra donde de verdad importa.
 */
const SIN_SEGUIR_ENLACES = C.O_NOFOLLOW

export function crearEjecutorLinux(): Ejecutor {
  return {
    async ejecutar(autorizada: IntencionAutorizada): Promise<ResultadoEjecucion> {
      // La ruta VERIFICADA, jamás `autorizada.intencion.ruta`: la primera pasó
      // por el disco y por el perímetro; la segunda es texto del modelo.
      const ruta = autorizada.ruta.absoluta

      try {
        switch (autorizada.intencion.tipo) {
          case 'leer_fichero':
            return await leer(ruta)
          case 'escribir_fichero':
            return await escribir(ruta, autorizada.intencion.contenido)
          case 'borrar_fichero':
            return await borrar(ruta)
        }
      } catch (error) {
        return { ok: false, fallo: traducir(error) }
      }
    },
  }
}

async function leer(ruta: string): Promise<ResultadoEjecucion> {
  const descriptor = await fsp.open(ruta, C.O_RDONLY | SIN_SEGUIR_ENLACES)
  try {
    return { ok: true, tipo: 'leido', contenido: await descriptor.readFile('utf8') }
  } finally {
    await descriptor.close()
  }
}

async function escribir(ruta: string, contenido: string): Promise<ResultadoEjecucion> {
  // O_CREAT crea el FICHERO, nunca los directorios que falten: si el padre no
  // está, esto falla con `no_existe` y BT no inventa un árbol.
  // O_TRUNC es el único truncado legítimo del proyecto, y es exactamente el
  // fichero que se pidió escribir.
  const descriptor = await fsp.open(
    ruta,
    C.O_WRONLY | C.O_CREAT | C.O_TRUNC | SIN_SEGUIR_ENLACES,
    0o644,
  )
  try {
    await descriptor.writeFile(contenido, 'utf8')
    return { ok: true, tipo: 'escrito', bytes: Buffer.byteLength(contenido, 'utf8') }
  } finally {
    await descriptor.close()
  }
}

async function borrar(ruta: string): Promise<ResultadoEjecucion> {
  // `unlink` opera sobre el nombre y nunca sigue enlaces, así que no puede
  // borrar el destino de uno. Pero sí borraría el enlace mismo, y eso también
  // es actuar sobre algo que no se autorizó: la contención resolvió a un
  // destino real, no a un enlace. Si ahora hay un enlace ahí, alguien lo
  // sustituyó. Se comprueba y se rechaza.
  const estado = await fsp.lstat(ruta)
  if (estado.isSymbolicLink()) return { ok: false, fallo: 'enlace_simbolico' }
  if (!estado.isFile()) return { ok: false, fallo: 'no_es_un_fichero' }

  await fsp.unlink(ruta)
  return { ok: true, tipo: 'borrado' }
}

/**
 * Traduce los códigos de `errno` a fallos del dominio.
 *
 * `ELOOP` es lo que devuelve Linux cuando `O_NOFOLLOW` topa con un enlace:
 * es la señal de que la ventana TOCTOU se ha cerrado de un portazo.
 */
function traducir(error: unknown): FalloEjecucion {
  const codigo = (error as NodeJS.ErrnoException | null)?.code

  switch (codigo) {
    case 'ELOOP':
      return 'enlace_simbolico'
    case 'ENOENT':
      return 'no_existe'
    case 'EISDIR':
    case 'ENOTDIR':
      return 'no_es_un_fichero'
    case 'EACCES':
    case 'EPERM':
      return 'sin_permiso'
    default:
      return 'error_de_entrada_salida'
  }
}
