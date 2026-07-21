import test, { describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { Intencion } from '../src/dominio/intencion.js'
import { crearPolitica, type Politica } from '../src/dominio/politica.js'
import { confirmar, decidir, type IntencionAutorizada } from '../src/dominio/guardia.js'
import type { Contencion } from '../src/puertos/contencion.js'
import { crearContencionLinux } from '../src/adaptadores/contencion-linux.js'
import type { Ejecutor } from '../src/puertos/ejecutor.js'
import { crearEjecutorLinux } from '../src/adaptadores/ejecutor-linux.js'

let temporal: string
let raiz: string
let politica: Politica
let contencion: Contencion
let ejecutor: Ejecutor

/**
 * Para obtener una `IntencionAutorizada` hay que recorrer la tubería REAL, la
 * misma que usará la raíz de composición: ContencionLinux → Guardia →
 * (confirmar). No hay puerta trasera en los tests, igual que no la hay en
 * producción.
 *
 * Se usa el ADAPTADOR y no la función pura `contener` a propósito: el disco
 * forma parte de la decisión, y un test que se saltara esa parte estaría
 * probando una tubería que no existe.
 */
function autorizar(intencion: Intencion, rutaCruda = intencion.ruta): IntencionAutorizada {
  const contenida = contencion.resolver(rutaCruda)
  if (!contenida.ok) throw new Error(`ruta no contenida: ${rutaCruda} (${contenida.motivo})`)

  const decision = decidir(intencion, contenida.ruta, politica)
  if (decision.resultado === 'autorizada') return decision.autorizada
  if (decision.resultado === 'requiere_confirmacion') return confirmar(decision)
  throw new Error(`intención rechazada: ${decision.motivo}`)
}

const en = (...partes: string[]) => path.join(raiz, ...partes)

beforeEach(() => {
  temporal = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bt-eje-')))
  raiz = path.join(temporal, 'proyecto')
  fs.mkdirSync(path.join(raiz, 'src'), { recursive: true })
  fs.writeFileSync(en('src', 'main.ts'), 'export {}\n')

  politica = crearPolitica(raiz)
  contencion = crearContencionLinux(politica)
  ejecutor = crearEjecutorLinux()
})

afterEach(() => {
  fs.rmSync(temporal, { recursive: true, force: true })
})

describe('EjecutorLinux · leer', () => {
  test('devuelve el contenido del fichero', async () => {
    const r = await ejecutor.ejecutar(
      autorizar({ tipo: 'leer_fichero', ruta: en('src', 'main.ts') }),
    )

    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.tipo, 'leido')
    if (r.tipo !== 'leido') return
    assert.equal(r.contenido, 'export {}\n')
  })

  test('un fichero inexistente falla con no_existe', async () => {
    const r = await ejecutor.ejecutar(
      autorizar({ tipo: 'leer_fichero', ruta: en('src', 'fantasma.ts') }),
    )

    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.fallo, 'no_existe')
  })

  test('un directorio no es un fichero', async () => {
    const r = await ejecutor.ejecutar(autorizar({ tipo: 'leer_fichero', ruta: en('src') }))

    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.fallo, 'no_es_un_fichero')
  })
})

describe('EjecutorLinux · escribir', () => {
  test('crea el fichero y devuelve los bytes escritos', async () => {
    const r = await ejecutor.ejecutar(
      autorizar({ tipo: 'escribir_fichero', ruta: en('nota.txt'), contenido: 'hola' }),
    )

    assert.equal(r.ok, true)
    if (!r.ok || r.tipo !== 'escrito') return
    assert.equal(r.bytes, 4)
    assert.equal(fs.readFileSync(en('nota.txt'), 'utf8'), 'hola')
  })

  test('los bytes son BYTES, no caracteres', async () => {
    const r = await ejecutor.ejecutar(
      autorizar({ tipo: 'escribir_fichero', ruta: en('nota.txt'), contenido: 'ñ' }),
    )

    assert.equal(r.ok, true)
    if (!r.ok || r.tipo !== 'escrito') return
    assert.equal(r.bytes, 2)
  })

  test('sobrescribe sin dejar restos del contenido anterior', async () => {
    fs.writeFileSync(en('nota.txt'), 'un contenido bastante largo que debe desaparecer')

    await ejecutor.ejecutar(
      autorizar({ tipo: 'escribir_fichero', ruta: en('nota.txt'), contenido: 'corto' }),
    )

    assert.equal(fs.readFileSync(en('nota.txt'), 'utf8'), 'corto')
  })

  test('un padre inexistente ni siquiera llega a autorizarse', () => {
    // Defensa en profundidad: BT no crea árboles de directorios, y hay DOS
    // capas que lo impiden. La primera es la contención, que rechaza antes de
    // que exista una IntencionAutorizada. Por eso el Ejecutor no puede
    // recibir jamás una ruta con el padre ausente.
    assert.throws(() =>
      autorizar({ tipo: 'escribir_fichero', ruta: en('sin', 'crear', 'x.txt'), contenido: 'x' }),
    )
    assert.equal(fs.existsSync(en('sin')), false)
  })

  test('la segunda capa: el Ejecutor tampoco crea el padre por su cuenta', async () => {
    // Y si algún día la primera capa fallara, O_CREAT crea el FICHERO pero
    // nunca los directorios: la apertura falla en vez de inventar un árbol.
    const huerfano = en('src', 'nuevo.txt')
    const r = await ejecutor.ejecutar(
      autorizar({ tipo: 'escribir_fichero', ruta: huerfano, contenido: 'x' }),
    )

    // Con el padre presente funciona...
    assert.equal(r.ok, true)
    // ...y no ha aparecido ningún directorio que nadie pidiera.
    assert.deepEqual(fs.readdirSync(raiz).sort(), ['src'])
  })

  test('escribir sobre un directorio falla', async () => {
    const r = await ejecutor.ejecutar(
      autorizar({ tipo: 'escribir_fichero', ruta: en('src'), contenido: 'x' }),
    )

    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.fallo, 'no_es_un_fichero')
  })
})

