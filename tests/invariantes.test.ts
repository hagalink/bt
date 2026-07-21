import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Tests de ARQUITECTURA.
 *
 * Las invariantes del README no son buenas intenciones: se comprueban en cada
 * ejecución de la suite. Si alguien —incluido yo dentro de seis meses— añade
 * un `exec` por comodidad, esto se pone rojo antes de llegar a una PR.
 *
 * La tesis del proyecto dice que la seguridad es una AUSENCIA. Una ausencia
 * hay que verificarla; si no, es solo una afirmación.
 */

const SRC = path.join(import.meta.dirname, '..', '..', 'src')

function ficherosFuente(directorio: string): string[] {
  return fs
    .readdirSync(directorio, { withFileTypes: true })
    .flatMap((entrada) => {
      const completa = path.join(directorio, entrada.name)
      if (entrada.isDirectory()) return ficherosFuente(completa)
      return entrada.name.endsWith('.ts') ? [completa] : []
    })
}

function codigoSinComentarios(fichero: string): string {
  return fs
    .readFileSync(fichero, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '') // bloques
    .replace(/^\s*\/\/.*$/gm, '') // líneas
    .replace(/^\s*\*.*$/gm, '') // continuación de bloque
}

describe('Invariantes · la seguridad es una AUSENCIA', () => {
  const fuentes = ficherosFuente(SRC)

  test('hay ficheros que analizar', () => {
    assert.ok(fuentes.length > 0, 'no se encontró código fuente que verificar')
  })

  for (const prohibido of ['child_process', 'execSync', 'eval(', 'shell: true']) {
    test(`no existe '${prohibido}' en ningún fichero de src/`, () => {
      const culpables = fuentes.filter((f) => codigoSinComentarios(f).includes(prohibido))

      assert.deepEqual(culpables, [], `'${prohibido}' encontrado en: ${culpables.join(', ')}`)
    })
  }
})

describe('Invariantes · el núcleo es puro', () => {
  const nucleo = ficherosFuente(path.join(SRC, 'dominio'))

  test('dominio/ no importa nada de la plataforma', () => {
    const plataforma = /^\s*import\s+(?!type\b)[^']*'(node:|fs|path|os|http|child_process)/gm
    const culpables = nucleo.filter((f) => plataforma.test(fs.readFileSync(f, 'utf8')))

    assert.deepEqual(culpables, [])
  })

  test('ninguna flecha sale del núcleo hacia afuera', () => {
    const haciaAfuera = /^\s*import[^']*'\.\.\/(adaptadores|puertos)/gm
    const culpables = nucleo.filter((f) => haciaAfuera.test(fs.readFileSync(f, 'utf8')))

    assert.deepEqual(culpables, [], 'el dominio no puede conocer adaptadores ni puertos')
  })
})

describe('Invariantes · BT es cliente, nunca servidor', () => {
  const fuentes = ficherosFuente(SRC)

  for (const prohibido of ['createServer', 'listen(', 'WebSocket']) {
    test(`no existe '${prohibido}': BT no escucha en ningún puerto`, () => {
      const culpables = fuentes.filter((f) => codigoSinComentarios(f).includes(prohibido))

      assert.deepEqual(culpables, [])
    })
  }
})

describe('Invariantes · el Ejecutor no crea ni destruye árboles', () => {
  const ejecutor = path.join(SRC, 'adaptadores', 'ejecutor-linux.ts')

  for (const prohibido of ['mkdir', 'rmdir', 'recursive', 'rm(']) {
    test(`el Ejecutor no usa '${prohibido}'`, () => {
      assert.equal(codigoSinComentarios(ejecutor).includes(prohibido), false)
    })
  }
})
