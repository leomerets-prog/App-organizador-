import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Stroke } from '../domain/types'

/**
 * Transcrição da letra manuscrita.
 *
 * Quem faz o trabalho é o **ML Kit Digital Ink**, dentro do aparelho: ele lê os
 * traços (pontos e tempos), não uma foto da tela — que é exatamente o que este
 * app já guarda. Depois de baixar o modelo do idioma uma vez, funciona offline,
 * de graça, e nada da anotação sai do tablet.
 *
 * Isso vive no lado Android (`InkRecognitionPlugin.java`). No navegador não
 * existe nada equivalente que rode offline, então aqui a transcrição
 * simplesmente não está disponível — e o texto continua podendo ser escrito à
 * mão pelo usuário, que é o caminho que funciona em todo lugar.
 */

export interface RecognizePayload {
  /** Um traço por lista de pontos; `t` em ms, crescente. */
  strokes: { x: number; y: number; t: number }[][]
  /** Tamanho da área onde se escreveu, nas mesmas unidades dos pontos. */
  width: number
  height: number
  /** Texto que vem antes, quando houver: ajuda o reconhecedor a decidir. */
  preContext?: string
}

interface InkRecognitionPlugin {
  status(): Promise<{ available: boolean; downloaded: boolean; language?: string }>
  prepare(): Promise<{ downloaded: boolean; language?: string }>
  recognize(payload: RecognizePayload): Promise<{ text: string }>
}

const InkRecognition = registerPlugin<InkRecognitionPlugin>('InkRecognition')

export type TranscriptionState = 'indisponivel' | 'baixando' | 'lendo' | 'pronto' | 'erro'

export interface TranscriptionStatus {
  state: TranscriptionState
  message: string
  /** Idioma que o reconhecedor escolheu; aparece na tela pra dar o que conferir. */
  language?: string
}

const INDISPONIVEL: TranscriptionStatus = {
  state: 'indisponivel',
  message:
    'A transcrição automática só roda no aplicativo instalado (APK). Aqui você pode escrever o texto à mão.',
}

let ready: Promise<TranscriptionStatus> | null = null

/** Estamos dentro do app Android, onde o reconhecedor existe? */
export function recognizerPossible(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/**
 * Garante o reconhecedor pronto, baixando o modelo do idioma se for a primeira
 * vez. Uma execução só por abertura do app: o download é caro e o resultado
 * vale pra todas as páginas.
 */
export function prepareRecognizer(onProgress?: (s: TranscriptionStatus) => void): Promise<TranscriptionStatus> {
  if (!recognizerPossible()) return Promise.resolve(INDISPONIVEL)

  ready ??= (async () => {
    try {
      const status = await InkRecognition.status()
      console.log(
        `organizador: reconhecedor — disponível=${status.available} baixado=${status.downloaded} idioma=${status.language ?? '?'}`,
      )
      if (!status.available) return INDISPONIVEL
      if (status.downloaded) {
        return { state: 'pronto', message: '', language: status.language } as TranscriptionStatus
      }

      // O modelo do idioma é baixado uma vez, e só uma. Daí em diante a
      // transcrição acontece no aparelho, sem internet.
      onProgress?.({
        state: 'baixando',
        message: 'Baixando o modelo de escrita — precisa de internet só desta vez…',
        language: status.language,
      })
      const baixado = await InkRecognition.prepare()
      console.log(`organizador: modelo de escrita baixado (${baixado.language ?? '?'})`)
      return { state: 'pronto', message: '', language: baixado.language } as TranscriptionStatus
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não consegui preparar a transcrição.'
      console.warn(`organizador: aviso — transcrição indisponível: ${message}`)
      // Uma tentativa falha não pode trancar as próximas: sem internet agora,
      // com internet daqui a pouco, e é pra funcionar sem reinstalar nada.
      ready = null
      return { state: 'erro', message } as TranscriptionStatus
    }
  })()

  return ready
}

/**
 * Transcreve os traços de um campo.
 *
 * `area` é a zona onde se escreveu: passar o tamanho dela melhora bastante o
 * reconhecimento, porque é o que dá escala à letra.
 */
export async function recognizeStrokes(
  strokes: readonly Stroke[],
  area: { width: number; height: number },
  preContext?: string,
): Promise<string> {
  if (!recognizerPossible()) return ''

  const payload: RecognizePayload = {
    // O tempo vai absoluto (início do traço + instante do ponto): o
    // reconhecedor usa a ordem no tempo, e ela precisa valer entre traços, não
    // só dentro de cada um.
    strokes: strokes
      .filter((s) => s.tool !== 'highlighter' && s.points.length > 0)
      .map((s) => s.points.map((p) => ({ x: p.x, y: p.y, t: Math.round(s.startedAt + p.t) })))
      .filter((points) => points.length > 0),
    width: Math.max(1, Math.round(area.width)),
    height: Math.max(1, Math.round(area.height)),
    preContext,
  }
  if (payload.strokes.length === 0) return ''

  const result = await InkRecognition.recognize(payload)
  return (result.text ?? '').trim()
}

/** Esquece o estado de preparo — usado quando o usuário manda tentar de novo. */
export function resetRecognizer(): void {
  ready = null
}
