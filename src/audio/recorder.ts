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

export async function startRecording(): Promise<RecorderHandle> {
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

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.start(1000)

  const meter = createLevelMeter(stream)

  const release = () => {
    meter.dispose()
    for (const track of stream.getTracks()) track.stop()
  }

  return {
    startedAt,
    mimeType: recorder.mimeType || mimeType || 'audio/webm',
    level: meter.level,

    stop: () =>
      new Promise<RecordingResult>((resolve, reject) => {
        recorder.onstop = () => {
          release()
          const type = recorder.mimeType || mimeType || 'audio/webm'
          const blob = new Blob(chunks, { type })
          if (blob.size === 0) {
            reject(new Error('A gravação saiu vazia.'))
            return
          }
          resolve({ blob, durationMs: Date.now() - startedAt, mimeType: type })
        }
        recorder.onerror = () => {
          release()
          reject(new Error('A gravação falhou.'))
        }
        if (recorder.state !== 'inactive') recorder.stop()
        else recorder.onstop?.(new Event('stop'))
      }),

    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
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
