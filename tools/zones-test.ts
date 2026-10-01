/**
 * Verificação da edição de zonas.
 *
 * Roda com: npm run test:zones
 *
 * O que importa: a zona é a régua que diz o que a escrita significa. Se ela
 * escorregar, inverter do avesso ou sumir num canto inalcançável, o usuário
 * perde a régua no meio do trabalho — e o painel começa a mentir. Os casos
 * abaixo cercam as bordas: o limite da folha, o tamanho mínimo e a repetição
 * da divisão a cada folha.
 */

import type { Zone } from '../src/domain/types'
import {
  MIN_ZONE_H,
  MIN_ZONE_W,
  SHEET,
  SHEET_MAX,
  MAX_SHEETS,
  extendDown,
  boundaryAt,
  dragBoundary,
  dragZone,
  handleAt,
  pageToFrac,
  rectFromDrag,
  visibleSheets,
  zoneAtFrac,
  zoneBoundaries,
} from '../src/zones/edit'

const TOL = { x: 0.02, y: 0.02 }
const rect = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 }

function zona(id: string, r: { x: number; y: number; w: number; h: number }): Zone {
  return { id, pageId: 'pg', kind: 'tarefas', label: id, rect: r }
}

const casos: { nome: string; rodar: () => string | null }[] = [
  {
    nome: 'canto ganha da borda',
    rodar() {
      const h = handleAt(rect, { x: 0.2, y: 0.2 }, TOL)
      return h === 'nw' ? null : `esperava nw, veio ${h}`
    },
  },
  {
    nome: 'borda ganha do miolo',
    rodar() {
      const h = handleAt(rect, { x: 0.4, y: 0.2 }, TOL)
      return h === 'n' ? null : `esperava n, veio ${h}`
    },
  },
  {
    nome: 'miolo é mover',
    rodar() {
      const h = handleAt(rect, { x: 0.4, y: 0.3 }, TOL)
      return h === 'move' ? null : `esperava move, veio ${h}`
    },
  },
  {
    nome: 'fora da zona não pega nada',
    rodar() {
      const h = handleAt(rect, { x: 0.9, y: 0.9 }, TOL)
      return h === null ? null : `esperava nada, veio ${h}`
    },
  },
  {
    nome: 'mover encosta na borda sem encolher',
    rodar() {
      const r = dragZone(rect, 'move', -5, -5)
      if (r.x !== 0 || r.y !== 0) return `esperava no canto, veio ${r.x},${r.y}`
      if (r.w !== rect.w || r.h !== rect.h) return 'a zona mudou de tamanho ao ser empurrada'
      return null
    },
  },
  {
    nome: 'mover não passa do fim da folha',
    rodar() {
      const r = dragZone(rect, 'move', 5, 5)
      if (Math.abs(r.x + r.w - 1) > 1e-9) return 'saiu pela direita'
      if (Math.abs(r.y + r.h - 1) > 1e-9) return 'saiu por baixo'
      return null
    },
  },
  {
    nome: 'redimensionar respeita o tamanho mínimo',
    rodar() {
      const r = dragZone(rect, 'e', -5, 0)
      if (Math.abs(r.w - MIN_ZONE_W) > 1e-9) return `largura ${r.w}, esperava ${MIN_ZONE_W}`
      if (r.x !== rect.x) return 'a borda esquerda se mexeu num arrasto da direita'
      return null
    },
  },
  {
    nome: 'a borda de cima não atravessa a de baixo',
    rodar() {
      const r = dragZone(rect, 'n', 0, 5)
      if (r.h < MIN_ZONE_H - 1e-9) return `altura ${r.h}, menor que o mínimo`
      if (r.y + r.h > rect.y + rect.h + 1e-9) return 'a zona virou do avesso'
      return null
    },
  },
  {
    nome: 'canto redimensiona nos dois eixos',
    rodar() {
      const r = dragZone(rect, 'se', 0.1, 0.05)
      if (Math.abs(r.w - 0.5) > 1e-9) return `largura ${r.w}`
      if (Math.abs(r.h - 0.25) > 1e-9) return `altura ${r.h}`
      return null
    },
  },
  {
    nome: 'zona desenhada de baixo pra cima sai certa',
    rodar() {
      const r = rectFromDrag({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.2 })
      if (!r) return 'não criou a zona'
      if (Math.abs(r.x - 0.2) > 1e-9 || Math.abs(r.y - 0.2) > 1e-9) return 'canto errado'
      if (Math.abs(r.w - 0.4) > 1e-9 || Math.abs(r.h - 0.3) > 1e-9) return 'tamanho errado'
      return null
    },
  },
  {
    nome: 'risco curto não vira zona',
    rodar() {
      const r = rectFromDrag({ x: 0.2, y: 0.2 }, { x: 0.22, y: 0.21 })
      return r === null ? null : 'criou uma zona pequena demais pra usar'
    },
  },
  {
    nome: 'a divisão se repete a cada folha',
    rodar() {
      const a = pageToFrac({ x: 620, y: 400 })
      const b = pageToFrac({ x: 620, y: 400 + SHEET })
      if (Math.abs(a.y - b.y) > 1e-9) return 'a segunda folha caiu em outra altura'
      if (Math.abs(a.x - 0.5) > 1e-9) return `x ${a.x}, esperava 0.5`
      return null
    },
  },
  {
    nome: 'zona menor ganha quando elas se sobrepõem',
    rodar() {
      const grande = zona('grande', { x: 0, y: 0, w: 1, h: 1 })
      const pequena = zona('pequena', { x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
      const hit = zoneAtFrac([grande, pequena], { x: 0.15, y: 0.15 })
      return hit?.id === 'pequena' ? null : `pegou ${hit?.id ?? 'nada'}`
    },
  },
  // ─── Repetição da divisão folha a folha ──────────────────────────────────

  {
    nome: 'uma tela mostra uma ou duas folhas',
    rodar() {
      const r = visibleSheets(0, 1000)
      if (r.first !== 0 || r.last !== 0) return `veio ${r.first}..${r.last}`
      const duas = visibleSheets(1500, 2200)
      if (duas.first !== 0 || duas.last !== 1) return `veio ${duas.first}..${duas.last}`
      return null
    },
  },
  {
    nome: 'medida degenerada não vira desenho infinito',
    rodar() {
      // É o caso da escala mínima (folha medindo zero ao girar o tablet): a
      // altura visível explode e, sem teto, o desenho travaria o app.
      const r = visibleSheets(0, 7_770_000)
      if (r.last - r.first > MAX_SHEETS) return `${r.last - r.first} folhas de uma vez`
      return null
    },
  },
  {
    nome: 'medida inválida não desenha nada estranho',
    rodar() {
      const r = visibleSheets(NaN, Infinity)
      if (r.first !== 0 || r.last !== 0) return `veio ${r.first}..${r.last}`
      const invertido = visibleSheets(900, 100)
      if (invertido.last < invertido.first) return 'faixa invertida passou'
      return null
    },
  },

  // ─── Divisas: crescer a faixa sem trocar de ferramenta ───────────────────

  {
    nome: 'a divisa entre duas faixas é uma só',
    rodar() {
      const duvidas = zona('duvidas', { x: 0, y: 0, w: 1, h: 0.4 })
      const resto = zona('resto', { x: 0, y: 0.4, w: 1, h: 0.6 })
      const divisas = zoneBoundaries([duvidas, resto])
      if (divisas.length !== 1) return `esperava 1 divisa, veio ${divisas.length}`
      if (divisas[0].above[0] !== 'duvidas') return 'a faixa de cima saiu errada'
      if (divisas[0].below[0] !== 'resto') return 'a faixa de baixo saiu errada'
      return null
    },
  },
  {
    nome: 'topo e fim da folha não são divisas',
    rodar() {
      const unica = zona('tudo', { x: 0, y: 0, w: 1, h: 1 })
      const divisas = zoneBoundaries([unica])
      return divisas.length === 0 ? null : `criou ${divisas.length} divisa(s) sem vizinho`
    },
  },
  {
    nome: 'puxar a divisa dá espaço a uma tirando da outra',
    rodar() {
      const duvidas = zona('duvidas', { x: 0, y: 0, w: 1, h: 0.4 })
      const resto = zona('resto', { x: 0, y: 0.4, w: 1, h: 0.6 })
      const zonas = [duvidas, resto]
      const mudou = dragBoundary(zonas, zoneBoundaries(zonas)[0], 0.1)

      const cima = mudou.get('duvidas')
      const baixo = mudou.get('resto')
      if (!cima || !baixo) return 'alguma faixa ficou de fora'
      if (Math.abs(cima.h - 0.5) > 1e-9) return `a de cima ficou com ${cima.h}`
      if (Math.abs(baixo.y - 0.5) > 1e-9) return `a de baixo começa em ${baixo.y}`
      if (Math.abs(baixo.h - 0.5) > 1e-9) return `a de baixo ficou com ${baixo.h}`
      // Sem buraco e sem sobreposição entre elas: é o que segura a
      // classificação da escrita depois.
      if (Math.abs(cima.y + cima.h - baixo.y) > 1e-9) return 'abriu buraco entre as faixas'
      return null
    },
  },
  {
    nome: 'a divisa para antes de espremer a faixa de baixo',
    rodar() {
      const cima = zona('cima', { x: 0, y: 0, w: 1, h: 0.9 })
      const baixo = zona('baixo', { x: 0, y: 0.9, w: 1, h: 0.1 })
      const zonas = [cima, baixo]
      const mudou = dragBoundary(zonas, zoneBoundaries(zonas)[0], 0.5)
      const r = mudou.get('baixo')
      if (!r) return 'a faixa de baixo ficou de fora'
      if (r.h < MIN_ZONE_H - 1e-9) return `a de baixo ficou com ${r.h}, menor que o mínimo`
      return null
    },
  },
  {
    nome: 'a alça só pega perto da divisa',
    rodar() {
      const divisas = [
        { y: 0.4, above: ['a'], below: ['b'] },
        { y: 0.8, above: ['b'], below: ['c'] },
      ]
      if (boundaryAt(divisas, 0.41, 0.02)?.y !== 0.4) return 'não pegou a divisa de perto'
      if (boundaryAt(divisas, 0.6, 0.02) !== null) return 'pegou uma divisa longe demais'
      return null
    },
  },
  // ── Esticar a folha ───────────────────────────────────────────────────────
  {
    // Era ESTE o limite que o usuário encontrou: a faixa parava no fim da
    // folha porque a divisão se repete ali.
    nome: 'puxar a faixa além do fim da folha estica a folha',
    rodar() {
      const zonas = [
        zona('topo', { x: 0, y: 0, w: 1, h: 0.2 }),
        zona('meio', { x: 0, y: 0.2, w: 1, h: 0.5 }),
        zona('pe', { x: 0, y: 0.7, w: 1, h: 0.3 }),
      ]
      // Puxa o fim do "meio" (hoje em 0,7) pra 1,3 da folha atual.
      const r = extendDown(zonas, 'meio', SHEET, 1.3)
      if (!r) return 'não esticou nada'

      const cresceu = 1.3 * SHEET - 0.7 * SHEET
      if (Math.abs(r.sheet - (SHEET + cresceu)) > 1) {
        return `folha ficou ${Math.round(r.sheet)}, esperava ${Math.round(SHEET + cresceu)}`
      }
      const meio = r.rects.get('meio')!
      if (Math.abs(meio.h * r.sheet - (0.5 * SHEET + cresceu)) > 1) {
        return 'a faixa puxada não ficou com a altura nova'
      }
      return null
    },
  },
  {
    nome: 'as faixas de baixo descem junto, do mesmo tamanho',
    rodar() {
      const zonas = [
        zona('meio', { x: 0, y: 0.2, w: 1, h: 0.5 }),
        zona('pe', { x: 0, y: 0.7, w: 1, h: 0.3 }),
      ]
      const r = extendDown(zonas, 'meio', SHEET, 1.1)!
      const pe = r.rects.get('pe')!
      // Mesma altura em px, só que mais embaixo.
      if (Math.abs(pe.h * r.sheet - 0.3 * SHEET) > 1) return 'a faixa de baixo mudou de tamanho'
      if (!(pe.y * r.sheet > 0.7 * SHEET)) return 'a faixa de baixo não desceu'
      const meio = r.rects.get('meio')!
      if (Math.abs(pe.y - (meio.y + meio.h)) > 0.002) return 'sobrou buraco ou sobreposição'
      return null
    },
  },
  {
    nome: 'a faixa AO LADO não se mexe nem muda de tamanho',
    rodar() {
      const zonas = [
        zona('esq', { x: 0, y: 0.2, w: 0.6, h: 0.5 }),
        zona('dir', { x: 0.6, y: 0.2, w: 0.4, h: 0.5 }),
        zona('pe', { x: 0, y: 0.7, w: 1, h: 0.3 }),
      ]
      const r = extendDown(zonas, 'esq', SHEET, 1.0)!
      const dir = r.rects.get('dir')!
      if (Math.abs(dir.y * r.sheet - 0.2 * SHEET) > 1) return 'a vizinha de lado desceu'
      if (Math.abs(dir.h * r.sheet - 0.5 * SHEET) > 1) return 'a vizinha de lado mudou de altura'
      return null
    },
  },
  {
    nome: 'encolher não estica folha nenhuma',
    rodar() {
      const zonas = [zona('meio', { x: 0, y: 0.2, w: 1, h: 0.5 })]
      return extendDown(zonas, 'meio', SHEET, 0.5) === null ? null : 'esticou ao encolher'
    },
  },
  {
    nome: 'a folha tem teto: puxar até o infinito para no limite',
    rodar() {
      const zonas = [zona('meio', { x: 0, y: 0, w: 1, h: 1 })]
      const r = extendDown(zonas, 'meio', SHEET, 9999)!
      if (r.sheet > SHEET_MAX + 1) return `folha passou do teto: ${Math.round(r.sheet)}`
      const meio = r.rects.get('meio')!
      if (meio.h > 1.001 || meio.y < -0.001) return 'a faixa saiu da folha'
      return null
    },
  },
  {
    nome: 'depois de esticar, todas as frações continuam dentro da folha',
    rodar() {
      const zonas = [
        zona('a', { x: 0, y: 0, w: 1, h: 0.2 }),
        zona('b', { x: 0, y: 0.2, w: 1, h: 0.3 }),
        zona('c', { x: 0, y: 0.5, w: 1, h: 0.5 }),
      ]
      const r = extendDown(zonas, 'b', SHEET, 1.4)!
      for (const [id, rect] of r.rects) {
        if (rect.y < -0.001 || rect.y + rect.h > 1.001) {
          return `${id} ficou fora: y=${rect.y.toFixed(3)} h=${rect.h.toFixed(3)}`
        }
      }
      return null
    },
  },
  {
    nome: 'a folha esticada muda onde a divisão se repete',
    rodar() {
      const alto = SHEET * 2
      // Com a folha do dobro do tamanho, o meio da segunda folha é 3×SHEET.
      const f = pageToFrac({ x: 0, y: alto * 1.5 }, alto)
      if (Math.abs(f.y - 0.5) > 0.001) return `fração ${f.y.toFixed(3)}, esperava 0,5`
      const v = visibleSheets(0, alto * 2.5, alto)
      if (v.first !== 0 || v.last !== 2) return `folhas ${v.first}..${v.last}, esperava 0..2`
      return null
    },
  },
]

console.log('\n  Zonas editáveis — a régua da folha não pode escorregar\n')
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
