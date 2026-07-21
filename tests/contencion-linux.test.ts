import test, { describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { crearPolitica, type Politica } from '../src/dominio/politica.js'
import type { Contencion } from '../src/puertos/contencion.js'
import { crearContencionLinux, resolverRaiz } from '../src/adaptadores/contencion-linux.js'

/**
 * Estos tests tocan el disco a propósito.
 *
 * Un enlace simbólico simulado no prueba nada: la razón de existir de este
 * adaptador es que los enlaces solo se pueden ver preguntándole al sistema de
 * ficheros. Se crean enlaces de verdad, en un proyecto temporal de verdad.
 */

let temporal: string // directorio padre del escenario, ya resuelto
let raiz: string // raíz del proyecto de pruebas
let fuera: string // territorio fuera del perímetro
let politica: Politica
let contencion: Contencion

before(() => {
  // realpath sobre el temporal: en algunas máquinas /tmp es un enlace, y la
  // raíz tiene que estar resuelta ANTES de comparar prefijos.
  temporal = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bt-')))

  raiz = path.join(temporal, 'proyecto')
  fuera = path.join(temporal, 'fuera')

  fs.mkdirSync(path.join(raiz, 'src'), { recursive: true })
  fs.mkdirSync(path.join(raiz, 'logs'), { recursive: true })
  fs.mkdirSync(fuera, { recursive: true })
  fs.mkdirSync(`${raiz}-malo`, { recursive: true })

  fs.writeFileSync(path.join(raiz, 'src', 'main.ts'), 'export {}\n')
  fs.writeFileSync(path.join(raiz, 'logs', 'auditoria.jsonl'), '')
  fs.writeFileSync(path.join(fuera, 'secreto.txt'), 'ssh-rsa AAAA\n')
  fs.writeFileSync(path.join(raiz, 'logsdeayer.txt'), 'inocente\n')

  // Enlaces simbólicos reales: el punto ciego que el núcleo puro no puede ver.
  fs.symlinkSync(path.join(fuera, 'secreto.txt'), path.join(raiz, 'fuga.txt'))
  fs.symlinkSync(path.join(raiz, 'src', 'main.ts'), path.join(raiz, 'atajo.ts'))
  fs.symlinkSync(fuera, path.join(raiz, 'puerta'))

  politica = crearPolitica(resolverRaiz(raiz))
  contencion = crearContencionLinux(politica)
})

after(() => {
  fs.rmSync(temporal, { recursive: true, force: true })
})

describe('ContencionLinux · traduce el mundo real', () => {
  test('una ruta relativa se resuelve contra la raíz del proyecto', () => {
    const r = contencion.resolver('src/main.ts')

    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.ruta.absoluta, path.join(raiz, 'src', 'main.ts'))
  })

  test('una ruta absoluta dentro de la raíz se acepta', () => {
    const r = contencion.resolver(path.join(raiz, 'src', 'main.ts'))

    assert.equal(r.ok, true)
  })

  test('un ../ que escapa se resuelve y SE RECHAZA POR ESTAR FUERA', () => {
    // Ojo al motivo: el núcleo puro decía 'ruta_no_resuelta' porque no sabía
    // resolver. Ahora sí se resuelve, y el rechazo es por la razón correcta.
    const r = contencion.resolver('../fuera/secreto.txt')

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_fuera_de_raiz')
  })

  test('un hermano con la raíz como prefijo no cuela', () => {
    const r = contencion.resolver(`${raiz}-malo/cualquiera.txt`)

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_fuera_de_raiz')
  })
})

describe('ContencionLinux · ficheros que aún no existen', () => {
  test('un fichero inexistente con el padre existente se resuelve', () => {
    // LA TRAMPA: realpathSync sobre la ruta completa lanzaría ENOENT, y
    // escribir ficheros nuevos es el caso más común del MVP.
    const r = contencion.resolver('src/nota-nueva.txt')

    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.ruta.absoluta, path.join(raiz, 'src', 'nota-nueva.txt'))
  })

  test('un fichero cuyo directorio padre no existe se rechaza', () => {
    // BT no crea árboles de directorios: eso sería alcance implícito, y el
    // alcance no se infiere.
    const r = contencion.resolver('sin/crear/todavia/nota.txt')

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'directorio_padre_inexistente')
  })
})

describe('ContencionLinux · el punto ciego del núcleo puro: enlaces simbólicos', () => {
  test('un enlace que apunta FUERA se colapsa y se rechaza', () => {
    // Para una función pura, "fuga.txt" es una cadena perfectamente contenida.
    // Solo el disco sabe que apunta a otro sitio.
    const r = contencion.resolver('fuga.txt')

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_fuera_de_raiz')
  })

  test('un enlace que apunta DENTRO se acepta, resuelto a su destino real', () => {
    const r = contencion.resolver('atajo.ts')

    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.ruta.absoluta, path.join(raiz, 'src', 'main.ts'))
  })

  test('un DIRECTORIO enlazado hacia fuera no sirve de puerta trasera', () => {
    // El fichero no existe todavía: se resuelve el padre, que es un enlace
    // a territorio exterior. Si solo se resolviera el nombre, colaría.
    const r = contencion.resolver('puerta/nuevo.txt')

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_fuera_de_raiz')
  })

  test('un enlace hacia fuera tampoco cuela con ruta absoluta', () => {
    const r = contencion.resolver(path.join(raiz, 'fuga.txt'))

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_fuera_de_raiz')
  })
})

describe('ContencionLinux · el perímetro se defiende a sí mismo', () => {
  test('el registro de auditoría real queda fuera de alcance', () => {
    const r = contencion.resolver('logs/auditoria.jsonl')

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_en_zona_excluida')
  })

  test('un fichero nuevo dentro de logs/ tampoco es alcanzable', () => {
    const r = contencion.resolver('logs/otro.jsonl')

    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'ruta_en_zona_excluida')
  })

  test('un fichero que solo empieza por logs sí es alcanzable', () => {
    const r = contencion.resolver('logsdeayer.txt')

    assert.equal(r.ok, true)
  })
})

describe('ContencionLinux · la raíz se resuelve una sola vez', () => {
  test('una raíz detrás de un enlace simbólico se colapsa al arrancar', () => {
    const enlaceRaiz = path.join(temporal, 'raiz-enlazada')
    fs.symlinkSync(raiz, enlaceRaiz)

    // Se construye la política CON la raíz enlazada, sin resolver a mano.
    const suya = crearPolitica(resolverRaiz(enlaceRaiz))
    const contencionSuya = crearContencionLinux(suya)

    assert.equal(suya.raiz, raiz)

    const r = contencionSuya.resolver('src/main.ts')
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.ruta.absoluta, path.join(raiz, 'src', 'main.ts'))
  })

  test('resolverRaiz falla si el directorio no existe', () => {
    assert.throws(() => resolverRaiz(path.join(temporal, 'no-existe')))
  })
})
