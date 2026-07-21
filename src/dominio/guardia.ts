/**
 * La Guardia. Función pura. Responde a UNA pregunta:
 * ¿está permitida esta acción?
 *
 * La otra mitad de la decisión —¿está esta ruta dentro del perímetro?— vive
 * en `ruta.ts` y ocurre ANTES. La Guardia no puede saltársela: exige una
 * `RutaContenida`, un tipo que solo la contención sabe construir. Decidir
 * sobre una ruta sin contener no es una mala práctica: no compila.
 *
 * Este fichero no importa nada en tiempo de ejecución. El núcleo es puro.
 */

import type { Intencion, MotivoRechazo, Regimen } from './intencion.js'
import type { Politica } from './politica.js'
import type { RutaContenida } from './ruta.js'

/**
 * Marca privada de la Guardia.
 *
 * `declare const` con `unique symbol`: existe para el compilador, no en
 * tiempo de ejecución. Como este símbolo no se exporta, NINGÚN otro módulo
 * puede construir un valor de tipo `IntencionAutorizada`. El `Ejecutor` solo
 * aceptará ese tipo.
 *
 * Consecuencia: saltarse la Guardia no es una mala práctica, es un error de
 * compilación. Estados ilegales, irrepresentables.
 *
 * Alcance honesto de la garantía: esto protege el CÓDIGO de este repositorio
 * frente a un descuido en el futuro. No es una comprobación en tiempo de
 * ejecución, y no pretende serlo — el adversario del modelo de amenaza es el
 * modelo, y el modelo emite JSON, no TypeScript que se compile.
 */
declare const marcaDeGuardia: unique symbol

export type IntencionAutorizada = {
  readonly [marcaDeGuardia]: true
  readonly intencion: Intencion
  /**
   * La ruta verificada sobre la que actuar.
   *
   * El `Ejecutor` usa ESTA y nunca `intencion.ruta`: la primera pasó por el
   * disco y por el perímetro; la segunda es texto que vino del modelo.
   */
  readonly ruta: RutaContenida
  readonly regimen: Regimen
}

export type Decision =
  | {
      readonly resultado: 'autorizada'
      readonly intencion: Intencion
      readonly regimen: Regimen
      readonly motivo: null
      readonly autorizada: IntencionAutorizada
    }
  | {
      readonly resultado: 'requiere_confirmacion'
      readonly intencion: Intencion
      readonly ruta: RutaContenida
      readonly regimen: 'consultado'
      readonly motivo: null
    }
  | {
      readonly resultado: 'rechazada'
      readonly intencion: Intencion
      readonly regimen: 'inexistente'
      readonly motivo: MotivoRechazo
    }

export type DecisionConsultada = Extract<Decision, { resultado: 'requiere_confirmacion' }>

/**
 * La ÚNICA fábrica de `IntencionAutorizada` del sistema entero.
 *
 * No se exporta. La aserción de tipo de esta línea es el privilegio completo
 * de la Guardia, y está contenida en una sola función para que se pueda
 * auditar de un vistazo.
 */
function sellar(
  intencion: Intencion,
  ruta: RutaContenida,
  regimen: Regimen,
): IntencionAutorizada {
  return { intencion, ruta, regimen } as IntencionAutorizada
}

/**
 * El modelo PROPONE una `Intencion`. La Guardia DECIDE.
 *
 * Recibe la ruta ya contenida porque el perímetro se comprueba antes: para
 * cuando esta función se ejecuta, la ruta es absoluta, resuelta, está dentro
 * de la raíz y fuera de toda zona excluida. Aquí solo queda una pregunta:
 * ¿existe esta capacidad, y bajo qué régimen?
 */
export function decidir(
  intencion: Intencion,
  ruta: RutaContenida,
  politica: Politica,
): Decision {
  const regimen = politica.regimenes[intencion.tipo]

  switch (regimen) {
    case 'inexistente':
      return {
        resultado: 'rechazada',
        intencion,
        regimen: 'inexistente',
        motivo: 'capacidad_inexistente',
      }

    case 'consultado':
      return { resultado: 'requiere_confirmacion', intencion, ruta, regimen, motivo: null }

    case 'autonomo':
    case 'delegado':
      return {
        resultado: 'autorizada',
        intencion,
        regimen,
        motivo: null,
        autorizada: sellar(intencion, ruta, regimen),
      }
  }
}

/**
 * El humano ha confirmado una intención consultada.
 *
 * Solo acepta una `DecisionConsultada`, que solo la Guardia produce. No hay
 * forma de fabricar una confirmación de la nada: para confirmar algo, ese
 * algo tuvo que pasar antes por la contención y por `decidir`.
 */
export function confirmar(consultada: DecisionConsultada): IntencionAutorizada {
  return sellar(consultada.intencion, consultada.ruta, consultada.regimen)
}
