import {
  dadosParaHerdar,
  itensDoPasso,
  leituraSobreOAtual,
  temDadosDoUsuario,
} from '../src/items/preservar'
import { planFieldSync } from '../src/items/detect'
import { comTrechosEditados, doReconhecedor } from '../src/audio/transcricao'
import { ehFalhaDoBanco, explicarFalha } from '../src/db/falhas'
import { zoneAtPoint } from '../src/zones/hit'
import { pageToFrac } from '../src/zones/edit'
import { mergeFlowchart } from '../src/flow/merge'
import { nomeDeArquivo } from '../src/audio/export'
import type { Flowchart, Item, Recording, TrechoFalado, Zone } from '../src/domain/types'
import type { DetectedField } from '../src/items/detect'

/**
 * OS BURACOS QUE A REVISÃO ACHOU.
 *
 * A revisão da casa (os revisores do everything-claude-code, um por área)
 * reproduziu cada um destes contra o app de verdade. Aqui fica a regra pura
 * de cada conserto, com o cenário do revisor — e cada caso foi rodado com o
 * conserto removido, pra ver o caso cair.
 */

interface Caso {
  nome: string
  rodar: () => string | null
}

function item(id: string, strokeIds: string[], extra: Partial<Item> = {}): Item {
  return {
    id,
    pageId: 'pg',
    kind: 'tarefa',
    status: 'aberto',
    source: 'auto',
    zoneId: 'z-tarefas',
    strokeIds,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    title: '',
    ocr: { status: 'pendente' },
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  }
}

const comFicha = (id: string, strokeIds: string[]) =>
  item(id, strokeIds, {
    status: 'concluido',
    kind: 'pendencia',
    kindByUser: true,
    assignee: 'Maria',
    note: 'levar contrato',
    dueAt: 1_800_000_000_000,
    title: 'Comprar leite',
    ocr: { status: 'manual', text: 'Comprar leite', at: 5 },
  })

const campo = (strokeIds: string[]): DetectedField => ({
  zoneId: 'z-tarefas',
  kind: 'tarefa',
  strokeIds,
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
})

