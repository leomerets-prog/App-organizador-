import {
  INITIAL_VIEW,
  MARGEM_TOPO,
  ZOOM_FIT,
  ZOOM_MAX,
  ZOOM_MIN,
  clampView,
  clampZoom,
  computeMetrics,
  resetZoom,
  screenToPage,
  stepZoom,
  zoomAtPoint,
} from '../src/ink/viewport'
import type { Layout, ViewState } from '../src/ink/viewport'

/**
 * A janela sobre a folha: zoom, rolagem e o caminho tela → folha.
 *
 * É a conta que decide ONDE a tinta cai. Errar aqui não dá erro nenhum: a
 * caneta encosta num lugar e o traço nasce noutro — deslocado, ou, com um NaN
 * no meio, em lugar nenhum. Por isso os casos conferem a posição de verdade,
 * não só que "alguma coisa" foi devolvida.
 */

interface Caso {
  nome: string
  rodar: () => string | null
}

/** Folha alta e larga: ocupa a tela toda na largura, e rola na vertical. */
const ALTA: Layout = { fitScale: 1, pageWidth: 1000, pageHeight: 3000, viewWidth: 1000, viewHeight: 800 }

/** Folha estreita numa tela larga: sobra espaço dos lados, e a folha é centralizada. */
const ESTREITA: Layout = { fitScale: 1, pageWidth: 600, pageHeight: 3000, viewWidth: 1000, viewHeight: 800 }

const view = (extra: Partial<ViewState> = {}): ViewState => ({ ...INITIAL_VIEW, ...extra })

const perto = (a: number, b: number) => Math.abs(a - b) < 1e-6

