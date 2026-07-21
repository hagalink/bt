import test, { describe } from 'node:test'
import assert from 'node:assert/strict'

import type { Intencion } from '../src/dominio/intencion.js'
import { crearPolitica } from '../src/dominio/politica.js'
import { decidir, confirmar } from '../src/dominio/guardia.js'

const RAIZ = '/casa/piloto/proyecto'
const politica = crearPolitica(RAIZ)

const leer = (ruta: string): Intencion => ({ tipo: 'leer_fichero', ruta })
const escribir = (ruta: string): Intencion => ({
  tipo: 'escribir_fichero',
  ruta,
  contenido: 'hola',
})
const borrar = (ruta: string): Intencion => ({ tipo: 'borrar_fichero', ruta })

describe('Guardia · régimen por tipo de intención', () => {
  test('leer dentro de la raíz es autónomo y queda autorizado', () => {
    const decision = decidir(leer(`${RAIZ}/src/main.ts`), politica)

    assert.equal(decision.resultado, 'autorizada')
    assert.equal(decision.regimen, 'autonomo')
  })

  test('escribir dentro de la raíz es delegado y queda autorizado', () => {
    const decision = decidir(escribir(`${RAIZ}/src/main.ts`), politica)

    assert.equal(decision.resultado, 'autorizada')
    assert.equal(decision.regimen, 'delegado')
  })

  test('borrar dentro de la raíz es consultado: NO se autoriza solo', () => {
    const decision = decidir(borrar(`${RAIZ}/src/main.ts`), politica)

    assert.equal(decision.resultado, 'requiere_confirmacion')
    assert.equal(decision.regimen, 'consultado')
  })
})

describe('Guardia · contención de rutas', () => {
  test('una ruta fuera de la raíz se rechaza', () => {
    const decision = decidir(leer('/casa/piloto/.ssh/authorized_keys'), politica)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_fuera_de_raiz')
  })

  test('la demo del MVP: escribir en authorized_keys se rechaza', () => {
    const decision = decidir(escribir('/casa/piloto/.ssh/authorized_keys'), politica)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_fuera_de_raiz')
  })

  test('un hermano con la raíz como prefijo NO cuela', () => {
    // El fallo clásico de startsWith sin separador: "/…/proyecto-malo"
    // empieza por "/…/proyecto" y sin embargo está fuera.
    const decision = decidir(leer(`${RAIZ}-malo/secreto.txt`), politica)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_fuera_de_raiz')
  })

  test('la raíz misma no es un objetivo válido', () => {
    const decision = decidir(borrar(RAIZ), politica)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_fuera_de_raiz')
  })

  test('una ruta relativa se rechaza: la Guardia solo decide sobre rutas resueltas', () => {
    const decision = decidir(leer('src/main.ts'), politica)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_no_absoluta')
  })

  test('una ruta con ../ sin resolver se rechaza: resolver es I/O, no es asunto del núcleo', () => {
    const decision = decidir(leer(`${RAIZ}/../../etc/passwd`), politica)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_no_resuelta')
  })
})

describe('Guardia · el perímetro se defiende a sí mismo', () => {
  test('borrar el registro de auditoría se rechaza', () => {
    const decision = decidir(borrar(`${RAIZ}/logs/auditoria.jsonl`), politica)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_en_zona_excluida')
  })

  test('escribir sobre el registro de auditoría se rechaza', () => {
    const decision = decidir(escribir(`${RAIZ}/logs/auditoria.jsonl`), politica)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_en_zona_excluida')
  })

  test('ni siquiera leer dentro de la zona excluida: no existe la capacidad', () => {
    const decision = decidir(leer(`${RAIZ}/logs/auditoria.jsonl`), politica)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_en_zona_excluida')
  })

  test('un fichero que solo EMPIEZA por logs sí es alcanzable', () => {
    // "logsdeayer.txt" no está dentro de "logs/". El separador manda.
    const decision = decidir(leer(`${RAIZ}/logsdeayer.txt`), politica)

    assert.equal(decision.resultado, 'autorizada')
  })
})

describe('Guardia · la única fábrica de IntencionAutorizada', () => {
  test('confirmar una consulta produce una intención autorizada', () => {
    const decision = decidir(borrar(`${RAIZ}/basura.txt`), politica)
    assert.equal(decision.resultado, 'requiere_confirmacion')
    if (decision.resultado !== 'requiere_confirmacion') return

    const autorizada = confirmar(decision)

    assert.equal(autorizada.intencion.tipo, 'borrar_fichero')
    assert.equal(autorizada.regimen, 'consultado')
  })

  test('la intención autorizada transporta la intención intacta', () => {
    const decision = decidir(escribir(`${RAIZ}/nota.txt`), politica)
    assert.equal(decision.resultado, 'autorizada')
    if (decision.resultado !== 'autorizada') return

    assert.deepEqual(decision.autorizada.intencion, {
      tipo: 'escribir_fichero',
      ruta: `${RAIZ}/nota.txt`,
      contenido: 'hola',
    })
  })
})

describe('Guardia · la Política es datos', () => {
  test('excluir un subárbol nuevo no requiere tocar la Guardia', () => {
    const conSecretos = crearPolitica(RAIZ, ['logs', '.git'])

    const decision = decidir(escribir(`${RAIZ}/.git/config`), conSecretos)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'ruta_en_zona_excluida')
  })

  test('un tipo en régimen inexistente se rechaza aunque la ruta sea válida', () => {
    const soloLectura = crearPolitica(RAIZ, ['logs'], {
      leer_fichero: 'autonomo',
      escribir_fichero: 'inexistente',
      borrar_fichero: 'inexistente',
    })

    const decision = decidir(escribir(`${RAIZ}/nota.txt`), soloLectura)

    assert.equal(decision.resultado, 'rechazada')
    assert.equal(decision.motivo, 'capacidad_inexistente')
  })
})
