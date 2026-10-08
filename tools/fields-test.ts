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
import type { DetectedField } from '../src/items/detect'

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

/** Um campo montado à mão, quando a posição da tinta não é o que se testa. */
function campoFeito(
  strokeIds: string[],
  bounds: DetectedField['bounds'] = { minX: 40, minY: 200, maxX: 160, maxY: 230 },
): DetectedField {
  return { zoneId: TAREFAS.id, kind: 'tarefa', strokeIds, bounds }
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
  // ─── O que a mutação mostrou que faltava ───────────────────────────────────

  {
    nome: 'letra inclinada com acento alto continua uma linha só, sem campo fantasma',
    rodar() {
      // A linha desce da esquerda pra direita (a segunda palavra fica mais
      // baixa que a primeira) e o acento sobe acima da primeira. Separado, o
      // acento viraria uma tarefa só com ele.
      const campos = detectFields(
        [palavra('acento', 60, 224, 20, 9), palavra('b', 40, 239, 120, 26), palavra('c', 180, 255, 120, 19)],
        ZONAS,
      )
      if (campos.length !== 1) return `esperava 1 campo, veio ${campos.length}: ${campos.map((c) => c.strokeIds.join('+')).join(' | ')}`
      return campos[0].strokeIds.length === 3 ? null : 'o campo perdeu traços'
    },
  },
  {
    nome: 'os campos saem de cima pra baixo na folha, qualquer que seja a ordem da tinta',
    rodar() {
      // Tinta da anotação (embaixo) listada antes da tinta das tarefas (em cima).
      const campos = detectFields(
        [palavra('embaixo', 40, 1300, 120, 30, NOTA.id), palavra('em-cima', 40, 200)],
        ZONAS,
      )
      const ordem = campos.map((c) => c.strokeIds[0]).join()
      return ordem === 'em-cima,embaixo' ? null : `ordem: ${ordem}`
    },
  },
  {
    nome: 'o que se desenha na zona de fluxograma não vira tarefa nem nota',
    rodar() {
      // Ali a leitura é o desenho inteiro (flow/), não uma linha por traço:
      // uma caixa e a seta ao lado, na mesma altura, virariam dois itens sem sentido.
      const FLUXO: Zone = {
        id: 'z-fluxo',
        pageId: 'pg',
        kind: 'fluxograma',
        label: 'Fluxograma',
        rect: { x: 0, y: 0.6, w: 1, h: 0.4 },
      }
      const campos = detectFields(
        [palavra('caixa', 40, 1200, 160, 90, FLUXO.id), palavra('seta', 260, 1230, 120, 20, FLUXO.id)],
        [TAREFAS, FLUXO],
      )
      return campos.length === 0 ? null : `saíram ${campos.length} campo(s) do fluxograma`
    },
  },

  // ─── Qual item é de qual campo (a ficha do usuário vai junto) ──────────────

  {
    nome: 'campo com dois candidatos fica com o que tem MAIS tinta em comum',
    rodar() {
      const campo = campoFeito(['a', 'b', 'c'])
      const pouco = itemDe('pouco', ['a'], { createdAt: 1 })
      const muito = itemDe('muito', ['a', 'b', 'c'], { createdAt: 9, bounds: campo.bounds })
      const plano = planFieldSync([campo], [pouco, muito])
      if (plano.iguais.map((i) => i.id).join() !== 'muito') return `ficou com ${[...plano.iguais, ...plano.update.map((u) => u.item)].map((i) => i.id).join()}`
      return plano.remove.join() === 'pouco' ? null : `removeu: ${plano.remove.join() || 'ninguém'}`
    },
  },
  {
    nome: 'empate de tinta cai no item MAIS ANTIGO: é o que o usuário já trabalhou',
    rodar() {
      const campo = campoFeito(['a'])
      const antigo = itemDe('antigo', ['a'], { createdAt: 1, bounds: campo.bounds })
      const novo = itemDe('novo', ['a'], { createdAt: 2, bounds: campo.bounds })
      // Nas duas ordens de entrada: o resultado não pode depender da lista.
      for (const lista of [[antigo, novo], [novo, antigo]]) {
        const plano = planFieldSync([campo], lista)
        if (plano.iguais.map((i) => i.id).join() !== 'antigo') {
          return `ficou com ${plano.iguais.map((i) => i.id).join() || 'ninguém'}, esperava antigo`
        }
        if (plano.remove.join() !== 'novo') return `removeu ${plano.remove.join() || 'ninguém'}, esperava novo`
      }
      return null
    },
  },
  {
    nome: 'um item não fica com dois campos: o segundo vira item novo',
    rodar() {
      // A linha foi partida em duas colunas: o item antigo cobria as duas.
      const f1 = campoFeito(['a'], { minX: 0, minY: 0, maxX: 10, maxY: 10 })
      const f2 = campoFeito(['b'], { minX: 500, minY: 0, maxX: 510, maxY: 10 })
      const velho = itemDe('velho', ['a', 'b'])
      const plano = planFieldSync([f1, f2], [velho])
      const usos = plano.update.length + plano.iguais.length
      if (usos !== 1) return `o item foi usado ${usos} vez(es)`
      return plano.create.length === 1 ? null : `criou ${plano.create.length} item(ns) novo(s), esperava 1`
    },
  },
  {
    nome: 'campo que mudou de zona atualiza o item, que não pode ficar na zona velha',
    rodar() {
      const campo = campoFeito(['a'])
      const noutraZona = itemDe('i1', ['a'], { zoneId: 'z-pendencias', bounds: campo.bounds })
      const plano = planFieldSync([campo], [noutraZona])
      if (plano.iguais.length !== 0) return 'deu o item por igual, mesmo estando em outra zona'
      return plano.update.length === 1 ? null : 'não atualizou o item'
    },
  },
  {
    nome: 'cada lado da caixa que muda faz o item ser atualizado',
    rodar() {
      const campo = campoFeito(['a'], { minX: 10, minY: 20, maxX: 110, maxY: 60 })
      for (const lado of ['minX', 'minY', 'maxX', 'maxY'] as const) {
        const item = itemDe('i1', ['a'], { bounds: { ...campo.bounds, [lado]: campo.bounds[lado] + 7 } })
        const plano = planFieldSync([campo], [item])
        if (plano.update.length !== 1 || plano.iguais.length !== 0) {
          return `o item cresceu/encolheu no ${lado} e a caixa dele não foi atualizada`
        }
      }
      const igual = planFieldSync([campo], [itemDe('i1', ['a'], { bounds: campo.bounds })])
      return igual.iguais.length === 1 && igual.update.length === 0 ? null : 'mexeu num item que já estava certo'
    },
  },
  {
    nome: 'item que perdeu um traço (o resto continua) é atualizado',
    rodar() {
      const campo = campoFeito(['a', 'b'])
      const item = itemDe('i1', ['a', 'b', 'c'], { bounds: campo.bounds })
      const plano = planFieldSync([campo], [item])
      if (plano.iguais.length !== 0) return 'deu por igual um item com traço a mais'
      return plano.update.length === 1 ? null : 'não atualizou o item'
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
