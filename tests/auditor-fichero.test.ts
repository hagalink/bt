import test, { describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { crearPolitica, DIRECTORIO_REGISTRO, type Politica } from '../src/dominio/politica.js'
import { resumir } from '../src/dominio/intencion.js'
import type { Auditor, EventoAuditoria } from '../src/puertos/auditor.js'
import {
  crearAuditorFichero,
  NOMBRE_REGISTRO,
  rutaDelRegistro,
} from '../src/adaptadores/auditor-fichero.js'

let temporal: string
let raiz: string
let politica: Politica
let auditor: Auditor
let registro: string

/** Un reloj fijo: el instante deja de ser una fuente de indeterminismo. */
const RELOJ = () => '2026-07-21T10:30:00.000Z'

const decisionRechazada: EventoAuditoria = {
  tipo: 'decision',
  intencion: resumir({ tipo: 'escribir_fichero', ruta: '/casa/.ssh/authorized_keys', contenido: 'ssh-rsa AAAA' }),
  resultado: 'rechazada',
  regimen: 'inexistente',
  motivo: 'ruta_fuera_de_raiz',
}

function lineas(): string[] {
  return fs.readFileSync(registro, 'utf8').split('\n').filter(Boolean)
}

beforeEach(() => {
  temporal = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bt-aud-')))
  raiz = path.join(temporal, 'proyecto')
  fs.mkdirSync(raiz, { recursive: true })

  politica = crearPolitica(raiz)
  auditor = crearAuditorFichero(politica, { reloj: RELOJ })
  registro = rutaDelRegistro(politica)
})

afterEach(() => {
  fs.rmSync(temporal, { recursive: true, force: true })
})

describe('AuditorFichero · formato', () => {
  test('cada evento produce exactamente una línea de JSON válido', async () => {
    await auditor.registrar(decisionRechazada)

    const contenido = fs.readFileSync(registro, 'utf8')
    assert.equal(contenido.endsWith('\n'), true)
    assert.equal(lineas().length, 1)

    const evento = JSON.parse(lineas()[0] as string)
    assert.equal(evento.tipo, 'decision')
    assert.equal(evento.resultado, 'rechazada')
    assert.equal(evento.motivo, 'ruta_fuera_de_raiz')
  })

  test('el instante lo pone el Auditor, en ISO 8601', async () => {
    // El llamante no puede falsificar ni olvidar la marca temporal: no la pasa.
    await auditor.registrar(decisionRechazada)

    const evento = JSON.parse(lineas()[0] as string)
    assert.equal(evento.instante, '2026-07-21T10:30:00.000Z')
  })

  test('el registro vive dentro del directorio de logs', () => {
    assert.equal(registro, path.join(raiz, DIRECTORIO_REGISTRO, NOMBRE_REGISTRO))
  })
})

describe('AuditorFichero · append-only', () => {
  test('las líneas se acumulan en orden', async () => {
    await auditor.registrar(decisionRechazada)
    await auditor.registrar({ ...decisionRechazada, motivo: 'ruta_en_zona_excluida' })
    await auditor.registrar({ tipo: 'fallo', etapa: 'ejecucion', detalle: 'EACCES' })

    assert.equal(lineas().length, 3)
    assert.equal(JSON.parse(lineas()[0] as string).motivo, 'ruta_fuera_de_raiz')
    assert.equal(JSON.parse(lineas()[1] as string).motivo, 'ruta_en_zona_excluida')
    assert.equal(JSON.parse(lineas()[2] as string).tipo, 'fallo')
  })

  test('un auditor nuevo NO trunca lo ya escrito', async () => {
    await auditor.registrar(decisionRechazada)

    const otro = crearAuditorFichero(politica, { reloj: RELOJ })
    await otro.registrar(decisionRechazada)

    assert.equal(lineas().length, 2)
  })

  test('crea el directorio de logs si no existe', async () => {
    assert.equal(fs.existsSync(path.join(raiz, DIRECTORIO_REGISTRO)), false)

    await auditor.registrar(decisionRechazada)

    assert.equal(fs.existsSync(registro), true)
  })
})

describe('AuditorFichero · el contenido de los ficheros NUNCA se registra', () => {
  test('una escritura registra el tamaño, jamás el contenido', async () => {
    await auditor.registrar({
      tipo: 'decision',
      intencion: resumir({
        tipo: 'escribir_fichero',
        ruta: path.join(raiz, 'notas.txt'),
        contenido: 'la clave del wifi es hunter2',
      }),
      resultado: 'autorizada',
      regimen: 'delegado',
      motivo: null,
    })

    const crudo = fs.readFileSync(registro, 'utf8')
    assert.equal(crudo.includes('hunter2'), false)

    const evento = JSON.parse(lineas()[0] as string)
    assert.equal(evento.intencion.bytesDeContenido, 28)
    assert.equal(evento.intencion.ruta, path.join(raiz, 'notas.txt'))
  })
})

describe('AuditorFichero · el perímetro se defiende a sí mismo', () => {
  test('se niega a arrancar si el registro no queda en zona excluida', () => {
    // Sin `logs` en zonasExcluidas, una intención de borrado sobre el propio
    // registro pasaría la contención. Antes que registrar en un sitio
    // atacable, BT no arranca.
    const desprotegida = crearPolitica(raiz, [])

    assert.throws(() => crearAuditorFichero(desprotegida, { reloj: RELOJ }))
  })

  test('arranca si el registro está protegido por la política', () => {
    assert.doesNotThrow(() => crearAuditorFichero(crearPolitica(raiz), { reloj: RELOJ }))
  })
})

describe('AuditorFichero · un fallo de registro NO se traga', () => {
  test('un error de escritura se propaga al llamante', async () => {
    // Si el registro no se puede escribir, quien llama tiene que enterarse
    // para poder abortar. Una acción no auditada, cuando el humano no mira,
    // es exactamente lo que este proyecto existe para impedir.
    await auditor.registrar(decisionRechazada)
    fs.rmSync(registro)
    fs.mkdirSync(registro) // ahora el "fichero" es un directorio: EISDIR

    await assert.rejects(() => auditor.registrar(decisionRechazada))
  })
})
