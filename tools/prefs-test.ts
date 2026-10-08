import { ERASER_DEFAULT, ERASER_MAX, ERASER_MIN, INK_COLOR, PEN_WIDTH_DEFAULT } from '../src/domain/constants'
import { ZOOM_MAX, ZOOM_MIN } from '../src/ink/viewport'
import {
  AUDIO_RATES,
  formatRate,
  loadPrefs,
  nearestRate,
  nextRate,
  savePrefs,
} from '../src/state/prefs'

/**
 * As preferências que voltam do aparelho.
 *
 * O que vem do `localStorage` não é de confiança: outra versão do app, uma
 * edição à mão ou um armazenamento corrompido podem deixar qualquer coisa ali.
 * E o defeito não aparece como erro — aparece como uma folha invisível, um
 * áudio mudo, um app que abre numa folha que não existe. Os casos abaixo
 * cercam cada um desses.
 */

interface Caso {
  nome: string
  rodar: () => string | null
}

/** O armazenamento do aparelho, em memória: dá pra guardar o que quiser, até lixo. */
const guardado = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => void guardado.set(k, v),
    removeItem: (k: string) => void guardado.delete(k),
  },
})

const CHAVE = 'organizador.prefs.v1'

/** O que o app encontra ao abrir, com `salvo` escrito ali por quem for. */
function abrirCom(salvo: unknown) {
  guardado.set(CHAVE, JSON.stringify(salvo))
  return loadPrefs()
}