const casos: Caso[] = [
  // ── O que é dado do usuário ─────────────────────────────────────────────
  {
    nome: 'item recém-identificado não tem dado do usuário',
    rodar() {
      return temDadosDoUsuario(item('a', ['s1'])) ? 'achou dado onde não há' : null
    },
  },
  {
    nome: 'cada campo da ficha conta como dado do usuário',
    rodar() {
      const variantes: Partial<Item>[] = [
        { status: 'concluido' },
        { status: 'arquivado' },
        { kindByUser: true },
        { assignee: 'Ana' },
        { note: 'x' },
        { dueAt: 1 },
        { priority: 'alta' },
        { ocr: { status: 'manual', text: 'x', at: 1 } },
      ]
      for (const v of variantes) {
        if (!temDadosDoUsuario(item('a', ['s'], v))) return `não contou ${JSON.stringify(v)}`
      }
      return null
    },
  },

  // ── ↶ da borracha não desfaz o que veio depois ──────────────────────────
  {
    nome: '↶ de uma borrachada mantém a ficha preenchida DEPOIS dela',
    rodar() {
      // A borracha tirou um pedacinho da linha 2 (s2 → s2a); depois ele
      // preencheu a ficha da linha 1 e da linha 2.
      const antes = [item('l1', ['s1']), item('l2', ['s2'])]
      const depois = [item('l1', ['s1']), item('l2', ['s2a'])]
      const agora = [comFicha('l1', ['s1']), comFicha('l2', ['s2a'])]
      const r = itensDoPasso(agora, antes, depois)
      const l1 = r.itens.find((i) => i.id === 'l1')
      const l2 = r.itens.find((i) => i.id === 'l2')
      if (!l1 || l1.assignee !== 'Maria' || l1.status !== 'concluido') return 'a linha 1 perdeu a ficha'
      if (!l2 || l2.assignee !== 'Maria') return 'a linha 2 perdeu a ficha'
      if (l2.strokeIds.join() !== 's2') return `a tinta da linha 2 não voltou: ${l2.strokeIds}`
      if (r.gravar.some((i) => i.id === 'l1')) return 'regravou a linha que a borracha não tocou'
      return null
    },
  },
  {
    nome: '↶ devolve o item que a borracha apagou inteiro, e ↷ tira de novo',
    rodar() {
      const antes = [item('l1', ['s1']), comFicha('l2', ['s2'])]
      const depois = [item('l1', ['s1'])]
      const desfeito = itensDoPasso([item('l1', ['s1'])], antes, depois)
      if (!desfeito.itens.some((i) => i.id === 'l2' && i.assignee === 'Maria')) return 'o ↶ não devolveu o item'
      const refeito = itensDoPasso(desfeito.itens, depois, antes)
      if (refeito.itens.some((i) => i.id === 'l2')) return 'o ↷ não tirou o item de novo'
      return refeito.apagar.includes('l2') ? null : 'o ↷ não mandou apagar do banco'
    },
  },
  {
    nome: 'item criado depois da borrachada sobrevive ao ↶',
    rodar() {
      const r = itensDoPasso([item('l1', ['s1a']), item('novo', ['s9'])], [item('l1', ['s1'])], [item('l1', ['s1a'])])
      return r.itens.some((i) => i.id === 'novo') ? null : 'o ↶ apagou um item que nem existia na borrachada'
    },
  },

  // ── A leitura da letra não grava por cima ───────────────────────────────
  {
    nome: 'o texto lido vai em cima do item COMO ESTÁ AGORA',
    rodar() {
      const naFila = item('a', ['s1'])
      const agora = { ...comFicha('a', ['s1']), ocr: { status: 'pendente' as const }, title: '' }
      const r = leituraSobreOAtual(naFila, agora, { title: 'lido', ocr: { status: 'pronto', text: 'lido', at: 9 } })
      if (!r) return 'recusou sem motivo'
      if (r.status !== 'concluido' || r.assignee !== 'Maria' || !r.kindByUser) return 'perdeu a ficha'
      return r.title === 'lido' ? null : 'não pôs o texto'
    },
  },
  {
    nome: 'leitura não passa por cima de texto corrigido à mão, nem de tinta que mudou',
    rodar() {
      const naFila = item('a', ['s1'])
      if (leituraSobreOAtual(naFila, comFicha('a', ['s1']), { title: 'x', ocr: { status: 'pronto', text: 'x', at: 1 } })) {
        return 'gravou por cima do texto corrigido'
      }
      if (leituraSobreOAtual(naFila, item('a', ['s1', 's2']), { title: 'x', ocr: { status: 'pronto', text: 'x', at: 1 } })) {
        return 'gravou texto de uma linha que mudou'
      }
      return leituraSobreOAtual(naFila, undefined, { ocr: { status: 'pendente' } }) ? 'gravou item que sumiu' : null
    },
  },

  // ── Mudar a zona não apaga o que ele trabalhou ──────────────────────────
  {
    nome: 'zona apagada: item com ficha e tinta na folha FICA',
    rodar() {
      const p = planFieldSync([], [comFicha('a', ['s1'])], new Set(['s1']))
      return p.remove.length === 0 ? null : 'apagou o item com ficha'
    },
  },
  {
    nome: 'zona apagada: item sem ficha sai como sempre saiu',
    rodar() {
      const p = planFieldSync([], [item('a', ['s1'])], new Set(['s1']))
      return p.remove.join() === 'a' ? null : 'manteve item sem nada do usuário'
    },
  },
  {
    nome: 'tinta apagada leva o item embora, mesmo com ficha',
    rodar() {
      const p = planFieldSync([], [comFicha('a', ['s1'])], new Set())
      return p.remove.join() === 'a' ? null : 'item ficou apontando pra tinta que não existe'
    },
  },
  {
    nome: 'a zona voltando reencontra o item pela tinta, sem item novo',
    rodar() {
      const p = planFieldSync([campo(['s1'])], [comFicha('a', ['s1'])], new Set(['s1']))
      if (p.create.length !== 0) return 'criou item em branco'
      return p.update.length + p.iguais.length === 1 ? null : 'não pareou com o item antigo'
    },
  },

  // ── O carimbo herda a ficha ─────────────────────────────────────────────
  {
    nome: 'carimbar a tinta de um item automático herda a ficha dele',
    rodar() {
      const h = dadosParaHerdar([comFicha('a', ['s1'])])
      if (h.assignee !== 'Maria' || h.note !== 'levar contrato' || h.dueAt == null) return 'perdeu a ficha'
      if (h.status !== 'concluido') return 'perdeu o concluído'
      return h.ocr?.status === 'manual' && h.title === 'Comprar leite' ? null : 'perdeu o texto corrigido'
    },
  },

  // ── Dois editores de correção ───────────────────────────────────────────
  {
    nome: 'editor velho grava só o tópico que ELE mudou',
    rodar() {
      const base: TrechoFalado[] = [
        { inicioMs: 0, fimMs: 1, texto: 'abertura', marcaId: 'm0' },
        { inicioMs: 1, fimMs: 2, texto: 'orsamento', marcaId: 'm1' },
      ]
      // Na ata, alguém corrigiu o tópico 2 depois que o editor da ficha abriu.
      const atual = doReconhecedor('...', {
        trechos: [base[0], { ...base[1], texto: 'ORÇAMENTO corrigido na ata' }],
      })
      const r = comTrechosEditados(atual, base, ['abertura revisada', 'orsamento'])
      if (r === 'mudou') return 'recusou sem conflito'
      if (r.trechos?.[1].texto !== 'ORÇAMENTO corrigido na ata') return `apagou a correção da ata: ${r.trechos?.[1].texto}`
      return r.trechos?.[0].texto === 'abertura revisada' ? null : 'não gravou o que o editor mudou'
    },
  },
  {
    nome: 'os dois mexeram no MESMO tópico: recusa em vez de escolher calado',
    rodar() {
      const base: TrechoFalado[] = [{ inicioMs: 0, fimMs: 1, texto: 'x', marcaId: 'm' }]
      const atual = doReconhecedor('y', { trechos: [{ ...base[0], texto: 'y' }] })
      return comTrechosEditados(atual, base, ['z']) === 'mudou' ? null : 'escolheu um dos dois em silêncio'
    },
  },
  {
    nome: 'transcrição refeita por baixo do editor: recusa, não casa pela posição',
    rodar() {
      const base: TrechoFalado[] = [
        { inicioMs: 0, fimMs: 1, texto: 'a', marcaId: 'm1' },
        { inicioMs: 1, fimMs: 2, texto: 'b', marcaId: 'm2' },
      ]
      // A nova transcrição devolveu o MESMO texto no tópico 2, mas ele agora
      // é de outra marca: só a marca denuncia que não é o mesmo tópico.
      const refeita = doReconhecedor('...', {
        trechos: [
          { inicioMs: 0, fimMs: 1, texto: 'a', marcaId: 'm1' },
          { inicioMs: 1, fimMs: 2, texto: 'b', marcaId: 'm3' },
        ],
      })
      return comTrechosEditados(refeita, base, ['a', 'B corrigido']) === 'mudou'
        ? null
        : 'pôs a correção debaixo de outra marca'
    },
  },
  {
    nome: 'o texto corrido e o carimbo de corrigida acompanham a correção do editor',
    rodar() {
      // O .txt salvo lê o texto corrido, e re-transcrever só respeita o que
      // está marcado como corrigido: se algum dos dois não acompanha, a
      // correção parece salva e some na próxima transcrição ou no arquivo.
      const base: TrechoFalado[] = [
        { inicioMs: 0, fimMs: 1, texto: 'abertura', marcaId: 'm1' },
        { inicioMs: 1, fimMs: 2, texto: 'orsamento', marcaId: 'm2' },
      ]
      const atual = doReconhecedor('abertura orsamento', { trechos: base })
      const r = comTrechosEditados(atual, base, ['abertura', 'orçamento'])
      if (r === 'mudou') return 'recusou sem conflito'
      if (r.texto !== 'abertura orçamento') return `o texto corrido ficou "${r.texto}"`
      return r.corrigida === true ? null : 'a correção não ficou marcada como feita à mão'
    },
  },

  // ── Falha do banco é reconhecida ─────────────────────────────────────────
  {
    nome: 'armazenamento cheio é reconhecido e explicado',
    rodar() {
      const e = { name: 'QuotaExceededError', message: 'quota' }
      if (!ehFalhaDoBanco(e)) return 'não reconheceu'
      if (ehFalhaDoBanco(new Error('outra coisa'))) return 'confundiu erro comum com falha do banco'
      return /cheio/.test(explicarFalha(e)) ? null : 'explicação não diz o que fazer'
    },
  },

  // ── A margem acima da folha ─────────────────────────────────────────────
  {
    nome: 'tinta na margem acima da folha não cai em zona nenhuma',
    rodar() {
      const zonas: Zone[] = [
        { id: 'z1', pageId: 'pg', kind: 'pautas', label: 'Pauta', rect: { x: 0, y: 0, w: 1, h: 0.5 } },
        { id: 'z2', pageId: 'pg', kind: 'pendencias', label: 'Pendências', rect: { x: 0, y: 0.5, w: 1, h: 0.5 } },
      ]
      const z = zoneAtPoint(zonas, { x: 100, y: -15 }, 1754)
      if (z) return `caiu em ${z.label}`
      return pageToFrac({ x: 100, y: -15 }, 1754).y === 0 ? null : 'a fração foi pro fim da folha'
    },
  },

  // ── A seta que trocou de id ──────────────────────────────────────────────
  {
    nome: '"Ler de novo" mantém rótulo e curva da seta aparada pela borracha',
    rodar() {
      const anterior: Flowchart = {
        id: 'f',
        pageId: 'pg',
        soltos: 0,
        updatedAt: 1,
        nodes: [
          { id: 'a', kind: 'acao', label: 'A', bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
          { id: 'b', kind: 'acao', label: 'B', bounds: { minX: 0, minY: 20, maxX: 10, maxY: 30 } },
        ],
        edges: [{ id: 'seta', from: 'a', to: 'b', label: 'sim', direcao: 'leitura', saida: 'baixo', dobra: 0.3 } as Flowchart['edges'][number]],
      }
      const grafo = {
        nodes: ['a', 'b'].map((id) => ({
          id,
          kind: 'acao' as const,
          bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
          shapeStrokeIds: [id],
          labelStrokeIds: [],
        })),
        edges: [{ id: 'frag1', from: 'a', to: 'b', direcao: 'leitura' }],
        soltos: [],
        diagnostico: { tracos: 0, fechados: 0, juntados: 0, formas: 0, setas: 0, letra: 0, soltos: 0 },
      } as unknown as Parameters<typeof mergeFlowchart>[1]
      const r = mergeFlowchart(anterior, grafo)
      const e = r.edges[0]
      if (!e) return 'a seta sumiu'
      return e.label === 'sim' && e.dobra === 0.3 && e.saida === 'baixo' ? null : `perdeu: ${JSON.stringify(e)}`
    },
  },

  // ── Nome do arquivo ──────────────────────────────────────────────────────
  {
    nome: 'duas gravações no mesmo minuto não têm o mesmo nome de arquivo',
    rodar() {
      const base: Recording = {
        id: 'r',
        pageId: 'pg',
        startedAt: new Date(2026, 9, 7, 17, 29, 5).getTime(),
        durationMs: 1,
        mimeType: 'audio/webm',
        anchor: { x: 0, y: 0 },
        label: '07/10, 17:29',
      }
      const a = nomeDeArquivo(base)
      const b = nomeDeArquivo({ ...base, id: 'r2', startedAt: base.startedAt + 30_000 })
      return a !== b ? null : `os dois: ${a}`
    },
  },
]

console.log('\n  Os buracos que a revisão achou\n')
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
