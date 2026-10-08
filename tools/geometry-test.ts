import { pathNearPoint, pointToSegment } from '../src/lib/geometry'

/**
 * A distância de um ponto a um traço.
 *
 * É a conta por trás da borracha e da seleção. O erro típico não derruba nada:
 * trata o segmento como uma RETA sem fim, e a borracha passa a apagar tinta
 * que está longe do dedo, só porque fica no prolongamento do movimento.
 */

interface Caso {
  nome: string
  rodar: () => string | null
}

const perto = (a: number, b: number) => Math.abs(a - b) < 1e-9

const casos: Caso[] = [
  {
    nome: 'ponto ao lado do segmento: a distância é a perpendicular',
    rodar() {
      const d = pointToSegment({ x: 50, y: 30 }, { x: 0, y: 0 }, { x: 100, y: 0 })
      return perto(d, 30) ? null : `deu ${d}, esperava 30`
    },
  },
  {
    nome: 'ponto depois do fim: conta até a PONTA, não até o prolongamento da reta',
    rodar() {
      const d = pointToSegment({ x: 300, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })
      return perto(d, 200) ? null : `deu ${d}, esperava 200 (a reta sem fim daria 0)`
    },
  },
  {
    nome: 'ponto antes do começo: conta até a PONTA de lá também',
    rodar() {
      const d = pointToSegment({ x: -40, y: 30 }, { x: 0, y: 0 }, { x: 100, y: 0 })
      return perto(d, 50) ? null : `deu ${d}, esperava 50`
    },
  },
  {
    nome: 'segmento em diagonal vale nos dois sentidos',
    rodar() {
      const a = { x: 0, y: 0 }
      const b = { x: 100, y: 100 }
      // Além da ponta b, sobre o prolongamento da diagonal.
      const alem = pointToSegment({ x: 200, y: 200 }, a, b)
      if (!perto(alem, Math.hypot(100, 100))) return `além da ponta deu ${alem}`
      const atras = pointToSegment({ x: -30, y: -30 }, a, b)
      return perto(atras, Math.hypot(30, 30)) ? null : `antes da ponta deu ${atras}`
    },
  },
  {
    nome: 'toque sem arrasto (segmento de comprimento zero) mede até o ponto, sem NaN',
    rodar() {
      const p = { x: 10, y: 10 }
      const d = pointToSegment({ x: 13, y: 14 }, p, p)
      return perto(d, 5) ? null : `deu ${d}, esperava 5`
    },
  },
  {
    nome: 'o prolongamento do traço não conta como perto: só o traço em si',
    rodar() {
      const traco = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]
      if (!pathNearPoint(traco, { x: 50, y: 8 }, 10)) return 'ponto a 8 de um alcance de 10 ficou de fora'
      if (pathNearPoint(traco, { x: 250, y: 0 }, 10)) return 'ponto a 150 da ponta foi dado como perto'
      return null
    },
  },
]

console.log('\n  Geometria — a distância que a borracha mede\n')
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
