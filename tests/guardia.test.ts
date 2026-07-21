import test, { describe } from 'node:test'
import assert from 'node:assert/strict'

import type { Intencion } from '../src/dominio/intencion.js'
import { crearPolitica } from '../src/dominio/politica.js'
import { contener, type RutaContenida } from '../src/dominio/ruta.js'
import { decidir, confirmar } from '../src/dominio/guardia.js'

const RAIZ = '/casa/piloto/proyecto'
const politica = crearPolitica(RAIZ)

/**
 * No hay puerta trasera: para obtener una `RutaContenida` en un test hay que
 * pasar por `contener`, igual que en producción. Si la ruta de prueba no se
 * contiene, el test falla aquí y no más adelante disfrazado de otra cosa.
 */
function contenida(ruta: string): RutaContenida {
  const resultado = contener(ruta, politica)
  if (!resultado.ok) {
    throw new Error(`ruta de prueba no contenida: ${ruta} (${resultado.motivo})`)
  }
  return resultado.ruta
}

const leer = (ruta: string): Intencion => ({ tipo: 'leer_fichero', ruta })
const escribir = (ruta: string): Intencion => ({
  tipo: 'escribir_fichero',
  ruta,
  contenido: 'hola',
})
const borrar = (ruta: string): Intencion => ({ tipo: 'borrar_fichero', ruta })

const MAIN = `${RAIZ}/src/main.ts`

describe('Guardia · régimen por tipo de intención', () => {
  test('leer dentro de la raíz es autónomo y queda autorizado', () => {
    const decision = decidir(leer(MAIN), contenida(MAIN), politica)

    assert.equal(decision.resultado, 'autorizada')
    assert.equal(decision.regimen, 'autonomo')
  })

  test('escribir dentro de la raíz es delegado y queda autorizado', () => {
    const decision = decidir(escribir(MAIN), contenida(MAIN), politica)

    assert.equal(decision.resultado, 'autorizada')
    assert.equal(decision.regimen, 'delegado')
  })

  test('borrar dentro de la raíz es consultado: NO se autoriza solo', () => {
    const decision = decidir(borrar(MAIN), contenida(MAIN), politica)

    assert.equal(decision.resultado, 'requiere_confirmacion')
    assert.equal(decision.regimen, 'consultado')
  })
})

describe('Guardia · la Política es datos', () => {
  test('un tipo en régimen inexistente se rechaza aunque la ruta esté contenida', () => {
    const soloLectura = crearPolitica(RAIZ, ['logs'], {
      leer_fichero: 'autonomo',
      escribir_fichero: 'inexistente',
      borrar_fichero: 'inexistente',
    })

    const decision = decidir(escribir(MAIN), contenida(MAIN), soloLectura)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'capacidad_inexistente')
  })

  test('cambiar un régimen no requiere tocar la Guardia', () => {
    const borradoLibre = crearPolitica(RAIZ, ['logs'], {
      leer_fichero: 'autonomo',
      escribir_fichero: 'delegado',
      borrar_fichero: 'delegado',
    })

    const decision = decidir(borrar(MAIN), contenida(MAIN), borradoLibre)

    assert.equal(decision.resultado, 'autorizada')
    assert.equal(decision.regimen, 'delegado')
  })
})

describe('Guardia · la única fábrica de IntencionAutorizada', () => {
  test('confirmar una consulta produce una intención autorizada', () => {
    const ruta = `${RAIZ}/basura.txt`
    const decision = decidir(borrar(ruta), contenida(ruta), politica)
    assert.equal(decision.resultado, 'requiere_confirmacion')
    if (decision.resultado !== 'requiere_confirmacion') return

    const autorizada = confirmar(decision)

    assert.equal(autorizada.intencion.tipo, 'borrar_fichero')
    assert.equal(autorizada.regimen, 'consultado')
  })

  test('la intención autorizada transporta la intención intacta', () => {
    const ruta = `${RAIZ}/nota.txt`
    const decision = decidir(escribir(ruta), contenida(ruta), politica)
    assert.equal(decision.resultado, 'autorizada')
    if (decision.resultado !== 'autorizada') return

    assert.deepEqual(decision.autorizada.intencion, {
      tipo: 'escribir_fichero',
      ruta,
      contenido: 'hola',
    })
  })

  test('la intención autorizada transporta la RUTA CONTENIDA, no la cruda', () => {
    // El Ejecutor debe actuar sobre la ruta verificada, jamás sobre la que
    // vino del modelo.
    const ruta = `${RAIZ}/nota.txt`
    const decision = decidir(escribir(ruta), contenida(ruta), politica)
    assert.equal(decision.resultado, 'autorizada')
    if (decision.resultado !== 'autorizada') return

    assert.equal(decision.autorizada.ruta.absoluta, ruta)
  })
})
