/**
 * Verificação dos limiares do gesto de rabisco.
 *
 * Roda com: npm run test:scribble
 *
 * O que importa aqui não é cobertura: é a fronteira entre "rabisquei pra apagar"
 * e "escrevi normalmente". Errar pro lado de apagar escrita é o pior defeito
 * possível neste app, então os casos de escrita são tão importantes quanto os
 * de rabisco.
 */

import type { InkPoint } from '../src/domain/types'
import { analyzeScribble, describeAnalysis } from '../src/ink/scribble'

type Case = { name: string; points: InkPoint[]; expected: boolean }

function pt(x: number, y: number, i: number): InkPoint {
  return { x, y, p: 0.5, t: i * 8 }
}

/** N voltas fechadas, como quem rabisca por cima de uma palavra. */
function circles(count: number, radius = 26, spread = 18): InkPoint[] {
  const points: InkPoint[] = []
  const steps = 26
  let i = 0
  for (let c = 0; c < count; c++) {
    const cx = 60 + c * spread
    for (let s = 0; s <= steps; s++) {
      const angle = (s / steps) * Math.PI * 2
      points.push(pt(cx + Math.cos(angle) * radius, 80 + Math.sin(angle) * radius, i++))
    }
  }
  return points
}

/** Vaivém horizontal — o outro jeito natural de rabiscar. */
function zigzag(sweeps: number, width = 90, height = 22): InkPoint[] {
  const points: InkPoint[] = []
  let i = 0
  for (let s = 0; s < sweeps; s++) {
    const goingRight = s % 2 === 0
    for (let k = 0; k <= 12; k++) {
      const f = k / 12
      const x = 40 + (goingRight ? f : 1 - f) * width
      const y = 80 + (s / sweeps) * height
      points.push(pt(x, y, i++))
    }
  }
  return points
}

/** Uma palavra cursiva: sobe e desce, mas avança pela linha. */
function cursiveWord(letters = 6): InkPoint[] {
  const points: InkPoint[] = []
  let i = 0
  for (let l = 0; l < letters; l++) {
    for (let s = 0; s <= 14; s++) {
      const f = s / 14
      const x = 40 + l * 26 + f * 26
      const y = 80 - Math.sin(f * Math.PI) * 22
      points.push(pt(x, y, i++))
    }
  }
  return points
}

/** Uma linha reta — sublinhado, seta, divisória. */
function straightLine(): InkPoint[] {
  const points: InkPoint[] = []
  for (let i = 0; i <= 40; i++) points.push(pt(30 + i * 8, 100, i))
  return points
}

/** A letra "e" cursiva, que tem um laço legítimo. */
function singleLoop(): InkPoint[] {
  const points: InkPoint[] = []
  let i = 0
  for (let s = 0; s <= 30; s++) {
    const angle = (s / 30) * Math.PI * 2.2
    points.push(pt(60 + Math.cos(angle) * 18 + s * 0.8, 80 + Math.sin(angle) * 18, i++))
  }
  return points
}

/** Um toque rápido: pingo do i, ponto final. */
function dot(): InkPoint[] {
  return [pt(50, 50, 0), pt(51, 51, 1), pt(50.5, 51.5, 2)]
}

const CASES: Case[] = [
  { name: '3 círculos (o gesto pedido)', points: circles(3), expected: true },
  { name: '4 círculos', points: circles(4), expected: true },
  { name: '5 círculos apertados', points: circles(5, 18, 10), expected: true },
  { name: 'vaivém 6 passadas', points: zigzag(6), expected: true },
  { name: 'vaivém 8 passadas', points: zigzag(8), expected: true },

  { name: 'palavra cursiva', points: cursiveWord(), expected: false },
  { name: 'palavra cursiva longa', points: cursiveWord(10), expected: false },
  { name: 'linha reta', points: straightLine(), expected: false },
  { name: 'laço único (letra e)', points: singleLoop(), expected: false },
  { name: 'toque / pingo', points: dot(), expected: false },
  { name: '1 círculo (circular algo)', points: circles(1), expected: false },
  { name: '2 círculos', points: circles(2), expected: false },
]

let failures = 0

console.log('\n  Gesto de rabisco — fronteira apagar vs escrever\n')

for (const testCase of CASES) {
  const analysis = analyzeScribble(testCase.points)
  const ok = analysis.isScribble === testCase.expected
  if (!ok) failures++
  const mark = ok ? '[32m✓[0m' : '[31m✗[0m'
  const want = testCase.expected ? 'apaga' : 'escreve'
  console.log(`  ${mark} ${testCase.name.padEnd(30)} espera ${want.padEnd(8)} ${describeAnalysis(analysis)}`)
}

console.log('')
if (failures > 0) {
  console.error(`  ${failures} caso(s) fora do esperado\n`)
  process.exit(1)
}
console.log('  todos os casos passaram\n')