const casos: Caso[] = [
  // ── O zoom ────────────────────────────────────────────────────────────────
  {
    nome: 'zoom não passa dos limites, nem pra mais nem pra menos',
    rodar() {
      if (clampZoom(50) !== ZOOM_MAX) return `50 virou ${clampZoom(50)}`
      if (clampZoom(0.01) !== ZOOM_MIN) return `0,01 virou ${clampZoom(0.01)}`
      if (clampZoom(-2) !== ZOOM_MIN) return `-2 virou ${clampZoom(-2)}`
      return clampZoom(2.5) === 2.5 ? null : `2,5 virou ${clampZoom(2.5)}`
    },
  },
  {
    nome: 'zoom que não é número volta pra folha inteira, não contamina a tela',
    rodar() {
      for (const lixo of [NaN, Infinity, -Infinity]) {
        const z = clampZoom(lixo)
        if (z !== ZOOM_FIT) return `${lixo} virou ${z}, esperava ${ZOOM_FIT}`
      }
      const m = computeMetrics(view({ zoom: NaN }), ALTA)
      return Number.isFinite(m.scale) && m.scale > 0 ? null : `escala ficou ${m.scale}`
    },
  },
  {
    nome: 'escala nunca vira zero, mesmo com a área da folha medindo zero',
    rodar() {
      const m = computeMetrics(view(), { ...ALTA, fitScale: 0 })
      return Number.isFinite(m.scale) && m.scale > 0 ? null : `escala ficou ${m.scale}`
    },
  },

  // ── A rolagem ─────────────────────────────────────────────────────────────
  {
    nome: 'dá pra subir até a margem acima da folha, e não além',
    rodar() {
      // A margem existe pra a primeira zona não nascer colada no topo da tela.
      const alem = computeMetrics(view({ scrollY: -500 }), ALTA).scrollY
      if (alem !== -MARGEM_TOPO) return `subiu até ${alem}, o limite é ${-MARGEM_TOPO}`
      const dentro = computeMetrics(view({ scrollY: -10 }), ALTA).scrollY
      return dentro === -10 ? null : `a rolagem de -10 virou ${dentro}: a margem do topo não está sobrando`
    },
  },
  {
    nome: 'a rolagem pára no fim da folha, sem mostrar o vazio de baixo',
    rodar() {
      const m = computeMetrics(view({ scrollY: 99_999 }), ALTA)
      // 3000 de folha, 800 de tela na escala 1.
      if (m.maxScrollY !== 2200) return `o fim da rolagem ficou em ${m.maxScrollY}, esperava 2200`
      if (m.scrollY !== 2200) return `rolou até ${m.scrollY}, esperava 2200`
      // Com zoom, a tela mostra menos folha: dá pra rolar mais um tanto.
      const perto2 = computeMetrics(view({ zoom: 2, scrollY: 99_999 }), ALTA)
      return perto2.scrollY === 2600 ? null : `com zoom 2 rolou até ${perto2.scrollY}, esperava 2600`
    },
  },
  {
    nome: 'rolagem com NaN cai no começo, em vez de levar a tela pra lugar nenhum',
    rodar() {
      const m = computeMetrics(view({ scrollX: NaN, scrollY: NaN }), ALTA)
      if (m.scrollX !== 0) return `scrollX ficou ${m.scrollX}`
      if (m.scrollY !== -MARGEM_TOPO) return `scrollY ficou ${m.scrollY}`
      const preso = clampView(view({ scrollX: NaN, scrollY: Infinity }), ALTA)
      return Number.isFinite(preso.scrollX) && Number.isFinite(preso.scrollY)
        ? null
        : `clampView devolveu ${preso.scrollX}, ${preso.scrollY}`
    },
  },
  {
    nome: 'folha mais estreita que a tela fica no CENTRO, não grudada na esquerda',
    rodar() {
      const m = computeMetrics(view(), ESTREITA)
      // Sobram 400 de tela: 200 de cada lado.
      if (m.offsetX !== 200) return `margem lateral de ${m.offsetX}, esperava 200`
      const cheia = computeMetrics(view(), ALTA)
      return cheia.offsetX === 0 ? null : `folha que ocupa a tela toda ganhou margem de ${cheia.offsetX}`
    },
  },

  // ── Onde a tinta cai ──────────────────────────────────────────────────────
  {
    nome: 'o toque cai na folha descontando a margem da folha centralizada',
    rodar() {
      const m = computeMetrics(view({ scrollY: 0 }), ESTREITA)
      // Dedo a 300px da borda da tela; a folha começa em 200: é o ponto 100 dela.
      const p = screenToPage(300, 50, m)
      if (!perto(p.x, 100)) return `o toque em x=300 caiu em ${p.x} da folha, esperava 100`
      return perto(p.y, 50) ? null : `y caiu em ${p.y}, esperava 50`
    },
  },
  {
    nome: 'rolada pra baixo, a tinta cai MAIS embaixo na folha, não mais em cima',
    rodar() {
      const m = computeMetrics(view({ scrollY: 500 }), ALTA)
      const p = screenToPage(100, 100, m)
      return perto(p.y, 600) ? null : `o toque em y=100 com a folha rolada 500 caiu em ${p.y}, esperava 600`
    },
  },
  {
    nome: 'com zoom, a tela cobre menos folha: o toque anda mais devagar na folha',
    rodar() {
      const m = computeMetrics(view({ zoom: 2, scrollX: 100, scrollY: 200 }), ALTA)
      const p = screenToPage(400, 300, m)
      if (!perto(p.x, 300)) return `x caiu em ${p.x}, esperava 100 + 400/2 = 300`
      return perto(p.y, 350) ? null : `y caiu em ${p.y}, esperava 200 + 300/2 = 350`
    },
  },

  // ── A pinça ───────────────────────────────────────────────────────────────
  {
    nome: 'a pinça mantém sob os dedos o mesmo ponto da folha',
    rodar() {
      // O que está entre os dedos não pode escorregar enquanto se aproxima.
      const cenas: [ViewState, { x: number; y: number }, number][] = [
        [view({ zoom: 1, scrollX: 0, scrollY: 400 }), { x: 500, y: 300 }, 2],
        [view({ zoom: 1.5, scrollX: 120, scrollY: 900 }), { x: 250, y: 600 }, 3],
        [view({ zoom: 3, scrollX: 400, scrollY: 1500 }), { x: 300, y: 100 }, 1.5],
        [view({ zoom: 2, scrollX: 100, scrollY: 1000 }), { x: 100, y: 700 }, 1.2],
      ]
      for (const [v, ancora, alvo] of cenas) {
        const antes = screenToPage(ancora.x, ancora.y, computeMetrics(v, ALTA))
        const z = zoomAtPoint(v, ALTA, ancora, alvo)
        const depois = screenToPage(ancora.x, ancora.y, computeMetrics(z, ALTA))
        if (!perto(antes.x, depois.x) || !perto(antes.y, depois.y)) {
          return `zoom ${v.zoom} → ${alvo}: o ponto sob o dedo foi de (${antes.x}, ${antes.y}) pra (${depois.x}, ${depois.y})`
        }
      }
      return null
    },
  },
  {
    nome: 'aproximar com o dedo no alto da folha não faz a tela pular pra baixo',
    rodar() {
      // Mesma conta, vista pela rolagem: dedo em y=100, folha rolada 1000,
      // zoom 1 → 2. O ponto da folha sob o dedo é 1100; depois do zoom a
      // janela sobe pra 1100 - 100/2 = 1050.
      const z = zoomAtPoint(view({ scrollY: 1000 }), ALTA, { x: 0, y: 100 }, 2)
      return perto(z.scrollY, 1050) ? null : `scrollY foi pra ${z.scrollY}, esperava 1050`
    },
  },
  {
    nome: 'aproximar numa folha estreita centralizada não faz a folha pular de lado',
    rodar() {
      const z = zoomAtPoint(view({ scrollY: 500 }), ESTREITA, { x: 500, y: 400 }, 1.5)
      const m = computeMetrics(z, ESTREITA)
      // Nesta largura a folha ainda cabe inteira (600 × 1,5 = 900 < 1000): fica
      // centralizada e sem rolagem lateral.
      if (z.scrollX !== 0) return `scrollX foi pra ${z.scrollX}`
      return m.offsetX === 50 ? null : `margem lateral de ${m.offsetX}, esperava 50`
    },
  },
  {
    nome: 'aproximar numa folha estreita mantém o ponto sob o dedo, na vertical',
    rodar() {
      const v = view({ scrollY: 500 })
      const antes = screenToPage(500, 400, computeMetrics(v, ESTREITA))
      const z = zoomAtPoint(v, ESTREITA, { x: 500, y: 400 }, 1.5)
      const depois = screenToPage(500, 400, computeMetrics(z, ESTREITA))
      return perto(antes.y, depois.y) && perto(antes.x, depois.x)
        ? null
        : `o ponto foi de (${antes.x}, ${antes.y}) pra (${depois.x}, ${depois.y})`
    },
  },
  {
    nome: 'os botões de zoom respeitam os limites e o reset volta à folha inteira',
    rodar() {
      let v = view()
      for (let i = 0; i < 30; i++) v = stepZoom(v, ALTA, 1.25)
      if (v.zoom !== ZOOM_MAX) return `aproximar sem parar parou em ${v.zoom}`
      for (let i = 0; i < 60; i++) v = stepZoom(v, ALTA, 1 / 1.25)
      if (v.zoom !== ZOOM_MIN) return `afastar sem parar parou em ${v.zoom}`
      const r = resetZoom(v, ALTA)
      return r.zoom === ZOOM_FIT && r.scrollX === 0 ? null : `o reset deixou zoom ${r.zoom}, scrollX ${r.scrollX}`
    },
  },
]

console.log('\n  Janela sobre a folha — onde a tinta cai\n')
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
