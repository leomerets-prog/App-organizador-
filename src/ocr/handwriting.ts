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

/**
 * O que vai pro plugin.
 *
 * **Nenhum campo é opcional, de propósito.** Mandar `undefined` faz a ponte do
 * Capacitor recusar a chamada inteira com "Missing required properties" — e o
 * app via isso como "o reconhecedor não leu nada", quando na verdade a leitura
 * nunca chegou a acontecer. Foi o que segurou a transcrição desde o começo.
 * Campo sem valor vai como vazio (`''` ou `0`), nunca ausente.
 */
export interface RecognizePayload {
  /** Um traço por lista de pontos; `t` em ms, crescente. */
  strokes: { x: number; y: number; t: number }[][]
  /** Tamanho da área onde se escreveu, nas mesmas unidades dos pontos. 0 = sem área. */
  width: number
  height: number
  /** Texto que vem antes; vazio quando não houver, nunca ausente. */
  preContext: string
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
  /**
   * O que dá pra fazer a respeito, num toque.
   *
   * Aviso que explica o problema mas deixa o conserto longe ainda custa uma
   * caçada pela barra de ferramentas — e o motivo mais comum de não haver o que
   * ler é justamente um interruptor desligado.
   */
  acao?: 'ligarCampos'
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

/** Área onde a linha foi escrita, em px de página. */
export interface WritingArea {
  x: number
  y: number
  width: number
  height: number
}

/** O que a tentativa de leitura produziu — inclusive quando não produziu nada. */
export interface RecognizeResult {
  text: string
  /** Números da tentativa, pra explicar na tela por que não saiu texto. */
  diagnostico: string
}

/**
 * Transcreve os traços de um campo.
 *
 * Duas coisas aqui já custaram uma volta de aparelho, e as duas são sobre
 * SISTEMA DE COORDENADAS:
 *
 * 1. Os pontos vão **relativos à área de escrita**, não em coordenadas da
 *    folha. O reconhecedor compara a letra com a área que recebeu; mandar uma
 *    linha escrita em y≈1300 dentro de uma área de 246 de altura é descrever
 *    escrita que cai fora do papel — e ele devolve nada, sem erro nenhum.
 * 2. Se ainda assim não sair texto, tenta de novo **sem área nenhuma**, deixando
 *    o reconhecedor se virar com a escala da própria letra. Uma área errada
 *    atrapalha mais que área nenhuma.
 */
export async function recognizeStrokes(
  strokes: readonly Stroke[],
  area: WritingArea,
  preContext?: string,
): Promise<RecognizeResult> {
  if (!recognizerPossible()) return { text: '', diagnostico: 'sem reconhecedor' }

  const uteis = strokes.filter((s) => s.tool !== 'highlighter' && s.points.length > 0)
  if (uteis.length === 0) return { text: '', diagnostico: 'sem traços de caneta' }

  // O tempo vai absoluto (início do traço + instante do ponto): o reconhecedor
  // usa a ordem no tempo, e ela precisa valer entre traços, não só dentro de cada um.
  const naFolha = uteis
    .map((s) => s.points.map((p) => ({ x: p.x, y: p.y, t: Math.round(s.startedAt + p.t) })))
    .filter((points) => points.length > 0)

  const caixa = boundingBox(naFolha)
  const pontos = naFolha.reduce((total, p) => total + p.length, 0)

  /*
   * Três formas de descrever a MESMA linha, da mais provável pra menos.
   *
   * O reconhecedor devolve vazio sem erro quando não gosta do que recebeu, e
   * não diz o que não gostou — então em vez de adivinhar, tentam-se as três e
   * fica registrado qual funcionou. Cada tentativa é local e rápida.
   *
   *   linha  — a letra sozinha, encostada na origem, numa área do tamanho dela
   *            (é o formato dos exemplos do próprio ML Kit: a escrita preenche
   *            a área de escrita)
   *   sem    — a mesma letra, sem área nenhuma: ele se vira com a escala
   *   zona   — a faixa da folha como área, que é o que descreve o espaço real
   */
  const folga = Math.max(12, caixa.h * 0.4)
  const tentativas: { nome: string; strokes: typeof naFolha; width: number; height: number }[] = [
    {
      nome: 'linha',
      strokes: mover(naFolha, caixa.minX - folga, caixa.minY - folga),
      width: Math.round(caixa.w + folga * 2),
      height: Math.round(caixa.h + folga * 2),
    },
    {
      nome: 'sem área',
      strokes: mover(naFolha, caixa.minX - folga, caixa.minY - folga),
      width: 0,
      height: 0,
    },
    {
      nome: 'zona',
      strokes: mover(naFolha, area.x, area.y),
      width: Math.max(1, Math.round(area.width)),
      height: Math.max(1, Math.round(area.height)),
    },
  ]

  const resumo = `${naFolha.length} traço(s), ${pontos} pontos, letra ${Math.round(
    caixa.w,
  )}×${Math.round(caixa.h)}`

  for (const tentativa of tentativas) {
    const resposta = await InkRecognition.recognize({
      strokes: tentativa.strokes,
      width: tentativa.width,
      height: tentativa.height,
      // Sempre uma string: ver o comentário de `RecognizePayload`.
      preContext: preContext ?? '',
    })
    const texto = (resposta.text ?? '').trim()
    if (texto) return { text: texto, diagnostico: `${resumo} · lido como ${tentativa.nome}` }
  }

  return { text: '', diagnostico: `${resumo} · nada nas 3 tentativas` }
}

/** Desloca a tinta pra origem da área que vai ser descrita ao reconhecedor. */
function mover(
  strokes: { x: number; y: number; t: number }[][],
  dx: number,
  dy: number,
): { x: number; y: number; t: number }[][] {
  return strokes.map((pontos) => pontos.map((p) => ({ x: p.x - dx, y: p.y - dy, t: p.t })))
}

function boundingBox(strokes: { x: number; y: number }[][]): {
  minX: number
  minY: number
  w: number
  h: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pontos of strokes) {
    for (const p of pontos) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, w: 0, h: 0 }
  return { minX, minY, w: maxX - minX, h: maxY - minY }
}

/** Esquece o estado de preparo — usado quando o usuário manda tentar de novo. */
export function resetRecognizer(): void {
  ready = null
}
