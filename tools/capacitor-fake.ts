/**
 * O Android de mentira, pros testes que precisam do caminho "dentro do app".
 *
 * Tem que ser o PRIMEIRO import do teste: o `@capacitor/core` decide em que
 * aparelho está no instante em que é carregado, olhando o que já existe no
 * global. Aqui o global diz "isto é o Android" e entrega o plugin FileSaver já
 * registrado — com a mesma forma que a ponte de verdade entrega (cabeçalho de
 * métodos + `nativePromise`), e sem mexer em nada do código do app.
 *
 * Também faz o papel do `FileReader`, que o Node não tem.
 */

export interface ChamadaFileSaver {
  metodo: 'abrir' | 'escrever' | 'fechar' | 'cancelar'
  opcoes: Record<string, unknown>
}

/** O que o lado Android viu, e o jeito de fazê-lo falhar no meio. */
export const fileSaver = {
  chamadas: [] as ChamadaFileSaver[],
  /** Os pedaços recebidos (já decodificados) de cada `escrever`. */
  escritos: [] as Uint8Array[],
  /** Faz o N-ésimo `escrever` (a partir de 1) falhar. */
  falharNoEscrever: 0,
  /** Faz o `fechar` falhar. */
  falharNoFechar: false,
  /** Faz o `cancelar` falhar também. */
  falharNoCancelar: false,
  zerar() {
    this.chamadas = []
    this.escritos = []
    this.falharNoEscrever = 0
    this.falharNoFechar = false
    this.falharNoCancelar = false
  },
}

const metodos = ['abrir', 'escrever', 'fechar', 'cancelar'] as const

async function nativePromise(plugin: string, metodo: string, opcoes: Record<string, unknown>) {
  if (plugin !== 'FileSaver') throw new Error(`plugin inesperado: ${plugin}`)
  fileSaver.chamadas.push({ metodo: metodo as ChamadaFileSaver['metodo'], opcoes })
  if (metodo === 'abrir') return { token: 'tk-1' }
  if (metodo === 'escrever') {
    const n = fileSaver.chamadas.filter((c) => c.metodo === 'escrever').length
    if (fileSaver.falharNoEscrever === n) throw new Error('disco cheio')
    fileSaver.escritos.push(new Uint8Array(Buffer.from(String(opcoes.base64), 'base64')))
    return
  }
  if (metodo === 'fechar') {
    if (fileSaver.falharNoFechar) throw new Error('não deu pra fechar')
    return { onde: 'a pasta Downloads' }
  }
  if (fileSaver.falharNoCancelar) throw new Error('nem cancelar deu')
}

const g = globalThis as Record<string, unknown>
g.androidBridge = {}
g.Capacitor = {
  PluginHeaders: [{ name: 'FileSaver', methods: metodos.map((name) => ({ name, rtype: 'promise' })) }],
  nativePromise,
}

/** O suficiente do FileReader pra `readAsDataURL`, que é só o que o app usa. */
class FileReaderDeMentira {
  result: string | null = null
  error: Error | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsDataURL(blob: Blob) {
    blob
      .arrayBuffer()
      .then((buf) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`
        this.onload?.()
      })
      .catch((e) => {
        this.error = e
        this.onerror?.()
      })
  }
}
g.FileReader = FileReaderDeMentira
