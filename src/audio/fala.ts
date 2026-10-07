import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * TRANSCREVER A GRAVAÇÃO — a ponte com `SpeechPlugin.java`.
 *
 * Isto nasceu como sonda: uma pergunta que precisava ser respondida ANTES de
 * valer a pena construir, porque a resposta dependia do aparelho e não do
 * código. A sonda rodou no tablet dele e respondeu **sim** — Android 16,
 * reconhecedor de aparelho, sem internet, 60 segundos de reunião transcritos
 * com texto legível. O caminho que funcionou foi o de SESSÃO SEGMENTADA: sem
 * ele o reconhecedor encerra no primeiro silêncio, e reunião é feita de
 * silêncios.
 *
 * Com a resposta na mão, três coisas mudaram:
 *
 * 1. **a gravação inteira**, não o primeiro minuto — o corte era da sonda
 * 2. **as palavras do caderno** vão junto como dica (ver `dicas.ts`): é o que
 *    ataca o "ele trocou palavras", porque o que o reconhecedor erra é nome
 *    próprio, e nome próprio já está escrito na folha
 * 3. **o texto chega aos pedaços**, enquanto roda — uma reunião longa leva
 *    minutos, e tela parada é indistinguível de tela travada
 *
 * O que ele devolve é um RASCUNHO. Reconhecedor de aparelho erra, e vai
 * continuar errando; o texto serve pra achar o assunto e corrigir por cima,
 * não pra virar ata sem ninguém ler.
 */

export interface EstadoDaFala {
  ok: boolean
  /** Versão do Android, em número de API. */
  android?: number
  temReconhecedor?: boolean
  temOffline?: boolean
  aceitaArquivo?: boolean
  erro?: string
}

export interface ResultadoDaFala {
  ok: boolean
  /** Em que parte parou: `decodificar` ou `reconhecer`. */
  etapa?: string
  texto?: string
  /** Quantos segundos de áudio chegaram ao reconhecedor. */
  segundos?: number
  codigo?: number
  erro?: string
  /**
   * O maior valor de onda que chegou ao reconhecedor, de 0 a 32767.
   *
   * É o número que separa "decodifiquei certo" de "decodifiquei lixo": áudio
   * de fala tem picos aos milhares. Perto de zero quer dizer que o
   * reconhecedor recebeu silêncio, por mais segundos que tenham passado.
   */
  pico?: number
  /** Em que formato o decodificador devolveu o áudio. */
  codificacao?: string
  /** Que avisos o reconhecedor deu, na ordem. Vazio = ele nem acordou. */
  trilha?: string
  /** Quantas palavras do caderno foram entregues como dica. */
  dicas?: number
  /**
   * A fala partida nos cortes pedidos — sempre `cortes + 1` pedaços, na ordem.
   *
   * É a contagem fixa que deixa casar cada pedaço com a marca que o abriu
   * (`ata/trechos.ts`). Os tempos já vêm no ponto de silêncio onde o plugin
   * cortou, que pode estar até 1,5 s longe da marca.
   */
  trechos?: { inicioMs: number; fimMs: number; texto: string }[]
}

/** O que o plugin manda enquanto trabalha, a cada pedaço reconhecido. */
export interface AndamentoDaFala {
  /** Tudo que já foi entendido, de todos os tópicos até aqui. */
  texto: string
  /** Em que tópico está (1, 2, …) e quantos são. */
  topico?: number
  topicos?: number
}

interface SpeechPlugin {
  estado(): Promise<EstadoDaFala>
  abrir(): Promise<{ token: string }>
  escrever(options: { token: string; base64: string }): Promise<void>
  transcrever(options: {
    token: string
    idioma: string
    /** Até onde ler. Ausente ou zero = a gravação inteira. */
    limiteSegundos?: number
    /** As palavras do caderno, pra puxar o reconhecedor (Android 13+). */
    palavras?: string[]
    /** Onde partir o áudio (ms), um corte por marca — ver `ata/trechos.ts`. */
    cortes?: number[]
  }): Promise<ResultadoDaFala>
  addListener(
    evento: 'andamento',
    ouvinte: (dados: AndamentoDaFala) => void,
  ): Promise<{ remove: () => Promise<void> }>
}

const Speech = registerPlugin<SpeechPlugin>('Speech')

