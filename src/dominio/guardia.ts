/**
 * La Guardia. Función pura. El único sitio donde se decide.
 *
 * Recibe lo que el modelo PROPONE y devuelve lo que el sistema HACE. No lee
 * ficheros, no resuelve enlaces simbólicos, no consulta el disco: opera sobre
 * rutas YA RESUELTAS. Resolver es I/O y vive en un adaptador (Fase 1); decidir
 * es dominio y vive aquí.
 *
 * Este fichero no importa nada en tiempo de ejecución. El núcleo es puro.
 */

import type { Intencion, MotivoRechazo, Regimen } from './intencion.js'
import type { Politica } from './politica.js'

/**
 * BT es Linux (Wayland, GNOME). El separador es `/`.
 *
 * Se declara aquí en vez de importar `node:path` para que `dominio/` no importe
 * NADA de la plataforma. La pureza del núcleo es una invariante, no una
 * aspiración.
 */
const SEPARADOR = '/'

/**
 * Marca privada de la Guardia.
 *
 * `declare const` con `unique symbol`: existe para el compilador, no en tiempo
 * de ejecución. Como este símbolo no se exporta, NINGÚN otro módulo puede
 * construir un valor de tipo `IntencionAutorizada`. El `Ejecutor` solo aceptará
 * ese tipo.
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
 * No se exporta. La aserción de tipo de esta línea es el privilegio completo de
 * la Guardia, y está contenida en una sola función de tres líneas para que se
 * pueda auditar de un vistazo.
 */
function sellar(intencion: Intencion, regimen: Regimen): IntencionAutorizada {
  return { intencion, regimen } as IntencionAutorizada
}

/**
 * Una ruta está "resuelta" si no queda nada por interpretar: sin `.`, sin `..`,
 * sin segmentos vacíos. La Guardia no resuelve; exige que ya venga resuelta.
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
 * Sin el separador, `/casa/proyecto-malo` empieza por `/casa/proyecto` y colaría.
 * Con él, no. La raíz misma tampoco es un objetivo válido: es un directorio, no
 * un fichero sobre el que actuar.
 */
function estaDentroDe(ruta: string, prefijo: string): boolean {
  return ruta.startsWith(prefijo + SEPARADOR)
}

function rechazar(intencion: Intencion, motivo: MotivoRechazo): Decision {
  return { resultado: 'rechazada', intencion, regimen: 'inexistente', motivo }
}

/**
 * El modelo PROPONE una `Intencion`. La Guardia DECIDE.
 *
 * El orden de las comprobaciones importa y va de fuera hacia dentro: forma de
 * la ruta, perímetro exterior, zonas reservadas y, solo al final, el régimen.
 * Una ruta ilegal se rechaza antes de que su régimen llegue a consultarse.
 */
export function decidir(intencion: Intencion, politica: Politica): Decision {
  const { ruta } = intencion

  if (!ruta.startsWith(SEPARADOR)) return rechazar(intencion, 'ruta_no_absoluta')
  if (!estaResuelta(ruta)) return rechazar(intencion, 'ruta_no_resuelta')
  if (!estaDentroDe(ruta, politica.raiz)) return rechazar(intencion, 'ruta_fuera_de_raiz')

  for (const zona of politica.zonasExcluidas) {
    const raizDeZona = politica.raiz + SEPARADOR + zona
    if (ruta === raizDeZona || estaDentroDe(ruta, raizDeZona)) {
      return rechazar(intencion, 'ruta_en_zona_excluida')
    }
  }

  const regimen = politica.regimenes[intencion.tipo]

  switch (regimen) {
    case 'inexistente':
      return rechazar(intencion, 'capacidad_inexistente')

    case 'consultado':
      return { resultado: 'requiere_confirmacion', intencion, regimen, motivo: null }

    case 'autonomo':
    case 'delegado':
      return {
        resultado: 'autorizada',
        intencion,
        regimen,
        motivo: null,
        autorizada: sellar(intencion, regimen),
      }
  }
}

/**
 * El humano ha confirmado una intención consultada.
 *
 * Solo acepta una `DecisionConsultada`, que solo la Guardia produce. No hay
 * forma de fabricar una confirmación de la nada: para confirmar algo, ese algo
 * tuvo que pasar antes por `decidir`.
 */
export function confirmar(consultada: DecisionConsultada): IntencionAutorizada {
  return sellar(consultada.intencion, consultada.regimen)
}
