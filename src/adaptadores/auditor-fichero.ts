/**
 * Adaptador `AuditorFichero` — nombrado por su TECNOLOGÍA.
 *
 * Una línea de JSON por evento, en modo `append`. Sin servicio, sin base de
 * datos, sin rotación. Sin superficie.
 *
 * Por qué JSONL y no otra cosa: una línea es un evento, `O_APPEND` es atómico
 * para escrituras pequeñas en Linux, se sigue con `tail -f` durante una
 * grabación, y se consulta con `jq` sin instalar nada. Una base de datos
 * habría sido una dependencia y un formato ilegible; un servicio de logs, un
 * puerto abierto.
 *
 * NOTA IMPORTANTE — el Auditor NO pasa por la Guardia.
 *
 * `logs/` es zona excluida y sin embargo el Auditor escribe justo ahí. No es
 * una contradicción: la Guardia decide sobre INTENCIONES PROPUESTAS POR EL
 * MODELO. El Auditor no ejecuta una `Intencion`, es infraestructura del
 * propio perímetro — igual que la Política no se pide permiso a sí misma. La
 * zona excluida protege `logs/` de lo que el modelo propone, no de lo que BT
 * registra.
 */

import fsp from 'node:fs/promises'
import path from 'node:path'

import { DIRECTORIO_REGISTRO, type Politica } from '../dominio/politica.js'
import { contener } from '../dominio/ruta.js'
import type { Auditor, EventoAuditoria, LineaRegistro } from '../puertos/auditor.js'

export const NOMBRE_REGISTRO = 'auditoria.jsonl'

export function rutaDelRegistro(politica: Politica): string {
  return path.join(politica.raiz, DIRECTORIO_REGISTRO, NOMBRE_REGISTRO)
}

export type OpcionesAuditor = {
  /** Inyectable para que los tests no dependan del reloj del sistema. */
  readonly reloj?: () => string
}

export function crearAuditorFichero(
  politica: Politica,
  opciones: OpcionesAuditor = {},
): Auditor {
  const registro = rutaDelRegistro(politica)
  const reloj = opciones.reloj ?? (() => new Date().toISOString())

  exigirQueEsteProtegido(registro, politica)

  return {
    async registrar(evento: EventoAuditoria): Promise<void> {
      const linea: LineaRegistro = { instante: reloj(), ...evento }

      // El Auditor crea su propia casa, y solo esa. Que el `Ejecutor` no
      // pueda crear directorios (#2) no aplica aquí: esto es arranque de
      // infraestructura, no una intención propuesta por el modelo.
      await fsp.mkdir(path.dirname(registro), { recursive: true })

      // Modo 'a' — el ÚNICO modo de apertura que aparece en este fichero.
      // No existe ninguna ruta de código capaz de sobrescribir una línea ya
      // escrita. Append-only no es una convención: es el único modo que se usa.
      await fsp.appendFile(registro, JSON.stringify(linea) + '\n', {
        encoding: 'utf8',
        flag: 'a',
      })
    },
  }
}

/**
 * El perímetro se defiende a sí mismo, y se comprueba al arrancar.
 *
 * Si el registro no cae en una zona excluida, una intención de borrado sobre
 * el propio registro pasaría la contención y el modelo podría proponer borrar
 * la evidencia. Antes que registrar en un sitio atacable, BT no arranca.
 *
 * Se verifica preguntándole a la MISMA función de contención que usa el
 * sistema en producción. Si algún día alguien cambia la Política y deja el
 * registro al descubierto, esto falla de inmediato y en voz alta.
 */
function exigirQueEsteProtegido(registro: string, politica: Politica): void {
  const resultado = contener(registro, politica)

  if (resultado.ok || resultado.motivo !== 'ruta_en_zona_excluida') {
    const diagnostico = resultado.ok ? 'es alcanzable' : resultado.motivo
    throw new Error(
      `El registro de auditoría no está protegido por la Política: ${registro} (${diagnostico}). ` +
        `Añade '${DIRECTORIO_REGISTRO}' a zonasExcluidas. BT no arranca sin un registro inviolable.`,
    )
  }
}
