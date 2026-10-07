import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Recording } from '../domain/types'

/**
 * Salvar a gravação PRA FORA do app.
 *
 * Até aqui o áudio só existia dentro do aplicativo: desinstalar, limpar dados
 * ou trocar de tablet levava tudo junto, e não havia caminho nenhum de resgate.
 * Pedido do usuário, com o motivo dito por ele: *"não posso perder nada dessa
 * conversa"*.
 *
 * No aplicativo instalado, o arquivo vai pra pasta **Downloads** do tablet —
 * onde o gerenciador de arquivos vê, o backup do Android pega e qualquer outro
 * app consegue abrir pra mandar adiante. No navegador, cai no download comum.
 *
 * ## Por que vai em pedaços
 *
 * A ponte do Capacitor leva textos, não arquivos: mandar uma gravação de uma
 * hora de uma vez só significaria uma string de dezenas de megabytes
 * atravessando a ponte — que é exatamente como se derruba a WebView por falta
 * de memória. Então o arquivo é aberto no lado Android, escrito em pedaços e
 * fechado no fim. Se algo falhar no meio, o pedaço já escrito é descartado
 * (`cancelar`), pra não deixar um arquivo pela metade parecendo inteiro.
 */

interface FileSaverPlugin {
  abrir(options: { nome: string; mimeType: string }): Promise<{ token: string }>
  escrever(options: { token: string; base64: string }): Promise<void>
  fechar(options: { token: string }): Promise<{ onde: string }>
  cancelar(options: { token: string }): Promise<void>
}

const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver')

/** 192 KB por pedaço: grande o bastante pra ser rápido, pequeno pra ser seguro. */
const PEDACO = 192 * 1024

export interface SaveResult {
  /** Onde o arquivo ficou, em palavras que o usuário reconhece na tela. */
  onde: string
}

/** Estamos dentro do app Android, onde existe pasta de verdade pra salvar? */
function noAplicativo(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FileSaver')
  } catch {
    return false
  }
}

export async function salvarAudio(rec: Recording, blob: Blob): Promise<SaveResult> {
  const nome = nomeDeArquivo(rec)

  if (!noAplicativo()) {
    baixarNoNavegador(blob, nome)
    return { onde: 'downloads deste navegador' }
  }

  return await enviarEmPedacos(blob, nome, rec.mimeType || 'audio/webm')
}

/** A travessia da ponte, em pedaços — serve pro áudio e pra imagem. */
async function enviarEmPedacos(blob: Blob, nome: string, mimeType: string): Promise<SaveResult> {
  const { token } = await FileSaver.abrir({ nome, mimeType })
  try {
    for (let inicio = 0; inicio < blob.size; inicio += PEDACO) {
      const parte = blob.slice(inicio, Math.min(inicio + PEDACO, blob.size))
      await FileSaver.escrever({ token, base64: await paraBase64(parte) })
    }
    return await FileSaver.fechar({ token })
  } catch (erro) {
    // O arquivo pela metade é pior que nenhum: parece salvo e não toca.
    await FileSaver.cancelar({ token }).catch(() => {})
    throw erro
  }
}

/**
 * Salvar uma imagem (hoje, o fluxograma montado).
 *
 * Mesmo caminho do áudio — pasta Downloads no aplicativo, download comum no
 * navegador — porque o problema é o mesmo: o que fica só dentro do app morre
 * com o app.
 */
export async function salvarImagem(blob: Blob, nome: string): Promise<SaveResult> {
  const limpo = limpar(nome.replace(/\.png$/i, '')) + '.png'
  if (!noAplicativo()) {
    baixarNoNavegador(blob, limpo)
    return { onde: 'downloads deste navegador' }
  }
  return await enviarEmPedacos(blob, limpo, 'image/png')
}

/**
 * Salvar um texto (hoje, a transcrição da reunião).
 *
 * Mesmo caminho do áudio e da imagem, pelo mesmo motivo dito por ele: *"não
 * posso perder nada dessa conversa"*. Uma transcrição que só existe dentro do
 * aplicativo morre com o aplicativo — e esta é a que ele vai ter corrigido à
 * mão, que é o trabalho mais caro de todos de refazer.
 *
 * O `﻿` na frente é pra planilha e editor do Windows: sem ele, abrir o
 * arquivo mostra "reuniÃ£o" em vez de "reunião".
 */
export async function salvarTexto(texto: string, nome: string): Promise<SaveResult> {
  const limpo = limpar(nome.replace(/\.txt$/i, '')) + '.txt'
  const blob = new Blob(['﻿' + texto], { type: 'text/plain;charset=utf-8' })
  if (!noAplicativo()) {
    baixarNoNavegador(blob, limpo)
    return { onde: 'downloads deste navegador' }
  }
  return await enviarEmPedacos(blob, limpo, 'text/plain')
}

/**
 * Nome do arquivo.
 *
 * Leva o rótulo da gravação (que já é a data e a hora) porque é por ele que o
 * usuário reconhece a conversa meses depois, no meio da pasta de downloads.
 */
export function nomeDeArquivo(rec: Recording): string {
  const quando = rec.label || new Date(rec.startedAt).toLocaleString('pt-BR')
  /*
   * Os segundos do começo vão no nome: o rótulo tem só dia e minuto, e duas
   * gravações no mesmo minuto saíam com o MESMO nome — no Android a segunda
   * vira "(1)" e o aviso nomeava o arquivo errado; na pasta de reserva, a
   * segunda passava por cima da primeira.
   */
  const segundos = String(new Date(rec.startedAt).getSeconds()).padStart(2, '0')
  return `Organizador ${limpar(quando)}-${segundos}.${extensaoDe(rec.mimeType)}`
}

/**
 * Tira do nome o que sistema de arquivos nenhum aceita, sem virar ilegível.
 *
 * Inclusive o ACENTO, e isso não é frescura: medido no navegador, um nome com
 * "ç" ou "ã" faz o Chrome descartar o nome INTEIRO e salvar o arquivo como
 * "download". Em português o acento é o caso normal — um título como "Fluxo de
 * aprovação" perderia o nome todo. Tirar o acento devolve "Fluxo de aprovacao",
 * que se lê igual e atravessa qualquer sistema de arquivos.
 */
export function limpar(texto: string): string {
  return (
    texto
      // Separa a letra do acento (NFD) e joga fora só o acento.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'audio'
  )
}

/**
 * Extensão a partir do tipo.
 *
 * O tipo vem com os parâmetros do codec grudados
 * (`audio/webm;codecs=opus`) — cortar no `;` é o que faz o `webm` aparecer.
 */
export function extensaoDe(mimeType: string): string {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase()
  const tabela: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
  }
  return tabela[base] ?? 'webm'
}

/** Um pedaço do blob como base64 puro, sem o `data:...;base64,` na frente. */
function paraBase64(parte: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(leitor.error ?? new Error('Não consegui ler o áudio.'))
    leitor.onload = () => {
      const texto = String(leitor.result)
      const virgula = texto.indexOf(',')
      resolve(virgula >= 0 ? texto.slice(virgula + 1) : texto)
    }
    leitor.readAsDataURL(parte)
  })
}

/** Caminho do navegador: download comum, que lá funciona e aqui não. */
function baixarNoNavegador(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revogar na hora cancela o download em alguns navegadores; um respiro basta.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
