/**
 * Verificação da identificação de campos.
 *
 * Roda com: npm run test:fields
 *
 * O que importa aqui: **uma linha escrita = um campo**. Separar demais enche o
 * painel de pedaços de frase; juntar demais funde duas tarefas numa só, que o
 * usuário não consegue concluir em separado. Os dois erros custam a confiança
 * no painel, que é a razão de o app existir — daí os casos abaixo cercarem as
 * duas fronteiras, e não só o caminho feliz.
 */

import type { Item, Stroke, Zone } from '../src/domain/types'
import { boundsOf } from '../src/lib/geometry'
import { detectFields, planFieldSync } from '../src/items/detect'

// ─── Cenário ─────────────────────────────────────────────────────────────────

/** Folha de 1240 × 1754: tarefas no meio, anotação livre embaixo. */
const TAREFAS: Zone = {
  id: 'z-tarefas',
  pageId: 'pg',
  kind: 'tarefas',
  label: 'Tarefas',
  rect: { x: 0, y: 0.1, w: 1, h: 0.5 },
}

const NOTA: Zone = {
  id: 'z-nota',
  pageId: 'pg',
  kind: 'anotacao',
  label: 'Anotação',
  rect: { x: 0, y: 0.6, w: 1, h: 0.4 },
}

const ZONAS = [TAREFAS, NOTA]

/** Uma palavra escrita: a caixa é o que a identificação enxerga. */
function palavra(
  id: string,
  x: number,
  y: number,
  w = 120,
  h = 30,
  zoneId: string | null = TAREFAS.id,
  tool: 'pen' | 'highlighter' = 'pen',
): Stroke {
  const points = [
    { x, y, p: 0.5, t: 0 },
    { x: x + w / 2, y: y + h, p: 0.5, t: 10 },
    { x: x + w, y, p: 0.5, t: 20 },
  ]
  return {
    id,
    pageId: 'pg',
    points,
    color: 'ink',
    width: 2,
    tool,
    zoneId,
    startedAt: 1000,
    bounds: boundsOf(points),
  }
}

function itemDe(id: string, strokeIds: string[], extra: Partial<Item> = {}): Item {
  return {
    id,
    pageId: 'pg',
    kind: 'tarefa',
    status: 'aberto',
    source: 'auto',
    zoneId: TAREFAS.id,
    strokeIds,
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    title: '',
    ocr: { status: 'pendente' },
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  }
}

// ─── Casos ───────────────────────────────────────────────────────────────────

