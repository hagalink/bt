/**
 * Puerto `Auditor` — nombrado por su ROL de dominio.
 *
 * Es el sustituto del humano que ha dejado de mirar la pantalla. Cuando la
 * interacción es por voz, el registro ES la pantalla: sin él, un intento de
 * intrusión bloqueado y el silencio son indistinguibles.
 *
 * Lo valioso de este registro no son los éxitos. Son los RECHAZOS. Un log
 * lleno de operaciones correctas es ruido; un log con un rechazo es la única
 * señal que existe de que el perímetro trabajó.
 */

import type { MotivoRechazo, Regimen, ResumenIntencion } from '../dominio/intencion.js'

/** Dónde ocurrió un fallo. Crece cuando crecen las fases. */
export type Etapa = 'contencion' | 'decision' | 'ejecucion'

/**
 * Lo que se registra.
 *
 * Unión discriminada cerrada, como todo en este proyecto: un evento nuevo es
 * un cambio de tipo que el compilador obliga a manejar en todas partes.
 *
 * Nótese que la intención viaja como `ResumenIntencion` y no como `Intencion`:
 * el contenido de los ficheros no puede llegar aquí ni por descuido.
 */
export type EventoAuditoria =
  | {
      readonly tipo: 'decision'
      readonly intencion: ResumenIntencion
      readonly resultado: 'autorizada' | 'requiere_confirmacion' | 'rechazada'
      readonly regimen: Regimen
      readonly motivo: MotivoRechazo | null
    }
  | {
      readonly tipo: 'ejecucion'
      readonly intencion: ResumenIntencion
      readonly resultado: 'leido' | 'escrito' | 'borrado'
      readonly bytes: number | null
    }
  | {
      readonly tipo: 'fallo'
      readonly etapa: Etapa
      readonly detalle: string
    }

/** Lo que acaba escrito en el fichero: el evento con su marca temporal. */
export type LineaRegistro = EventoAuditoria & { readonly instante: string }

export interface Auditor {
  /**
   * Registra un evento.
   *
   * El `instante` NO se pasa: lo pone el adaptador. Así el llamante no puede
   * falsificarlo ni olvidarlo.
   *
   * **Rechaza si no se pudo escribir.** No se traga el error: quien llama
   * tiene que poder abortar. Una acción no auditada, cuando el humano no
   * mira, es exactamente lo que este proyecto existe para impedir.
   */
  registrar(evento: EventoAuditoria): Promise<void>
}