const casos: Caso[] = [
  // ── A velocidade do áudio ─────────────────────────────────────────────────
  {
    nome: 'velocidade guardada se encaixa na mais PRÓXIMA da lista',
    rodar() {
      const pares: [number, number][] = [
        [1.4, 1.5],
        [1.62, 1.5],
        [1.9, 2],
        [1.1, 1],
        [1.2, 1.25],
        [1.25, 1.25],
      ]
      for (const [guardada, esperada] of pares) {
        const veio = nearestRate(guardada)
        if (veio !== esperada) return `${guardada} virou ${veio}, esperava ${esperada}`
      }
      return null
    },
  },
  {
    nome: 'velocidade fora da faixa fica na ponta, não passa de 2x nem some',
    rodar() {
      if (nearestRate(8) !== 2) return `8 virou ${nearestRate(8)}`
      if (nearestRate(0.3) !== 1) return `0,3 virou ${nearestRate(0.3)}`
      if (nearestRate(-4) !== 1) return `-4 virou ${nearestRate(-4)}`
      return null
    },
  },
  {
    nome: 'velocidade que não é número volta a 1x — inclusive texto que parece número',
    rodar() {
      // `playbackRate` com lixo dentro é áudio que não toca. Um "1.5" escrito
      // como texto também é lixo pra esta preferência: volta ao normal.
      const lixos: unknown[] = [NaN, Infinity, -Infinity, undefined, null, 'abc', '1.5', '2', [1.5], {}, true]
      for (const lixo of lixos) {
        const veio = nearestRate(lixo)
        if (veio !== 1) return `${JSON.stringify(lixo) ?? String(lixo)} virou ${veio}, esperava 1`
      }
      return null
    },
  },
  {
    nome: 'o botão de velocidade passa por todas e dá a volta, sem ficar undefined',
    rodar() {
      let atual: number = AUDIO_RATES[0]
      const visto: number[] = [atual]
      for (let i = 0; i < AUDIO_RATES.length; i++) {
        atual = nextRate(atual)
        visto.push(atual)
      }
      const esperado = [1, 1.25, 1.5, 1.75, 2, 1]
      return visto.join() === esperado.join() ? null : `passou por ${visto.join(' > ')}`
    },
  },
  {
    nome: 'o botão parte de onde o áudio está, mesmo com velocidade fora da lista',
    rodar() {
      // Guardado 1,4 (de outra versão): o próximo é o da lista depois do 1,5.
      const veio = nextRate(1.4)
      return veio === 1.75 ? null : `1,4 foi pra ${veio}, esperava 1,75`
    },
  },
  {
    nome: 'a velocidade aparece com vírgula, como se fala',
    rodar() {
      const pares: [number, string][] = [
        [1, '1x'],
        [1.25, '1,25x'],
        [1.5, '1,5x'],
        [2, '2x'],
      ]
      for (const [v, txt] of pares) {
        if (formatRate(v) !== txt) return `${v} saiu "${formatRate(v)}", esperava "${txt}"`
      }
      return null
    },
  },

  // ── O lugar onde o usuário parou ──────────────────────────────────────────
  {
    nome: 'o lugar onde ele parou volta inteiro',
    rodar() {
      const lugar = { notebookId: 'n1', sectionId: 's1', pageId: 'p1' }
      const p = abrirCom({ ultimoLugar: lugar })
      return JSON.stringify(p.ultimoLugar) === JSON.stringify(lugar) ? null : 'o lugar não voltou igual'
    },
  },
  {
    nome: 'lugar com um dos três ids faltando não leva a lugar nenhum',
    rodar() {
      // Abrir "numa folha inexistente" é o que acontece se qualquer um passar.
      const tortos: Record<string, unknown>[] = [
        { notebookId: 'n1', sectionId: 's1' },
        { notebookId: 'n1', sectionId: 's1', pageId: '' },
        { notebookId: 'n1', sectionId: 's1', pageId: 7 },
        { notebookId: '', sectionId: 's1', pageId: 'p1' },
        { sectionId: 's1', pageId: 'p1' },
        { notebookId: 'n1', pageId: 'p1' },
        { notebookId: 'n1', sectionId: null, pageId: 'p1' },
      ]
      for (const torto of tortos) {
        const p = abrirCom({ ultimoLugar: torto })
        if (p.ultimoLugar !== undefined) return `aceitou o lugar ${JSON.stringify(torto)}`
      }
      return null
    },
  },
  {
    nome: 'lugar que não é um objeto é ignorado',
    rodar() {
      for (const lixo of ['n1/s1/p1', 12, true, []]) {
        const p = abrirCom({ ultimoLugar: lixo })
        if (p.ultimoLugar !== undefined) return `aceitou ${JSON.stringify(lixo)} como lugar`
      }
      return null
    },
  },

  // ── Zoom e borracha ───────────────────────────────────────────────────────
  {
    nome: 'zoom guardado fora de [0,4 ; 5] é preso na faixa, e a folha não some',
    rodar() {
      const alto = abrirCom({ zoom: 100 }).zoom
      if (alto !== ZOOM_MAX) return `zoom 100 voltou ${alto}, esperava ${ZOOM_MAX}`
      const baixo = abrirCom({ zoom: 0.01 }).zoom
      if (baixo !== ZOOM_MIN) return `zoom 0,01 voltou ${baixo}, esperava ${ZOOM_MIN}`
      const negativo = abrirCom({ zoom: -3 }).zoom
      if (negativo !== ZOOM_MIN) return `zoom -3 voltou ${negativo}, esperava ${ZOOM_MIN}`
      return abrirCom({ zoom: 2 }).zoom === 2 ? null : 'zoom dentro da faixa foi alterado'
    },
  },
  {
    nome: 'raio da borracha guardado fora dos limites é preso neles',
    rodar() {
      const enorme = abrirCom({ eraserSize: 9999 }).eraserSize
      if (enorme !== ERASER_MAX) return `raio 9999 voltou ${enorme}, esperava ${ERASER_MAX}`
      const zero = abrirCom({ eraserSize: 0 }).eraserSize
      if (zero !== ERASER_MIN) return `raio 0 voltou ${zero}, esperava ${ERASER_MIN}`
      const negativo = abrirCom({ eraserSize: -20 }).eraserSize
      if (negativo !== ERASER_MIN) return `raio -20 voltou ${negativo}, esperava ${ERASER_MIN}`
      return abrirCom({ eraserSize: 36 }).eraserSize === 36 ? null : 'raio dentro da faixa foi alterado'
    },
  },

  // ── O resto: o que não é de confiança cai no padrão ───────────────────────
  {
    nome: 'velocidade de áudio lida do aparelho passa pelo encaixe',
    rodar() {
      const p = abrirCom({ audioRate: 1.4 })
      if (p.audioRate !== 1.5) return `1,4 voltou ${p.audioRate}`
      return abrirCom({ audioRate: 'rápido' }).audioRate === 1 ? null : 'texto virou velocidade'
    },
  },
  {
    nome: 'o que o usuário escolheu volta igual depois de salvar',
    rodar() {
      const antes = {
        ...loadPrefs(),
        theme: 'light' as const,
        penColor: '#d33',
        penWidth: 4,
        showZones: false,
        autoFields: false,
        showText: false,
        zoom: 1.5,
        eraserSize: 40,
        audioRate: 1.75,
        ultimoLugar: { notebookId: 'n', sectionId: 's', pageId: 'p' },
      }
      savePrefs(antes)
      const depois = loadPrefs()
      return JSON.stringify(depois) === JSON.stringify(antes) ? null : `voltou ${JSON.stringify(depois)}`
    },
  },
  {
    nome: 'campo de tipo errado cai no padrão, sem derrubar os outros',
    rodar() {
      const p = abrirCom({ theme: 'roxo', penColor: 5, penWidth: 'grosso', showZones: 'sim', zoom: null, eraserSize: '20' })
      if (p.theme !== 'dark') return `tema inválido virou ${p.theme}`
      if (p.penColor !== INK_COLOR) return `cor inválida virou ${p.penColor}`
      if (p.penWidth !== PEN_WIDTH_DEFAULT) return `espessura inválida virou ${p.penWidth}`
      if (p.showZones !== true) return 'zonas viraram ' + p.showZones
      if (p.zoom !== 1) return `zoom inválido virou ${p.zoom}`
      return p.eraserSize === ERASER_DEFAULT ? null : `raio inválido virou ${p.eraserSize}`
    },
  },
  {
    nome: 'armazenamento corrompido abre o app nos padrões em vez de quebrar',
    rodar() {
      guardado.set(CHAVE, '{isso não é json')
      const p = loadPrefs()
      if (p.audioRate !== 1 || p.eraserSize !== ERASER_DEFAULT) return 'não caiu nos padrões'
      guardado.delete(CHAVE)
      return loadPrefs().penWidth === PEN_WIDTH_DEFAULT ? null : 'sem nada guardado, não deu o padrão'
    },
  },
]

console.log('\n  Preferências — o que volta do aparelho não é de confiança\n')
let falhas = 0
for (const caso of casos) {
  let erro: string | null
  try {
    erro = caso.rodar()
  } catch (e) {
    erro = `estourou: ${e instanceof Error ? e.message : String(e)}`
  }
  if (erro) {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${caso.nome.padEnd(64)} ${erro}`)
  } else {
    console.log(`  \x1b[32m✓\x1b[0m ${caso.nome}`)
  }
}
console.log(falhas ? `\n  ${falhas} caso(s) fora do esperado\n` : '\n  todos os casos passaram\n')
process.exit(falhas ? 1 : 0)
