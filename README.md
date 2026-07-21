# BT

Vas a ayudarme a construir **BT**. Antes de escribir una línea de código, asimila todo
esto, porque las decisiones ya están tomadas y tienen razones.

## Qué es BT

BT es la voz con la que le doy órdenes a mi ordenador cuando no estoy delante de él.
Un proceso local que me escucha, entiende una orden en castellano, y la ejecuta sobre
mis ficheros.

**No es un chatbot.** No conversa: ejecuta.
**No es un envoltorio de un modelo.** Es un *perímetro* alrededor de un modelo.
**Está definido por lo que NO puede hacer.**

Objetivo final: orquestar trabajo de programación hablando, como se dirige a un agente
de código, pero por voz y sin mirar la pantalla.

## Contexto de por qué importa el rigor

Esto se va a grabar como una serie de vídeos técnicos. Cada decisión de diseño hay que
poder DEFENDERLA en cámara. No quiero código que funcione: quiero código que enseñe.
Si una decisión no se puede justificar en dos frases, está mal tomada.

Corolario: **la claridad gana a la astucia siempre.** Nada de trucos ingeniosos.

## LA TESIS (esto gobierna todo el diseño)

> El modelo de lenguaje está FUERA del perímetro de confianza.
> El modelo PROPONE. No DECIDE.

Da igual que el modelo corra en mi máquina. Local significa privado, no confiable.
El texto que devuelve un modelo es un dato sospechoso, nunca una instrucción.

Segunda tesis, derivada:

> La seguridad de un agente de código convencional se apoya, más que en nada, en que
> hay un humano leyendo una pantalla. Cuando la interacción es por voz, ese humano deja
> de mirar. **El proyecto entero consiste en reforzar lo que se cae cuando el humano
> deja de mirar.**

Tercera, la que resume:

> La seguridad es una AUSENCIA. En este código base no existe `run_command`, ni `exec`,
> ni `eval`, en ningún sitio. Lo que no está en la lista no está prohibido:
> **no existe.**

## Los cuatro regímenes de permiso

Toda acción cae en uno de estos cuatro. Es el eje del diseño:

| Régimen | Cuándo | Ejemplo |
|---|---|---|
| **Autónomo** | Sé qué pasa y no rompe nada | leer un fichero del proyecto |
| **Consultado** | Confirmo, y **entiendo lo que apruebo** | borrar un fichero concreto |
| **Delegado** | Perímetro + reversibilidad, no confirmación | escribir ficheros |
| **Inexistente** | Ni preguntando. No hay capacidad | escribir fuera del proyecto |

**Matiz crítico:** confirmar algo que no entiendes no es seguridad, es teatro. Pedir
confirmación para 40 acciones seguidas produce fatiga y el humano dice que sí a todo.
Por eso "consultado" solo vale cuando el humano PUEDE comprender el alcance.

**Sobre `Autónomo` vs `Delegado`:** la frontera es la reversibilidad, no la cantidad.
`Autónomo` es para acciones que no alteran nada (leer). En cuanto una acción modifica el
disco, deja de ser autónoma: necesita perímetro contenido **y** una vía de vuelta —
eso es `Delegado`. Escribir un fichero es Delegado aunque sea uno solo.

## Arquitectura

Hexagonal (puertos y adaptadores), con el rigor concentrado en el núcleo del dominio
(principio de proporcionalidad: el esfuerzo va donde está el riesgo).

**Regla de nombres, sin excepciones:** los puertos se nombran por su ROL de dominio, los
adaptadores por su TECNOLOGÍA.
Correcto: puerto `Locutor` → adaptador `LocutorPiper`.
Incorrecto: un puerto llamado `TTS`.

```
bt/
├── src/
│   ├── dominio/       intencion.ts · politica.ts · guardia.ts
│   ├── puertos/       transcriptor.ts · interprete.ts · ejecutor.ts
│   │                  auditor.ts · locutor.ts
│   ├── adaptadores/   transcriptor-whisper.ts · interprete-ollama.ts
│   │                  ejecutor-linux.ts · auditor-fichero.ts · locutor-piper.ts
│   └── main.ts        raíz de composición
└── tests/             guardia.test.ts …
```

Invariantes de arquitectura:

1. **El núcleo (`dominio/`) es puro.** Cero I/O. Cero imports de `fs`, `child_process` o
   red. Se testea en milisegundos sin hardware.
2. **Ninguna flecha sale del núcleo hacia afuera.** Todo apunta hacia dentro.
3. **BT es cliente, nunca servidor.** No escucha en ningún puerto. Un backend HTTP local
   sería el anti-patrón exacto: cualquier página web podría atacarlo con un `fetch` a
   127.0.0.1.
4. **`IntencionAutorizada` es un tipo que SOLO la Guardia puede construir** (marca
   privada / constructor no exportado). El `Ejecutor` solo acepta ese tipo. Resultado:
   saltarse la Guardia **no compila**. Estados ilegales, irrepresentables.
5. **La `Politica` es DATOS, no código.** Cambiar permisos = editar una estructura de
   datos, nunca editar lógica.

## Tecnologías y por qué

Regla general: **cada dependencia es superficie de ataque.** La pregunta en cada
decisión no es "¿cuál es la mejor librería?" sino "¿puedo hacer esto sin librería?".