const casos: { nome: string; rodar: () => string | null }[] = [
  {
    nome: 'três linhas na faixa viram três tarefas',
    rodar() {
      const campos = detectFields(
        [palavra('a', 40, 200), palavra('b', 40, 260), palavra('c', 40, 320)],
        ZONAS,
      )
      if (campos.length !== 3) return `esperava 3 campos, veio ${campos.length}`
      if (campos.some((c) => c.kind !== 'tarefa')) return 'a zona não definiu o tipo'
      return null
    },
  },
  {
    nome: 'palavras da mesma linha são um campo só',
    rodar() {
      const campos = detectFields(
        [palavra('a', 40, 200), palavra('b', 180, 202), palavra('c', 320, 198)],
        ZONAS,
      )
      if (campos.length !== 1) return `esperava 1 campo, veio ${campos.length}`
      if (campos[0].strokeIds.length !== 3) return 'a linha perdeu palavras pelo caminho'
      return null
    },
  },
  {
    nome: 'o pingo do i fica na linha dele',
    rodar() {
      // O pingo é alto demais pra sobrepor a palavra: quem o recolhe é a
      // junção de linhas quase encostadas.
      const campos = detectFields([palavra('a', 40, 200), palavra('pingo', 70, 194, 4, 4)], ZONAS)
      if (campos.length !== 1) return `esperava 1 campo, veio ${campos.length}`
      if (campos[0].strokeIds.length !== 2) return 'o pingo não entrou no campo'
      return null
    },
  },
  {
    nome: 'linhas apertadas continuam sendo duas tarefas',
    rodar() {
      // Vão de 11px entre linhas de 30: escrita corrida, não é a mesma linha.
      const campos = detectFields([palavra('a', 40, 200), palavra('b', 40, 241)], ZONAS)
      if (campos.length !== 2) return `esperava 2 campos, veio ${campos.length}`
      return null
    },
  },
  {
    nome: 'palavras baixinhas na mesma linha não viram colunas',
    rodar() {
      // Linha rasa (6px de altura) com o espaço normal entre duas palavras.
      // Antes do piso de altura, este caso virava duas tarefas no tablet.
      const campos = detectFields([palavra('a', 40, 200, 120, 6), palavra('b', 190, 200, 120, 6)], ZONAS)
      if (campos.length !== 1) return `esperava 1 campo, veio ${campos.length}`
      return null
    },
  },
  {
    nome: 'duas colunas na mesma altura são dois campos',
    rodar() {
      const campos = detectFields([palavra('a', 40, 200), palavra('b', 800, 200)], ZONAS)
      if (campos.length !== 2) return `esperava 2 campos, veio ${campos.length}`
      return null
    },
  },
  {
    // "transcreve tudo, inclusive a anotação": o corpo da folha também vira
    // registro — como 'nota', que é registro sem ser trabalho. Antes ele era
    // ignorado, e o que se escrevia ali sumia da Central e da transcrição.
    nome: 'o corpo da anotação vira nota, uma por linha',
    rodar() {
      const campos = detectFields(
        [palavra('a', 40, 1200, 120, 30, NOTA.id), palavra('b', 40, 1260, 120, 30, NOTA.id)],
        ZONAS,
      )
      if (campos.length !== 2) return `esperava 2 notas, veio ${campos.length}`
      const fora = campos.filter((c) => c.kind !== 'nota')
      if (fora.length) return `nota saiu como ${fora.map((c) => c.kind).join(', ')}`
      return null
    },
  },
  {
    nome: 'pingo solto na folha não vira campo',
    rodar() {
      const campos = detectFields([palavra('sujeira', 40, 200, 4, 4)], ZONAS)
      if (campos.length !== 0) return `esperava 0 campos, veio ${campos.length}`
      return null
    },
  },
  {
    nome: 'marca-texto sozinho não vira campo',
    rodar() {
      const campos = detectFields(
        [palavra('m', 40, 200, 200, 22, TAREFAS.id, 'highlighter')],
        ZONAS,
      )
      if (campos.length !== 0) return `esperava 0 campos, veio ${campos.length}`
      return null
    },
  },
  {
    nome: 'traço antigo sem zona é resolvido pela posição',
    rodar() {
      const campos = detectFields([palavra('velho', 40, 400, 120, 30, null)], ZONAS)
      if (campos.length !== 1) return `esperava 1 campo, veio ${campos.length}`
      if (campos[0].zoneId !== TAREFAS.id) return 'caiu na zona errada'
      return null
    },
  },
  {
    nome: 'tinta já carimbada fica de fora',
    rodar() {
      const strokes = [palavra('a', 40, 200), palavra('b', 40, 260)]
      const campos = detectFields(strokes, ZONAS, { ignoreStrokeIds: new Set(['a']) })
      if (campos.length !== 1) return `esperava 1 campo, veio ${campos.length}`
      if (campos[0].strokeIds[0] !== 'b') return 'sobrou o campo errado'
      return null
    },
  },

  // ─── Reconciliação ─────────────────────────────────────────────────────────

  {
    nome: 'a linha que cresce continua sendo o mesmo item',
    rodar() {
      const campos = detectFields([palavra('a', 40, 200), palavra('b', 180, 200)], ZONAS)
      const plano = planFieldSync(campos, [itemDe('i1', ['a'])])
      if (plano.create.length !== 0) return 'criou item novo em cima do que já existia'
      if (plano.remove.length !== 0) return 'apagou o item que devia crescer'
      if (plano.update.length !== 1) return 'não atualizou a tinta do item'
      return null
    },
  },
  {
    nome: 'campo arquivado não volta a aparecer',
    rodar() {
      const campos = detectFields([palavra('a', 40, 200)], ZONAS)
      const plano = planFieldSync(campos, [itemDe('i1', ['a'], { status: 'arquivado' })])
      if (plano.create.length !== 0) return 'recriou o campo que o usuário arquivou'
      if (plano.remove.length !== 0) return 'apagou o arquivado'
      return null
    },
  },
  {
    nome: 'tipo trocado pelo usuário sobrevive à passada seguinte',
    rodar() {
      const campos = detectFields([palavra('a', 40, 200), palavra('b', 180, 200)], ZONAS)
      const plano = planFieldSync(campos, [itemDe('i1', ['a'], { kind: 'pendencia' })])
      if (plano.update.length !== 1) return 'não atualizou o item'
      if (plano.update[0].item.kind !== 'pendencia') return 'o plano mexeu no tipo escolhido'
      return null
    },
  },
  {
    nome: 'tinta apagada leva o item embora',
    rodar() {
      const plano = planFieldSync([], [itemDe('i1', ['a'])])
      if (plano.remove.length !== 1) return 'o item ficou apontando pra tinta que não existe'
      return null
    },
  },
  {
    nome: 'linha nova vira item novo sem mexer na antiga',
    rodar() {
      const campos = detectFields([palavra('a', 40, 200), palavra('b', 40, 300)], ZONAS)
      const plano = planFieldSync(campos, [
        itemDe('i1', ['a'], { bounds: campos[0].bounds, zoneId: campos[0].zoneId }),
      ])
      if (plano.create.length !== 1) return `esperava 1 item novo, veio ${plano.create.length}`
      if (plano.update.length !== 0) return 'mexeu no item que não mudou'
      if (plano.remove.length !== 0) return 'apagou o item antigo'
      return null
    },
  },
  {
    nome: 'passar de novo sem escrever nada não muda nada',
    rodar() {
      const strokes = [palavra('a', 40, 200), palavra('b', 180, 200), palavra('c', 40, 300)]
      const campos = detectFields(strokes, ZONAS)
      // Primeira passada: tudo novo.
      const primeira = planFieldSync(campos, [])
      if (primeira.create.length !== 2) return `esperava 2 itens novos, veio ${primeira.create.length}`

      // O que o app gravaria depois da primeira passada.
      const itens = primeira.create.map((campo, i) =>
        itemDe(`i${i}`, campo.strokeIds, { bounds: campo.bounds, zoneId: campo.zoneId }),
      )

      const segunda = planFieldSync(detectFields(strokes, ZONAS), itens)
      if (segunda.create.length + segunda.update.length + segunda.remove.length !== 0) {
        return 'a segunda passada mexeu no banco sem nada ter mudado'
      }
      return null
    },
  },
]

console.log('\n  Identificação de campos — uma linha escrita, um campo\n')
let falhas = 0
for (const caso of casos) {
  const erro = caso.rodar()
  if (erro) {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${caso.nome.padEnd(52)} ${erro}`)
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