describe('EjecutorLinux · borrar', () => {
  test('elimina el fichero', async () => {
    await ejecutor.ejecutar(autorizar({ tipo: 'borrar_fichero', ruta: en('src', 'main.ts') }))

    assert.equal(fs.existsSync(en('src', 'main.ts')), false)
  })

  test('borrar un DIRECTORIO falla: el MVP borra ficheros, nunca árboles', async () => {
    const r = await ejecutor.ejecutar(autorizar({ tipo: 'borrar_fichero', ruta: en('src') }))

    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.fallo, 'no_es_un_fichero')
    assert.equal(fs.existsSync(en('src')), true)
  })

  test('borrar un fichero inexistente falla con no_existe', async () => {
    const r = await ejecutor.ejecutar(
      autorizar({ tipo: 'borrar_fichero', ruta: en('fantasma.txt') }),
    )

    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.fallo, 'no_existe')
  })
})

describe('EjecutorLinux · cierra la ventana TOCTOU que #1 dejó abierta', () => {
  test('un enlace plantado ENTRE la resolución y la escritura hace fallar la apertura', async () => {
    const objetivo = en('nota.txt')

    // 1. Se autoriza cuando el fichero todavía no existe. La contención
    //    resuelve el padre y da el visto bueno.
    const autorizada = autorizar({
      tipo: 'escribir_fichero',
      ruta: objetivo,
      contenido: 'contenido legítimo',
    })

    // 2. Un atacante planta un enlace en esa ruta antes de que escribamos.
    const victima = path.join(temporal, 'victima.txt')
    fs.writeFileSync(victima, 'no me toques\n')
    fs.symlinkSync(victima, objetivo)

    // 3. O_NOFOLLOW: la apertura falla en lugar de seguir el enlace.
    const r = await ejecutor.ejecutar(autorizada)

    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.fallo, 'enlace_simbolico')
    assert.equal(fs.readFileSync(victima, 'utf8'), 'no me toques\n')
  })

  test('un enlace plantado antes de LEER tampoco se sigue', async () => {
    const objetivo = en('lectura.txt')
    fs.writeFileSync(objetivo, 'original\n')

    const autorizada = autorizar({ tipo: 'leer_fichero', ruta: objetivo })

    fs.rmSync(objetivo)
    fs.symlinkSync(path.join(temporal, 'secreto.txt'), objetivo)
    fs.writeFileSync(path.join(temporal, 'secreto.txt'), 'ssh-rsa AAAA\n')

    const r = await ejecutor.ejecutar(autorizada)

    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.fallo, 'enlace_simbolico')
  })

  test('un enlace plantado antes de BORRAR no se sigue ni se elimina', async () => {
    const objetivo = en('basura.txt')
    fs.writeFileSync(objetivo, 'x')

    const autorizada = autorizar({ tipo: 'borrar_fichero', ruta: objetivo })

    const victima = path.join(temporal, 'importante.txt')
    fs.writeFileSync(victima, 'no me borres\n')
    fs.rmSync(objetivo)
    fs.symlinkSync(victima, objetivo)

    const r = await ejecutor.ejecutar(autorizada)

    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.fallo, 'enlace_simbolico')
    assert.equal(fs.existsSync(victima), true)
  })
})

describe('EjecutorLinux · actúa sobre la ruta VERIFICADA, no sobre la del modelo', () => {
  test('la ruta cruda de la intención se ignora por completo', async () => {
    // La intención dice una cosa; la ruta contenida dice otra. El Ejecutor
    // debe obedecer a la que pasó por el disco y por el perímetro.
    const real = en('verificada.txt')
    const señuelo = en('senuelo.txt')

    const autorizada = autorizar(
      { tipo: 'escribir_fichero', ruta: señuelo, contenido: 'contenido' },
      real,
    )

    await ejecutor.ejecutar(autorizada)

    assert.equal(fs.existsSync(real), true)
    assert.equal(fs.existsSync(señuelo), false)
  })
})
