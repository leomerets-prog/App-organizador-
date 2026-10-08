import type { Item, Stroke } from '../src/domain/types'
import {
  EMPTY_HISTORY,
  MAX_STEPS,
  applyPatch,
  drawStep,
  eraseStep,
  forPage,
  push,
  redo,
  undo,
} from '../src/ink/history'

/**
 * Voltar e avançar.
 *
 * O que não pode acontecer, em ordem de gravidade: a folha voltar pra um
 * estado que nunca existiu, tinta duplicar, ou "voltar" apagar algo que o
 * usuário fez DEPOIS. Os casos abaixo cercam exatamente isso.
 */

interface Caso {
  nome: string
  rodar: () => string | null
}

let n = 0
function traco(id?: string): Stroke {
  const num = ++n
  return {
    id: id ?? `s${num}`,
    pageId: 'pg',
    points: [{ x: 0, y: 0, p: 0.5, t: 0 }],
    color: '#000',
    width: 2,
    tool: 'pen',
    zoneId: null,
    startedAt: num * 100,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  }
}

function item(id: string): Item {
  return {
    id,
    pageId: 'pg',
    kind: 'tarefa',
    title: id,
    strokeIds: [],
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    status: 'aberto',
    source: 'auto',
    zoneId: null,
    ocr: { status: 'pendente' },
    createdAt: 1,
    updatedAt: 1,
  }
}

const ids = (lista: readonly Stroke[]) => lista.map((s) => s.id).join(',')

