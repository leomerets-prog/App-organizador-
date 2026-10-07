import { avisarFalhaDeGravacao, ehFalhaDoBanco } from './db/falhas'
import { loadPrefs, savePrefs } from './state/prefs'
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * A tela de tropeço.
 *
 * Um erro de JavaScript dentro do app empacotado não dá aviso nenhum: a tela
 * fica branca, o usuário acha que o app "crashou" e não tem o que contar pra
 * quem for consertar. Aqui o erro vira uma tela legível, com o texto do
 * problema e um botão pra tentar de novo — e vai pro log do Android, que é
 * onde a esteira o encontra.
 *
 * É DOM puro de propósito: se quem quebrou foi o React, não dá pra pedir ao
 * React que desenhe o aviso.
 */

const ID = 'crash-screen'

/**
 * A tela já montou?
 *
 * Antes disso, qualquer erro é fatal na prática: o usuário fica olhando pra
 * nada. Depois, uma promessa rejeitada solta (uma gravação que falhou, um
 * plugin que recusou) é aviso, não motivo pra cobrir o app inteiro com uma
 * tela de erro. Cobrir o app funcionando seria transformar um problema pequeno
 * num grande.
 */
let montou = false

export function marcarPronto(): void {
  montou = true
}

export function showCrash(error: unknown, origem: string): void {
  const mensagem = descrever(error)

  // O log é o que a verificação automática lê depois do app abrir no emulador.
  console.error(`organizador: erro (${origem}) — ${mensagem}`)

  if (document.getElementById(ID)) return

  const tela = document.createElement('div')
  tela.id = ID
  tela.setAttribute('role', 'alert')
  tela.innerHTML = `
    <div class="crash-card">
      <h1>O app tropeçou</h1>
      <p class="crash-sub">Suas anotações continuam salvas no aparelho.</p>
      <pre class="crash-msg"></pre>
      <div class="crash-actions">
        <button type="button" class="crash-reload">Tentar de novo</button>
        <button type="button" class="crash-inicio">Abrir na primeira folha</button>
      </div>
      <p class="crash-foot">Se acontecer de novo, mande este texto pra quem cuida do app.</p>
    </div>
  `
  const pre = tela.querySelector('.crash-msg')
  if (pre) pre.textContent = `${origem}: ${mensagem}`
  tela.querySelector('.crash-reload')?.addEventListener('click', () => window.location.reload())
  /*
   * A saída do laço. O app reabre na última folha; se é ELA que derruba o
   * desenho, "Tentar de novo" cai no mesmo tropeço pra sempre. Esquecer o
   * último lugar abre o app pelo começo — nenhum dado é tocado.
   */
  tela.querySelector('.crash-inicio')?.addEventListener('click', () => {
    savePrefs({ ...loadPrefs(), ultimoLugar: undefined })
    window.location.reload()
  })
  document.body.appendChild(tela)
}

/** Liga os avisos globais. Chamado antes de qualquer outra coisa subir. */
export function installCrashScreen(): void {
  window.addEventListener('error', (event) => {
    showCrash(event.error ?? event.message, 'erro na tela')
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (montou) {
      // App de pé: registra e segue. O marcador é outro de propósito — a
      // verificação da esteira reprova em "erro", não em "aviso".
      console.warn(`organizador: aviso (promessa sem tratamento) — ${descrever(event.reason)}`)
      // Mas falha de GRAVAÇÃO não pode ficar só no registro: a tela mostra o
      // que o banco recusou, e ele precisa saber (faixa vermelha no topo).
      if (ehFalhaDoBanco(event.reason)) avisarFalhaDeGravacao(event.reason)
      return
    }
    showCrash(event.reason, 'promessa sem tratamento')
  })
}

function descrever(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/** Cerca do React: o que estourar no desenho vira tela de tropeço, não tela branca. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { caiu: boolean }> {
  state = { caiu: false }

  static getDerivedStateFromError(): { caiu: boolean } {
    return { caiu: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    showCrash(error, 'erro ao desenhar a tela')
    console.error('organizador: componente', info.componentStack)
  }

  render(): ReactNode {
    // A tela de tropeço já está no DOM, fora do React; aqui só se sai de cena.
    return this.state.caiu ? null : this.props.children
  }
}
