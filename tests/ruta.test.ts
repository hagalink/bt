import test, { describe } from 'node:test'
import assert from 'node:assert/strict'

import { crearPolitica } from '../src/dominio/politica.js'
import { contener } from '../src/dominio/ruta.js'

const RAIZ = '/casa/piloto/proyecto'
const politica = crearPolitica(RAIZ)

describe('Contención · forma de la ruta', () => {
  test('una ruta relativa se rechaza', () => {
    const r = contener('src/main.ts', politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_no_absoluta')
  })

  test('una ruta con ../ sin resolver se rechaza: resolver es I/O', () => {
    const r = contener(`${RAIZ}/../../etc/passwd`, politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_no_resuelta')
  })

  test('una ruta con ./ sin resolver se rechaza', () => {
    const r = contener(`${RAIZ}/./main.ts`, politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_no_resuelta')
  })

  test('una ruta con doble barra se rechaza: queda algo por interpretar', () => {
    const r = contener(`${RAIZ}//main.ts`, politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_no_resuelta')
  })

  test('una ruta con barra final se rechaza', () => {
    const r = contener(`${RAIZ}/src/`, politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_no_resuelta')
  })
})

describe('Contención · perímetro exterior', () => {
  test('una ruta dentro de la raíz se contiene y conserva la ruta absoluta', () => {
    const r = contener(`${RAIZ}/src/main.ts`, politica)

    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.ruta.absoluta, `${RAIZ}/src/main.ts`)
  })

  test('una ruta fuera de la raíz se rechaza', () => {
    const r = contener('/casa/piloto/.ssh/authorized_keys', politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_fuera_de_raiz')
  })

  test('un hermano con la raíz como prefijo NO cuela', () => {
    // El fallo clásico de startsWith sin separador: "/…/proyecto-malo"
    // empieza por "/…/proyecto" y sin embargo está fuera.
    const r = contener(`${RAIZ}-malo/secreto.txt`, politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_fuera_de_raiz')
  })

  test('la raíz misma no es un objetivo válido', () => {
    const r = contener(RAIZ, politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_fuera_de_raiz')
  })
})

describe('Contención · el perímetro se defiende a sí mismo', () => {
  test('el registro de auditoría queda fuera de alcance', () => {
    const r = contener(`${RAIZ}/logs/auditoria.jsonl`, politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_en_zona_excluida')
  })

  test('el propio directorio de la zona excluida queda fuera de alcance', () => {
    const r = contener(`${RAIZ}/logs`, politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_en_zona_excluida')
  })

  test('un fichero que solo EMPIEZA por logs sí es alcanzable', () => {
    // "logsdeayer.txt" no está dentro de "logs/". El separador manda.
    const r = contener(`${RAIZ}/logsdeayer.txt`, politica)

    assert.equal(r.ok, true)
  })

  test('excluir un subárbol nuevo no requiere tocar el código', () => {
    const conGit = crearPolitica(RAIZ, ['logs', '.git'])

    const r = contener(`${RAIZ}/.git/config`, conGit)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_en_zona_excluida')
  })
})

describe('Contención · el orden de las comprobaciones', () => {
  test('la forma se comprueba antes que el perímetro', () => {
    // Esta ruta está fuera Y sin resolver. Debe ganar el motivo más preciso.
    const r = contener('../../etc/passwd', politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_no_absoluta')
  })

  test('el perímetro se comprueba antes que las zonas excluidas', () => {
    // Un "logs" de OTRO proyecto está fuera de la raíz, no en zona excluida.
    const r = contener('/otro/proyecto/logs/auditoria.jsonl', politica)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_fuera_de_raiz')
  })
})