| Pieza | Elección | Razón |
|---|---|---|
| Lenguaje | TypeScript sobre Node LTS | El tipo `IntencionAutorizada` ES la garantía de diseño |
| Frontera del modelo | **Zod** | Unión discriminada con enums cerrados. Lista blanca, no negra |
| Oído | **whisper.cpp** modelo `small`, por `spawn` | Local. Binario. Cero addons nativos |
| Entendimiento | **Ollama** local (`localhost:11434`) | Privado. Detrás del puerto `Interprete`, intercambiable por nube |
| Voz | **Piper**, por `spawn` | Simetría: entra local, sale local |
| Registro | Fichero **JSONL append-only** en `logs/` | Sin servicio = sin superficie. Lo valioso son los RECHAZOS |
| Reversibilidad | **git** | Rama automática antes de escribir. Hace aceptable el permiso |
| Interfaz | **TUI** en terminal | Sin Electron, sin IPC, sin renderer, sin superficie nueva |
| Disparo | Atajo global de **GNOME** + `SIGUSR1` + pidfile | Nunca micrófono abierto |
| Tests | **`node:test`** nativo | Cero dependencias. El runner viene en la plataforma |

Detalles técnicos que NO son negociables:

- **`spawn` siempre con `shell: false` y argumentos como array.** Nada se interpreta.
- **Contención de rutas con `realpathSync` + `startsWith(RAIZ + path.sep)`.** Esto
  derrota tanto `../` como los enlaces simbólicos. La comprobación va ANTES de existir
  el ejecutor.
- **Texto libre como CONTENIDO es inofensivo; como RUTA o COMANDO, jamás.** Escribir
  "hola" en un fichero es inerte. Escribir "hola" en `.bashrc` es ejecución de código.
  Por eso el contenido puede ser libre solo si la RUTA está contenida.
- Estoy en **Wayland**, que a propósito impide que una app capture teclas globales. Por
  eso el atajo lo registra GNOME y nos manda una señal. Pedimos prestado el privilegio,
  no nos lo tomamos.

### El registro de auditoría y su zona excluida

El log vive en `logs/`, dentro del proyecto: quiero verlo, no esconderlo.

Pero eso abre un agujero evidente: si `logs/` está dentro de la raíz contenida, una
intención `borrar_fichero` sobre el propio log **pasaría la contención de rutas**. El
modelo podría proponer borrar la evidencia y el perímetro lo dejaría pasar.

Por eso `logs/` es una **zona excluida**: una lista, en la `Politica` (que es datos), de
subárboles que quedan en régimen `Inexistente` aunque estén dentro de la raíz. La
contención de rutas no es solo "dentro de la raíz"; es "dentro de la raíz **y** fuera de
toda zona excluida".

Regla que se deriva: **el perímetro se defiende a sí mismo antes que a nada.** Un
registro que la Guardia autoriza a borrar no es un registro.

## Alcance del MVP

DENTRO:
- Escuchar por atajo de teclado.
- `leer_fichero` dentro del proyecto → **autónomo**
- `escribir_fichero` dentro del proyecto → **delegado**, con rama de git previa
- `borrar_fichero` → **consultado**
- Cualquier ruta fuera del proyecto, o dentro de `logs/` → **rechazado**
- **SIN SHELL. En absoluto. Ni una sola forma de ejecutar un comando arbitrario.**

FUERA, a propósito (cada una es una serie entera, no un paso):
- Shell contenida (bubblewrap / `systemd-run --user`; sandbox → MEDIR → promover)
- Wake-word (implica micrófono siempre abierto: no)
- Memoria persistente, voz personalizada

La demo final del MVP termina con: *"añadí mi clave pública a authorized_keys"* →
**RECHAZADO**, registrado en el log.

## Fases de desarrollo

Criterio de ordenación, y hay que respetarlo:

1. **Lo testeable sin hardware, primero.** La seguridad entera se escribe y se prueba
   antes de que exista un micrófono.
2. **Cada fase termina con algo que corre.** Nada de andamiaje muerto.

**Fase 0 — Núcleo (cero I/O)**
1. Tipos: `Intencion`, `Decision`, `IntencionAutorizada`
2. `Guardia` como **función pura** + su batería de tests
3. `Politica` (allow-list como datos)

**Fase 1 — Ejecución**
4. Contención de rutas (`realpath` + prefijo)
5. `Ejecutor` de ficheros
6. `Auditor` JSONL
7. ▶ CORRE: intención tecleada a mano

**Fase 2 — Entendimiento**
8. `Interprete` Ollama + validación Zod
9. ▶ CORRE: orden escrita en castellano

**Fase 3 — Voz (MVP)**
10. `Transcriptor` whisper.cpp
11. Disparador por tecla (simple)
12. ▶ MVP: hablo y se ejecuta

**Fase 4 — Control**
13. `Locutor` Piper
14. **Anuncio de alcance**
15. Rama de git automática

**Fase 5 — Presentación**
16. TUI
17. Atajo global GNOME + `SIGUSR1`

Sobre el paso 14, que es el concepto más fino del proyecto: el anuncio de alcance ("voy
a tocar estos tres ficheros") **no es cortesía, es un contrato**. Al aprobarlo, el
permiso se ESTRECHA a exactamente esos ficheros. Si aparece un cuarto, no es una
excepción que se consulta: es un **rechazo mecánico y una señal de alarma**. Razón: por
voz se puede revisar un ALCANCE; un diff no. Voz = alcance, pantalla = contenido.

## Cómo quiero trabajar

- **TDD estricto.** El test antes que el código, siempre. La Guardia se escribe guiada
  por tests y no se toca hasta que estén todos en verde.
- **Nada de dependencias que no hayamos justificado.** Si propones instalar algo,
  primero dime por qué no se puede hacer sin ello.
- **Un paso cada vez.** No te adelantes a fases posteriores.
- **Si detectas que una decisión mía es incorrecta, dímelo con el razonamiento
  técnico.** No me des la razón por defecto.
- Código y nombres **en castellano** (dominio), como en la estructura de arriba.
- No construyas nunca nada que escuche en un puerto.
