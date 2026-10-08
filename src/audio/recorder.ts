/**
 * Gravação de áudio dentro da anotação.
 *
 * O importante aqui não é só guardar o arquivo: é guardar `startedAt` em tempo
 * absoluto. Como cada traço também guarda o instante em que foi escrito, dá pra
 * cruzar os dois depois e pular o áudio pro momento em que aquele rabisco saiu
 * da caneta.
 */

export interface RecorderHandle {
  stop: () => Promise<RecordingResult>
  cancel: () => void
  startedAt: number
  mimeType: string
  /** Nível de volume atual (0..1), pro medidor na barra de gravação. */
  level: () => number
}

export interface RecordingResult {
  blob: Blob
  durationMs: number
  mimeType: string
}

/** Formatos aceitos, do melhor pro mais compatível. */
const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

/**
 * O que o gravador avisa enquanto grava.
 *
 * `aoPedaco` recebe cada pedaço assim que ele existe — é por ele que a
 * gravação vai pro banco durante a reunião, e não só no "Parar".
 *
 * `aoInterromper` avisa quando a gravação parou SOZINHA: o microfone foi
 * tomado por outro app, a permissão caiu, o gravador deu erro. Antes disso
 * acontecia em silêncio — a barra continuava contando "Parar · 0:09" enquanto
 * nada mais era gravado.
 */
export interface OpcoesDeGravacao {
  aoPedaco?: (pedaco: Blob, ordem: number) => void
  aoInterromper?: (motivo: string) => void
  /** O app voltou pra frente depois de `msFora` com a tela apagada ou escondido. */
  aoVoltar?: (msFora: number) => void
}

export async function startRecording(opcoes: OpcoesDeGravacao = {}): Promise<RecorderHandle> {
  if (!isRecordingSupported()) {
    throw new Error('Este navegador não permite gravar áudio.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  const startedAt = Date.now()
  const tipo = () => recorder.mimeType || mimeType || 'audio/webm'
  let ordem = 0

  /*
   * Quem pediu pra parar. Sem pedido, o "stop" veio de fora — e aí é
   * interrupção, que tem que ser dita ao usuário.
   */
  let pedido: { resolve: (r: RecordingResult) => void; reject: (e: Error) => void } | null = null
  let terminouEm: number | null = null
  let falhou = false

  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return
    chunks.push(event.data)
    try {
      opcoes.aoPedaco?.(event.data, ordem++)
    } catch {
      // Guardar o pedaço é com quem chamou; o gravador continua gravando.
    }
  }

  const resultado = (): RecordingResult => ({
    blob: new Blob(chunks, { type: tipo() }),
    durationMs: (terminouEm ?? Date.now()) - startedAt,
    mimeType: tipo(),
  })

  recorder.onstop = () => {
    release()
    terminouEm ??= Date.now()
    if (pedido) {
      const r = resultado()
      if (r.blob.size === 0) pedido.reject(new Error('A gravação saiu vazia.'))
      else pedido.resolve(r)
      pedido = null
      return
    }
    if (!falhou) opcoes.aoInterromper?.('O microfone parou de gravar.')
  }
  recorder.onerror = () => {
    falhou = true
    terminouEm ??= Date.now()
    if (pedido) {
      release()
      pedido.reject(new Error('A gravação falhou.'))
      pedido = null
      return
    }
    opcoes.aoInterromper?.('A gravação falhou.')
  }
  // O microfone pode ser tomado no meio da reunião (outro app, ligação,
  // permissão revogada). A trilha acaba, e o gravador tem que parar junto pra
  // que o que foi gravado até ali feche direito.
  for (const track of stream.getAudioTracks()) {
    track.addEventListener('ended', () => {
      if (recorder.state !== 'inactive') recorder.stop()
    })
  }
  recorder.start(1000)

  const meter = createLevelMeter(stream)
  const soltarTela = manterTelaAcesa(opcoes.aoVoltar)

  let solto = false
  const release = () => {
    if (solto) return
    solto = true
    soltarTela()
    meter.dispose()
    for (const track of stream.getTracks()) track.stop()
  }

  return {
    startedAt,
    mimeType: tipo(),
    level: meter.level,

    stop: () =>
      new Promise<RecordingResult>((resolve, reject) => {
        // Já parou sozinho: devolve o que foi gravado até a interrupção.
        if (recorder.state === 'inactive') {
          release()
          const r = resultado()
          if (r.blob.size === 0) reject(new Error('A gravação saiu vazia.'))
          else resolve(r)
          return
        }
        pedido = { resolve, reject }
        recorder.stop()
      }),

    cancel: () => {
      pedido = null
      if (recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
      }
      release()
    },
  }
}

/**
 * A tela não apaga enquanto grava.
 *
 * App que sai da frente — tela apagada pelo tempo de espera, botão de
 * desligar, outro app aberto por cima — tem o microfone SILENCIADO pelo
 * Android (desde a versão 9). A trilha não acaba e o gravador não reclama:
 * ele continua gravando silêncio, e a reunião de uma hora volta com
 * quarenta minutos mudos. Com a caneta parada por alguns minutos, a tela
 * apagaria sozinha no meio da reunião.
 *
 * Aqui a tela fica acesa enquanto grava (a trava cai sozinha quando o app
 * vai pro fundo, e é pedida de novo quando ele volta). E se mesmo assim o
 * app saiu da frente — ele apertou o botão de desligar — `aoVoltar` diz por
 * quanto tempo, pra tela avisar que aquele trecho pode estar mudo.
 */
function manterTelaAcesa(aoVoltar?: (msFora: number) => void): () => void {
  type Trava = { release: () => Promise<void> }
  const pedidos = (navigator as Navigator & { wakeLock?: { request: (tipo: 'screen') => Promise<Trava> } })
    .wakeLock
  let trava: Trava | null = null
  let ativa = true
  let saiuEm: number | null = null

  const pedir = () => {
    if (!pedidos || !ativa || document.visibilityState !== 'visible') return
    pedidos
      .request('screen')
      .then((t) => {
        if (ativa) trava = t
        else void t.release().catch(() => {})
      })
      // Sem permissão ou sem suporte: grava do mesmo jeito.
      .catch(() => {})
  }

  const aoMudar = () => {
    if (document.visibilityState === 'hidden') {
      saiuEm ??= Date.now()
      return
    }
    if (saiuEm !== null) {
      const fora = Date.now() - saiuEm
      saiuEm = null
      if (fora > 2000) aoVoltar?.(fora)
    }
    pedir()
  }

  document.addEventListener('visibilitychange', aoMudar)
  pedir()

  return () => {
    ativa = false
    document.removeEventListener('visibilitychange', aoMudar)
    void trava?.release().catch(() => {})
    trava = null
  }
}

interface LevelMeter {
  level: () => number
  dispose: () => void
}

/** Medidor de volume via Web Audio — só pra dar retorno visual de que está captando. */
function createLevelMeter(stream: MediaStream): LevelMeter {
  try {
    const AudioCtx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return { level: () => 0, dispose: () => {} }

    const ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)

    return {
      level: () => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
        return Math.min(1, peak / 96)
      },
      dispose: () => {
        source.disconnect()
        void ctx.close()
      },
    }
  } catch {
    return { level: () => 0, dispose: () => {} }
  }
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
