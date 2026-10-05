import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * TESTE: este tablet transcreve uma gravação?
 *
 * A ponte com a sonda nativa (`SpeechPlugin.java`). Não é um recurso — é a
 * pergunta que precisa ser respondida ANTES de valer a pena construir
 * transcrição de reunião, porque o resultado depende do aparelho e não do
 * código.
 *
 * O que a sonda tenta, em ordem, e onde cada coisa pode falhar:
 *
 * 1. **existe reconhecedor?** — aparelho sem serviço de fala para aqui
 * 2. **existe reconhecedor OFFLINE?** — do Android 13 pra cima; sem ele, a
 *    transcrição precisaria de internet, o que muda a conversa inteira
 * 3. **o Android aceita um ARQUIVO no lugar do microfone?** — do Android 12
 *    pra cima, e mesmo assim o serviço do aparelho pode recusar
 * 4. **dá pra decodificar a gravação?** — ela é webm/opus, e o reconhecedor
 *    só come áudio cru
 * 5. **e o que ele entendeu?** — o primeiro minuto, que é o que responde a
 *    pergunta sem precisar do picote de uma reunião inteira
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
}

interface SpeechPlugin {
  estado(): Promise<EstadoDaFala>
  abrir(): Promise<{ token: string }>
  escrever(options: { token: string; base64: string }): Promise<void>
  transcrever(options: { token: string; idioma: string }): Promise<ResultadoDaFala>
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

/**
 * Manda a gravação e tenta transcrever o começo dela.
 *
 * `aviso` conta o progresso do envio, porque mandar vinte megabytes em pedaços
 * leva tempo e uma tela parada sem explicação é a pior parte de qualquer
 * espera.
 */
export async function tentarTranscrever(
  blob: Blob,
  aviso: (mensagem: string) => void,
  idioma = 'pt-BR',
): Promise<ResultadoDaFala> {
  if (!sondaPossivel()) {
    return {
      ok: false,
      erro: 'Esta parte só existe no aplicativo do tablet.',
    }
  }

  const { token } = await Speech.abrir()
  const pedacos = Math.ceil(blob.size / PEDACO)
  for (let i = 0; i < pedacos; i++) {
    const parte = blob.slice(i * PEDACO, Math.min((i + 1) * PEDACO, blob.size))
    await Speech.escrever({ token, base64: await paraBase64(parte) })
    aviso(`Mandando a gravação… ${i + 1} de ${pedacos}`)
  }
  aviso('Decodificando e ouvindo… isto pode levar um minuto.')
  return await Speech.transcrever({ token, idioma })
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