const casos: Caso[] = [
  {
    nome: 'voltar tira o traço que acabou de ser feito',
    rodar() {
      const a = traco('a')
      const b = traco('b')
      const h = push(push(EMPTY_HISTORY, drawStep(a)), drawStep(b))
      const passo = undo(h)
      if (!passo) return 'não havia o que voltar'
      const depois = applyPatch([a, b], passo.step.antes)
      return ids(depois) === 'a' ? null : `sobrou "${ids(depois)}"`
    },
  },
  {
    nome: 'avançar devolve o traço que o voltar tirou',
    rodar() {
      const a = traco('a')
      const h = push(EMPTY_HISTORY, drawStep(a))
      const voltou = undo(h)!
      const semA = applyPatch([a], voltou.step.antes)
      const avancou = redo(voltou.history)
      if (!avancou) return 'não havia o que avançar'
      const comA = applyPatch(semA, avancou.step.depois)
      return ids(comA) === 'a' ? null : `veio "${ids(comA)}"`
    },
  },
  {
    nome: 'voltar várias vezes volta na ordem certa',
    rodar() {
      const a = traco('a')
      const b = traco('b')
      const c = traco('c')
      let h = push(push(push(EMPTY_HISTORY, drawStep(a)), drawStep(b)), drawStep(c))
      let tinta: Stroke[] = [a, b, c]
      for (const esperado of ['a,b', 'a', '']) {
        const passo = undo(h)
        if (!passo) return 'acabou cedo demais'
        h = passo.history
        tinta = applyPatch(tinta, passo.step.antes)
        if (ids(tinta) !== esperado) return `esperava "${esperado}", veio "${ids(tinta)}"`
      }
      return undo(h) === null ? null : 'ainda achou passo depois de esvaziar'
    },
  },
  {
    // Sem isto, voltar duas vezes a mesma coisa (toque duplo acidental)
    // devolveria o traço duas vezes.
    nome: 'aplicar duas vezes não duplica tinta',
    rodar() {
      const a = traco('a')
      const passo = drawStep(a)
      const uma = applyPatch([], passo.depois)
      const duas = applyPatch(uma, passo.depois)
      return ids(duas) === 'a' ? null : `veio "${ids(duas)}"`
    },
  },
  {
    nome: 'a tinta devolvida volta pra ordem em que foi escrita',
    rodar() {
      const a = traco('a')
      const b = traco('b')
      const c = traco('c')
      // "a" volta depois de "b" e "c" já estarem lá.
      const voltou = applyPatch([b, c], { restore: [a], remove: [] })
      return ids(voltou) === 'a,b,c' ? null : `ordem saiu "${ids(voltou)}"`
    },
  },
  {
    nome: 'voltar a borrachada devolve o inteiro e tira os pedaços',
    rodar() {
      const inteiro = traco('inteiro')
      const p1 = traco('p1')
      const p2 = traco('p2')
      const passo = eraseStep('pg', [inteiro], [p1, p2], [item('i')], [])
      const antes = applyPatch([p1, p2], passo.antes)
      if (ids(antes) !== 'inteiro') return `voltou como "${ids(antes)}"`
      const depois = applyPatch(antes, passo.depois)
      return ids(depois) === 'p1,p2' ? null : `avançou pra "${ids(depois)}"`
    },
  },
  {
    nome: 'a borrachada leva a lista de itens junto, nos dois sentidos',
    rodar() {
      const passo = eraseStep('pg', [traco()], [traco()], [item('i1'), item('i2')], [item('i1')])
      if (passo.antes.items?.length !== 2) return 'a lista de antes não veio'
      if (passo.depois.items?.length !== 1) return 'a lista de depois não veio'
      return null
    },
  },
  {
    // A regra de todo editor, e o motivo é prático: depois de voltar e fazer
    // outra coisa, o que foi desfeito não tem mais onde encaixar.
    nome: 'fazer algo novo apaga o avançar',
    rodar() {
      const h = push(push(EMPTY_HISTORY, drawStep(traco('a'))), drawStep(traco('b')))
      const voltou = undo(h)!
      if (voltou.history.desfeitos.length !== 1) return 'o desfeito não foi guardado'
      const novo = push(voltou.history, drawStep(traco('c')))
      return novo.desfeitos.length === 0 ? null : 'o avançar sobreviveu'
    },
  },
  {
    nome: 'a pilha não cresce pra sempre',
    rodar() {
      let h = EMPTY_HISTORY
      for (let i = 0; i < MAX_STEPS + 20; i++) h = push(h, drawStep(traco()))
      if (h.feitos.length !== MAX_STEPS) return `guardou ${h.feitos.length}`
      // O que ficou tem que ser o FIM da lista, não o começo.
      const ultimo = h.feitos[h.feitos.length - 1]
      return ultimo.antes.remove[0] === `s${n}` ? null : 'jogou fora o passo errado'
    },
  },
  {
    nome: 'trocar de página não deixa passo de outra folha pra trás',
    rodar() {
      const daPg = drawStep(traco('a'))
      const deOutra = { ...drawStep(traco('b')), pageId: 'outra' }
      const h = push(push(EMPTY_HISTORY, daPg), deOutra)
      const limpa = forPage(h, 'pg')
      if (limpa.feitos.length !== 1) return `sobraram ${limpa.feitos.length} passos`
      return forPage(h, null).feitos.length === 0 ? null : 'sem página aberta deveria esvaziar'
    },
  },
  {
    nome: 'nada pra voltar devolve nulo em vez de quebrar',
    rodar() {
      if (undo(EMPTY_HISTORY) !== null) return 'voltou do nada'
      if (redo(EMPTY_HISTORY) !== null) return 'avançou do nada'
      return null
    },
  },
  {
    nome: 'avançar gasta o passo: avançar de novo traz o próximo, e no fim não traz nada',
    rodar() {
      const a = traco('a')
      const b = traco('b')
      let h = push(push(EMPTY_HISTORY, drawStep(a)), drawStep(b))
      h = undo(h)!.history
      h = undo(h)!.history
      // Dois passos desfeitos, na ordem: primeiro 'a', depois 'b'.
      const um = redo(h)
      if (!um) return 'não havia o que avançar'
      if (um.step.antes.remove[0] !== 'a') return `avançou ${um.step.antes.remove[0]} primeiro, esperava a`
      if (um.history.desfeitos.length !== 1) return `sobraram ${um.history.desfeitos.length} passo(s) pra avançar, esperava 1`
      const dois = redo(um.history)
      if (!dois) return 'o segundo avançar não achou o passo de b'
      if (dois.step.antes.remove[0] !== 'b') return `avançou ${dois.step.antes.remove[0]}, esperava b`
      if (redo(dois.history) !== null) return 'avançou além do que tinha sido desfeito'
      return dois.history.feitos.length === 2 ? null : `o voltar ficou com ${dois.history.feitos.length} passo(s)`
    },
  },
]

console.log('\n  Voltar e avançar — a folha nunca num estado que não existiu\n')
let falhas = 0
for (const caso of casos) {
  const erro = caso.rodar()
  if (erro) {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${caso.nome.padEnd(54)} ${erro}`)
  } else {
    console.log(`  \x1b[32m✓\x1b[0m ${caso.nome}`)
  }
}
console.log(falhas ? `\n  ${falhas} caso(s) fora do esperado\n` : '\n  todos os casos passaram\n')
process.exit(falhas ? 1 : 0)
