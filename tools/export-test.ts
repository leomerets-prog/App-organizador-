import { fileSaver } from './capacitor-fake'
import { extensaoDe, limpar, nomeDeArquivo, salvarAudio, salvarImagem, salvarTexto } from '../src/audio/export'
import type { Recording } from '../src/domain/types'

/**
 * Salvar pra fora do app: a gravação, o texto da reunião, a imagem do fluxograma.
 *
 * É o último caminho de resgate do usuário — *"não posso perder nada dessa
 * conversa"* — e por isso o que importa aqui não é "salvou", é "salvou IGUAL".
 * Um arquivo de áudio com um byte a menos por pedaço abre, toca um pouco e
 * trava; ninguém percebe até precisar dele. Os casos rodam o caminho de dentro
 * do aplicativo contra um Android de mentira (`capacitor-fake.ts`) que guarda
 * os bytes que chegaram, e conferem byte a byte.
 */

interface Caso {
  nome: string
  rodar: () => string | Promise<string | null> | null
}

const PEDACO = 192 * 1024

function gravacao(extra: Partial<Recording> = {}): Recording {
  return {
    id: 'rec',
    pageId: 'pag',
    startedAt: new Date(2026, 9, 7, 8, 36, 5).getTime(),
    durationMs: 3000,
    mimeType: 'audio/webm;codecs=opus',
    anchor: { x: 0, y: 0 },
    label: '07/10, 08:36',
    ...extra,
  }
}

/** Bytes que não se repetem em passo curto: um byte perdido desalinha tudo. */
function bytes(n: number): Uint8Array {
  const b = new Uint8Array(n)
  for (let i = 0; i < n; i++) b[i] = (i * 31 + (i >> 8)) % 251
  return b
}

function juntar(pedacos: readonly Uint8Array[]): Uint8Array {
  const total = pedacos.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of pedacos) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function primeiroDiferente(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? -1 : n
}

const chamou = (metodo: string) => fileSaver.chamadas.filter((c) => c.metodo === metodo)

