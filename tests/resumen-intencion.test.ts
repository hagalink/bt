import test, { describe } from 'node:test'
import assert from 'node:assert/strict'

import { resumir } from '../src/dominio/intencion.js'

/**
 * El registro guarda METADATOS, jamás contenido.
 *
 * Esa regla no se sostiene con disciplina: se sostiene con un tipo. `resumir`
 * proyecta una `Intencion` a un `ResumenIntencion` que estructuralmente NO
 * PUEDE transportar el contenido de un fichero. Aunque alguien serialice el
 * resumen entero, no hay nada que filtrar.
 */

describe('resumir · el contenido no sobrevive a la proyección', () => {
  test('un resumen de escritura NO contiene el contenido', () => {
    const resumen = resumir({
      tipo: 'escribir_fichero',
      ruta: '/proyecto/notas.txt',
      contenido: 'la clave del wifi es hunter2',
    })

    assert.equal(JSON.stringify(resumen).includes('hunter2'), false)
    assert.equal(JSON.stringify(resumen).includes('clave'), false)
  })

  test('el resumen registra el TAMAÑO del contenido, no el contenido', () => {
    const resumen = resumir({
      tipo: 'escribir_fichero',
      ruta: '/proyecto/notas.txt',
      contenido: 'hola',
    })

    assert.equal(resumen.tipo, 'escribir_fichero')
    assert.equal(resumen.ruta, '/proyecto/notas.txt')
    assert.equal(resumen.bytesDeContenido, 4)
  })

  test('el tamaño se cuenta en BYTES, no en caracteres', () => {
    // 'ñ' ocupa dos bytes en UTF-8. Un registro que dijera "1 byte" mentiría
    // sobre lo que de verdad se va a escribir en el disco.
    const resumen = resumir({
      tipo: 'escribir_fichero',
      ruta: '/proyecto/notas.txt',
      contenido: 'ñ',
    })

    assert.equal(resumen.bytesDeContenido, 2)
  })

  test('un contenido vacío se distingue de la ausencia de contenido', () => {
    const vacio = resumir({
      tipo: 'escribir_fichero',
      ruta: '/proyecto/notas.txt',
      contenido: '',
    })
    const sinContenido = resumir({ tipo: 'leer_fichero', ruta: '/proyecto/notas.txt' })

    assert.equal(vacio.bytesDeContenido, 0)
    assert.equal(sinContenido.bytesDeContenido, null)
  })
})

describe('resumir · intenciones sin contenido', () => {
  test('leer_fichero no tiene contenido que resumir', () => {
    const resumen = resumir({ tipo: 'leer_fichero', ruta: '/proyecto/main.ts' })

    assert.deepEqual(resumen, {
      tipo: 'leer_fichero',
      ruta: '/proyecto/main.ts',
      bytesDeContenido: null,
    })
  })

  test('borrar_fichero no tiene contenido que resumir', () => {
    const resumen = resumir({ tipo: 'borrar_fichero', ruta: '/proyecto/basura.txt' })

    assert.deepEqual(resumen, {
      tipo: 'borrar_fichero',
      ruta: '/proyecto/basura.txt',
      bytesDeContenido: null,
    })
  })
})