/** Pedaço de 192KB, o mesmo do salvar: a ponte carrega texto, não arquivos. */
const PEDACO = 192 * 1024

export function sondaPossivel(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Speech')
}

export async function estadoDaFala(): Promise<EstadoDaFala> {
  if (!sondaPossivel()) {
    return {
      ok: false,
      erro: 'Esta parte só existe no aplicativo do tablet — no navegador não há reconhecedor de fala do Android.',
    }
  }
  try {
    return await Speech.estado()
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}

export interface PedidoDeTranscricao {
  /** Conta o que está acontecendo: envio, decodificação, reconhecimento. */
  aviso: (mensagem: string) => void
  /**
   * Entrega o texto que já saiu, antes do fim.
   *
   * Sem isto, uma reunião de meia hora é meia hora de tela parada — e tela
   * parada é a única coisa que ele já relatou como "travou".
   */
  aoVivo?: (parcial: AndamentoDaFala) => void
  /** As palavras do caderno, de `palavrasDeDica`. */
  palavras?: string[]
  /** Até onde ler, em segundos. Ausente = a gravação inteira. */
  limiteSegundos?: number
  /**
   * Onde partir o áudio, em ms, em ordem crescente — um corte por marca.
   *
   * Cada pedaço é ouvido numa sessão própria, e é isso que dá a cada tópico
   * da ata a sua fala. Sem cortes, a gravação é ouvida inteira de uma vez.
   */
  cortes?: number[]
  idioma?: string
}

/**
 * Manda a gravação ao aparelho e transcreve.
 *
 * O envio é em pedaços porque a ponte do Capacitor carrega texto: uma gravação
 * de uma hora em base64 numa chamada só derruba a WebView por falta de
 * memória.
 */
export async function tentarTranscrever(
  blob: Blob,
  pedido: PedidoDeTranscricao,
): Promise<ResultadoDaFala> {
  if (!sondaPossivel()) {
    return {
      ok: false,
      erro: 'Esta parte só existe no aplicativo do tablet.',
    }
  }

  const { aviso, aoVivo, palavras, limiteSegundos, cortes, idioma = 'pt-BR' } = pedido

  /*
   * O ouvinte é registrado ANTES de `transcrever`, e tirado no `finally`.
   *
   * Registrado depois, os primeiros trechos passariam sem ninguém ouvindo —
   * e são justamente os que provam que está andando. Não tirado, cada
   * transcrição deixaria um ouvinte pra trás e a quinta escreveria na tela
   * cinco vezes.
   */
  let ouvinte: { remove: () => Promise<void> } | null = null
  if (aoVivo) {
    try {
      ouvinte = await Speech.addListener('andamento', aoVivo)
    } catch {
      // Contar o andamento é cortesia; sem ele a transcrição continua.
    }
  }

  try {
    const { token } = await Speech.abrir()
    const pedacos = Math.ceil(blob.size / PEDACO)
    for (let i = 0; i < pedacos; i++) {
      const parte = blob.slice(i * PEDACO, Math.min((i + 1) * PEDACO, blob.size))
      await Speech.escrever({ token, base64: await paraBase64(parte) })
      aviso(`Mandando a gravação… ${i + 1} de ${pedacos}`)
    }
    const porTopico = cortes && cortes.length > 0 ? `, tópico por tópico (${cortes.length + 1} pedaços)` : ''
    aviso(
      palavras && palavras.length > 0
        ? `Ouvindo${porTopico}, com ${palavras.length} palavra(s) do seu caderno como dica…`
        : `Ouvindo a gravação${porTopico}…`,
    )
    return await Speech.transcrever({ token, idioma, limiteSegundos, palavras, cortes })
  } finally {
    if (ouvinte) {
      try {
        await ouvinte.remove()
      } catch {
        // Soltar é cortesia.
      }
    }
  }
}

/** O mesmo caminho do salvar: o FileReader devolve `data:...;base64,XXXX`. */
async function paraBase64(parte: Blob): Promise<string> {
  const texto: string = await new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(String(leitor.result))
    leitor.onerror = () => reject(new Error('Não consegui ler o pedaço da gravação.'))
    leitor.readAsDataURL(parte)
  })
  const virgula = texto.indexOf(',')
  return virgula >= 0 ? texto.slice(virgula + 1) : texto
}