const casos: Caso[] = [
  // ── Os bytes que chegam ───────────────────────────────────────────────────
  {
    nome: 'o áudio salvo tem os MESMOS bytes do gravado, em vários pedaços',
    async rodar() {
      fileSaver.zerar()
      const original = bytes(2 * PEDACO + 5000)
      await salvarAudio(gravacao(), new Blob([original]))
      const chegou = juntar(fileSaver.escritos)
      if (chegou.length !== original.length) {
        return `chegaram ${chegou.length} bytes de ${original.length} (perdeu ${original.length - chegou.length})`
      }
      const onde = primeiroDiferente(chegou, original)
      return onde < 0 ? null : `o byte ${onde} chegou diferente`
    },
  },
  {
    nome: 'áudio de tamanho exato de pedaço não perde nem inventa byte',
    async rodar() {
      fileSaver.zerar()
      const original = bytes(2 * PEDACO)
      await salvarAudio(gravacao(), new Blob([original]))
      const chegou = juntar(fileSaver.escritos)
      if (primeiroDiferente(chegou, original) >= 0) return `chegaram ${chegou.length} bytes de ${original.length}`
      return fileSaver.escritos.length === 2 ? null : `mandou ${fileSaver.escritos.length} pedaços, esperava 2`
    },
  },
  {
    nome: 'áudio menor que um pedaço vai inteiro de uma vez',
    async rodar() {
      fileSaver.zerar()
      const original = bytes(1234)
      await salvarAudio(gravacao(), new Blob([original]))
      if (fileSaver.escritos.length !== 1) return `mandou ${fileSaver.escritos.length} pedaços`
      return primeiroDiferente(fileSaver.escritos[0], original) < 0 ? null : 'os bytes chegaram diferentes'
    },
  },
  {
    nome: 'nenhum pedaço passa do limite da ponte',
    async rodar() {
      fileSaver.zerar()
      await salvarAudio(gravacao(), new Blob([bytes(3 * PEDACO + 77)]))
      const grande = fileSaver.escritos.find((p) => p.length > PEDACO)
      return grande ? `um pedaço chegou com ${grande.length} bytes` : null
    },
  },
  {
    nome: 'o arquivo é aberto com o nome e o tipo certos, e fechado no fim',
    async rodar() {
      fileSaver.zerar()
      const r = await salvarAudio(gravacao(), new Blob([bytes(100)]))
      const abrir = chamou('abrir')[0]?.opcoes
      if (!abrir) return 'não abriu arquivo nenhum'
      if (abrir.nome !== 'Organizador 07-10, 08-36-05.webm') return `nome: ${abrir.nome}`
      if (abrir.mimeType !== 'audio/webm;codecs=opus') return `tipo: ${abrir.mimeType}`
      const ordem = fileSaver.chamadas.map((c) => c.metodo).join()
      if (ordem !== 'abrir,escrever,fechar') return `ordem das chamadas: ${ordem}`
      return r.onde === 'a pasta Downloads' ? null : `onde: ${r.onde}`
    },
  },

  // ── Quando falha no meio ──────────────────────────────────────────────────
  {
    nome: 'falha no meio descarta o arquivo pela metade, em vez de deixá-lo parecendo inteiro',
    async rodar() {
      fileSaver.zerar()
      fileSaver.falharNoEscrever = 2
      let erro: unknown
      try {
        await salvarAudio(gravacao(), new Blob([bytes(3 * PEDACO)]))
      } catch (e) {
        erro = e
      }
      if (!erro) return 'a falha foi engolida: o app diria que salvou'
      const cancelou = chamou('cancelar')
      if (cancelou.length !== 1) return `chamou cancelar ${cancelou.length} vez(es), esperava 1`
      if (cancelou[0].opcoes.token !== 'tk-1') return 'cancelou o arquivo errado'
      return chamou('fechar').length === 0 ? null : 'fechou o arquivo que tinha dado erro'
    },
  },
  {
    nome: 'se até o cancelar falhar, o erro que o usuário vê é o primeiro',
    async rodar() {
      fileSaver.zerar()
      fileSaver.falharNoEscrever = 1
      fileSaver.falharNoCancelar = true
      try {
        await salvarAudio(gravacao(), new Blob([bytes(PEDACO + 10)]))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return msg === 'disco cheio' ? null : `o erro visto foi "${msg}"`
      }
      return 'a falha foi engolida'
    },
  },
  {
    nome: 'falha ao fechar também descarta o arquivo',
    async rodar() {
      // `fechar` é quem entrega o arquivo: se ele não deu certo, não há arquivo.
      fileSaver.zerar()
      fileSaver.falharNoFechar = true
      try {
        await salvarAudio(gravacao(), new Blob([bytes(10)]))
      } catch {
        return chamou('cancelar').length === 1 ? null : 'o arquivo que não fechou ficou na pasta'
      }
      return 'a falha foi engolida'
    },
  },
  {
    nome: 'salvando sem falha, nada é cancelado',
    async rodar() {
      fileSaver.zerar()
      await salvarAudio(gravacao(), new Blob([bytes(10)]))
      return chamou('cancelar').length === 0 ? null : 'cancelou um arquivo que fechou bem'
    },
  },

  // ── O texto e a imagem ────────────────────────────────────────────────────
  {
    nome: 'o .txt salvo leva o marcador de acentos no começo — senão vira "reuniÃ£o"',
    async rodar() {
      fileSaver.zerar()
      await salvarTexto('reunião de hoje', 'Ata da reunião.txt')
      const chegou = juntar(fileSaver.escritos)
      const bom = chegou[0] === 0xef && chegou[1] === 0xbb && chegou[2] === 0xbf
      if (!bom) return `os 3 primeiros bytes foram ${Array.from(chegou.slice(0, 3)).join(',')}, esperava 239,187,191`
      const texto = new TextDecoder('utf-8', { ignoreBOM: true }).decode(chegou)
      return texto === '﻿reunião de hoje' ? null : `o texto chegou "${texto}"`
    },
  },
  {
    nome: 'o .txt sai com nome limpo e tipo texto',
    async rodar() {
      fileSaver.zerar()
      await salvarTexto('x', 'Ata: reunião?.txt')
      const abrir = chamou('abrir')[0]?.opcoes
      if (abrir?.nome !== 'Ata- reuniao-.txt') return `nome: ${abrir?.nome}`
      return abrir.mimeType === 'text/plain' ? null : `tipo: ${abrir.mimeType}`
    },
  },
  {
    nome: 'a imagem sai com nome limpo e extensão .png, uma vez só',
    async rodar() {
      fileSaver.zerar()
      await salvarImagem(new Blob([bytes(50)]), 'Fluxo: aprovação?.png')
      const abrir = chamou('abrir')[0]?.opcoes
      if (abrir?.nome !== 'Fluxo- aprovacao-.png') return `nome: ${abrir?.nome}`
      if (abrir.mimeType !== 'image/png') return `tipo: ${abrir.mimeType}`
      fileSaver.zerar()
      await salvarImagem(new Blob([bytes(50)]), 'sem extensão')
      const outro = chamou('abrir')[0]?.opcoes
      return outro?.nome === 'sem extensao.png' ? null : `nome sem extensão: ${outro?.nome}`
    },
  },

  // ── O nome do arquivo ─────────────────────────────────────────────────────
  {
    nome: 'nome comprido é cortado em 60 letras',
    rodar() {
      const n = limpar('a'.repeat(200)).length
      return n === 60 ? null : `ficou com ${n}`
    },
  },
  {
    nome: 'espaços repetidos no nome viram um só',
    rodar() {
      const n = limpar('Fluxo   de     aprovação')
      return n === 'Fluxo de aprovacao' ? null : `ficou "${n}"`
    },
  },
  {
    nome: 'a extensão sai do tipo do áudio, com os parâmetros do codec grudados',
    rodar() {
      const pares: [string, string][] = [
        ['audio/webm;codecs=opus', 'webm'],
        ['audio/mp4', 'm4a'],
        ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
        ['audio/ogg', 'ogg'],
        ['audio/mpeg', 'mp3'],
        ['audio/wav', 'wav'],
        ['audio/x-wav', 'wav'],
        ['AUDIO/AAC', 'aac'],
        ['', 'webm'],
        ['video/desconhecido', 'webm'],
      ]
      for (const [tipo, ext] of pares) {
        if (extensaoDe(tipo) !== ext) return `"${tipo}" saiu ${extensaoDe(tipo)}, esperava ${ext}`
      }
      return null
    },
  },
  {
    nome: 'duas gravações no mesmo minuto não saem com o mesmo nome',
    rodar() {
      const a = nomeDeArquivo(gravacao({ startedAt: new Date(2026, 9, 7, 8, 36, 5).getTime() }))
      const b = nomeDeArquivo(gravacao({ startedAt: new Date(2026, 9, 7, 8, 36, 41).getTime() }))
      return a !== b ? null : `as duas saíram "${a}"`
    },
  },
  {
    nome: 'gravação de áudio MP4 sai com .m4a',
    rodar() {
      const n = nomeDeArquivo(gravacao({ mimeType: 'audio/mp4' }))
      return n.endsWith('.m4a') ? null : `saiu "${n}"`
    },
  },
]

console.log('\n  Salvar pra fora do app — o arquivo tem que chegar igual\n')
let falhas = 0
for (const caso of casos) {
  let erro: string | null
  try {
    erro = await caso.rodar()
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
