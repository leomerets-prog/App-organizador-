/**
 * Verificação da borracha de ponta.
 *
 * Roda com: npm run test:erase
 *
 * O que importa: a borracha tem que tirar exatamente o pedaço por onde passou
 * e deixar o resto de pé. Apagar demais come escrita boa; apagar de menos
 * deixa restos que o usuário vai ter que caçar.
 */

import type { Stroke } from '../src/domain/types'
import { boundsOf } from '../src/lib/geometry'
import { countFragments, eraseAlongSegment } from '../src/ink/erase'

let contador = 0
const makeId = () => `f${++contador}`

/** Um traço reto de (x0,y) até (x1,y), com um ponto a cada 2px. */
function linha(x0: number, x1: number, y: number): Stroke {
  const points = []
  for (let x = x0; x <= x1; x += 2) points.push({ x, y, p: 0.5, t: (x - x0) * 4 })
  return {
    id: 'orig',
    pageId: 'pg',
    points,
    color: 'ink',
    width: 3,
    tool: 'pen',
    zoneId: null,
    startedAt: 1000,
    bounds: boundsOf(points),
  }
}

const casos: { nome: string; rodar: () => string | null }[] = [
  {
    nome: 'passar no meio parte o traço em dois',
    rodar() {
      const r = eraseAlongSegment([linha(0, 200, 50)], { x: 100, y: 50 }, { x: 100, y: 50 }, 15, makeId)
      if (r.length !== 1) return `esperava 1 traço afetado, veio ${r.length}`
      if (r[0].fragments.length !== 2) return `esperava 2 pedaços, veio ${r[0].fragments.length}`
      const [a, b] = r[0].fragments
      if (a.bounds.maxX > 86) return `pedaço da esquerda invadiu o buraco: acaba em ${a.bounds.maxX}`
      if (b.bounds.minX < 114) return `pedaço da direita invadiu o buraco: começa em ${b.bounds.minX}`
      return null
    },
  },
  {
    nome: 'passar na ponta encurta, não parte',
    rodar() {
      const r = eraseAlongSegment([linha(0, 200, 50)], { x: 0, y: 50 }, { x: 0, y: 50 }, 20, makeId)
      if (r[0].fragments.length !== 1) return `esperava 1 pedaço, veio ${r[0].fragments.length}`
      if (r[0].fragments[0].bounds.minX < 20) return 'não encurtou a ponta'
      return null
    },
  },
  {
    nome: 'arrastar por cima do traço inteiro apaga tudo',
    rodar() {
      const r = eraseAlongSegment([linha(0, 200, 50)], { x: -10, y: 50 }, { x: 210, y: 50 }, 20, makeId)
      if (r[0].fragments.length !== 0) return `sobrou ${r[0].fragments.length} pedaço(s)`
      return null
    },
  },
  {
    nome: 'passar longe não mexe em nada',
    rodar() {
      const r = eraseAlongSegment([linha(0, 200, 50)], { x: 100, y: 400 }, { x: 120, y: 400 }, 15, makeId)
      return r.length === 0 ? null : 'mexeu num traço que não foi tocado'
    },
  },
  {
    nome: 'passada rápida em diagonal corta sem deixar buraco',
    rodar() {
      // A mão andou muito entre dois eventos: o corte tem que seguir o caminho,
      // não só os dois pontos das pontas.
      const r = eraseAlongSegment([linha(0, 200, 50)], { x: 40, y: 20 }, { x: 160, y: 80 }, 12, makeId)
      if (r.length !== 1) return 'não cortou'
      const total = countFragments(r)
      if (total !== 2) return `esperava 2 pedaços, veio ${total}`
      return null
    },
  },
  {
    nome: 'pedaço herda cor, espessura e instante do original',
    rodar() {
      const original = linha(0, 200, 50)
      const r = eraseAlongSegment([original], { x: 100, y: 50 }, { x: 100, y: 50 }, 15, makeId)
      const f = r[0].fragments[0]
      if (f.color !== original.color) return 'perdeu a cor'
      if (f.width !== original.width) return 'perdeu a espessura'
      if (f.startedAt !== original.startedAt) return 'perdeu o instante da escrita'
      if (f.id === original.id) return 'pedaço ficou com o id do original'
      return null
    },
  },
  {
    nome: 'sobra de um ponto só não vira pedaço',
    rodar() {
      // Corte a 3px da ponta: sobraria 1 ou 2 pontos, que na tela é um pingo.
      const r = eraseAlongSegment([linha(0, 200, 50)], { x: 3, y: 50 }, { x: 200, y: 50 }, 6, makeId)
      for (const f of r[0].fragments) {
        if (f.points.length < 2) return 'criou pedaço com menos de 2 pontos'
      }
      return null
    },
  },
  {
    nome: 'dois traços na mesma passada são cortados juntos',
    rodar() {
      const a = { ...linha(0, 200, 50), id: 'a' }
      const b = { ...linha(0, 200, 90), id: 'b' }
      const r = eraseAlongSegment([a, b], { x: 100, y: 30 }, { x: 100, y: 110 }, 15, makeId)
      if (r.length !== 2) return `esperava 2 traços afetados, veio ${r.length}`
      if (countFragments(r) !== 4) return `esperava 4 pedaços, veio ${countFragments(r)}`
      return null
    },
  },
  // ── O alcance, na medida (achado pela mutação) ────────────────────────────
  {
    nome: 'a borracha só alcança o raio dela, não o dobro',
    rodar() {
      // Diagonal comprida: a caixa do traço cobre o alcance da borracha, mas
      // nenhum ponto dele chega a menos de 21px do dedo (raio 15).
      const diagonal: Stroke = linha(0, 200, 0)
      const pontos = []
      for (let i = 0; i <= 200; i += 2) pontos.push({ x: i, y: i, p: 0.5, t: i * 4 })
      const traco = { ...diagonal, points: pontos, bounds: boundsOf(pontos) }
      const r = eraseAlongSegment([traco], { x: 100, y: 130 }, { x: 100, y: 130 }, 15, makeId)
      return r.length === 0 ? null : 'apagou tinta que estava além do raio'
    },
  },
  {
    nome: 'traço que a borracha não tocou não é trocado por uma cópia',
    rodar() {
      // Mesmo caso, visto pelo que importa: se o traço volta como "alterado",
      // ele ganha id novo, entra no voltar/avançar e perde a ligação com o áudio.
      const pontos = []
      for (let i = 0; i <= 200; i += 2) pontos.push({ x: i, y: i, p: 0.5, t: i * 4 })
      const traco = { ...linha(0, 200, 0), points: pontos, bounds: boundsOf(pontos) }
      const r = eraseAlongSegment([traco], { x: 100, y: 130 }, { x: 140, y: 170 }, 12, makeId)
      return r.length === 0 ? null : `devolveu ${r.length} traço(s) como alterados sem terem sido tocados`
    },
  },
  {
    nome: 'o que a borracha alcança a menos do raio conta, mesmo fora da caixa do movimento',
    rodar() {
      // Traço reto e baixo (a caixa dele tem altura zero) e uma borracha
      // parada 10px acima, com raio 15: a caixa do movimento sozinha não o
      // alcançaria, o raio sim.
      const r = eraseAlongSegment([linha(0, 200, 50)], { x: 100, y: 60 }, { x: 100, y: 60 }, 15, makeId)
      if (r.length !== 1) return `esperava 1 traço afetado, veio ${r.length}`
      return r[0].fragments.length === 2 ? null : `esperava 2 pedaços, veio ${r[0].fragments.length}`
    },
  },
  {
    nome: 'sobra de UM ponto só é pingo e some: não vira pedaço',
    rodar() {
      // Pontos a cada 2px: borracha em x=7 (raio 6) deixa só o ponto x=0.
      const r = eraseAlongSegment([linha(0, 200, 50)], { x: 7, y: 50 }, { x: 200, y: 50 }, 6, makeId)
      if (r.length !== 1) return `esperava 1 traço afetado, veio ${r.length}`
      return r[0].fragments.length === 0 ? null : `ficou ${r[0].fragments.length} pedaço(s) de ${r[0].fragments[0].points.length} ponto(s)`
    },
  },
  {
    nome: 'a borracha não apaga o que está só no prolongamento do movimento',
    rodar() {
      // Passada curta de cima pra baixo; o resto do traço continua na mesma reta,
      // bem mais embaixo. Tratar o movimento como reta infinita apagaria tudo.
      const pontos = []
      for (let y = 0; y <= 200; y += 2) pontos.push({ x: 100, y, p: 0.5, t: y * 4 })
      for (let x = 100; x <= 300; x += 2) pontos.push({ x, y: 200, p: 0.5, t: 800 + x })
      const traco = { ...linha(0, 200, 0), points: pontos, bounds: boundsOf(pontos) }
      const r = eraseAlongSegment([traco], { x: 100, y: 0 }, { x: 100, y: 10 }, 5, makeId)
      if (r.length !== 1) return `esperava 1 traço afetado, veio ${r.length}`
      const pedaco = r[0].fragments[0]
      if (!pedaco) return 'sumiu tudo'
      return pedaco.points.length > 100 ? null : `sobraram só ${pedaco.points.length} pontos: apagou longe do dedo`
    },
  },
]

console.log('\n  Borracha de ponta — corta só onde passou\n')
let falhas = 0
for (const caso of casos) {
  const erro = caso.rodar()
  if (erro) {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${caso.nome.padEnd(48)} ${erro}`)
  } else {
    console.log(`  \x1b[32m✓\x1b[0m ${caso.nome}`)
  }
}
console.log('')
if (falhas > 0) {
  console.error(`  ${falhas} caso(s) fora do esperado\n`)
  process.exit(1)
}
console.log('  todos os casos passaram\n')
