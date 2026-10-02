import { useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { layout } from '../flow/layout'
import type { PlacedNode } from '../flow/layout'
import { rotulo } from '../flow/undo'
import type { Flowchart, FlowColor, FlowShape } from '../domain/types'
import { salvarImagem } from '../audio/export'

/**
 * O fluxograma montado — e o editor dele.
 *
 * O desenho à mão continua na folha, intacto. Aqui está a versão "oficial":
 * caixas do mesmo tamanho, em níveis, com as setas retas — que é o que faz um
 * fluxograma ser lido por outra pessoa em vez de decifrado.
 *
 * É um SVG de verdade, e não uma imagem — e por isso ele é EDITÁVEL aqui:
 * arrastar caixa, ligar uma na outra, acrescentar ramificação, trocar forma,
 * trocar cor, corrigir nome.
 *
 * ## A lógica do painel
 *
 * **Toca pra escolher, arrasta pra mover, e o que dá pra fazer com o escolhido
 * aparece numa barra só.** Nada de modo escondido — a única exceção é "Ligar",
 * que precisa de um segundo toque e por isso avisa na tela o que espera.
 *
 * A lateral e o topo seguem o desenho que o usuário já conhece de um editor de
 * fluxograma (ele mandou a tela do draw.io e pediu "os comandos dessa
 * lateral"): as FORMAS ficam numa lateral, de onde se puxa uma caixa nova; o
 * zoom e o voltar/avançar ficam no topo, junto do resto. A lista de setas
 * também foi pra lateral, e fecha — embaixo da tela ela comia o espaço de
 * mexer no desenho, que é o que o painel existe pra fazer.
 *
 * O botão Salvar transforma em PNG na hora de sair.
 */

const FORMA_NOME: Record<FlowShape, string> = {
  acao: 'Ação',
  decisao: 'Decisão',
  terminal: 'Início / Fim',
  dados: 'Entrada / Saída',
  documento: 'Documento',
  banco: 'Arquivo',
}

/** A ordem da lateral: as três que a leitura conhece primeiro. */
const FORMAS: FlowShape[] = ['acao', 'decisao', 'terminal', 'dados', 'documento', 'banco']

/** A cor que cada forma tem quando o usuário não escolheu nenhuma. */
const COR_DA_FORMA: Record<FlowShape, FlowColor> = {
  acao: 'azul',
  decisao: 'laranja',
  terminal: 'verde',
  dados: 'roxo',
  documento: 'cinza',
  banco: 'cinza',
}

const CORES: Record<FlowColor, { borda: string; fundo: string; nome: string }> = {
  azul: { borda: '#2563eb', fundo: '#eff6ff', nome: 'Azul' },
  verde: { borda: '#059669', fundo: '#ecfdf5', nome: 'Verde' },
  laranja: { borda: '#d97706', fundo: '#fffbeb', nome: 'Laranja' },
  vermelho: { borda: '#dc2626', fundo: '#fef2f2', nome: 'Vermelho' },
  roxo: { borda: '#7c3aed', fundo: '#f5f3ff', nome: 'Roxo' },
  cinza: { borda: '#4b5563', fundo: '#f3f4f6', nome: 'Cinza' },
}

const CORES_LISTA = Object.keys(CORES) as FlowColor[]

/**
 * Quanto o dedo pode escorregar e o toque ainda contar como toque.
 *
 * Medido em píxeis DE TELA, não do desenho. Com o fluxograma reduzido pra
 * caber na largura, seis píxeis de desenho viram dois de dedo — e aí nenhum
 * toque de gente conta como toque: tudo vira arrasto, e a barra de edição
 * nunca abre. Foi o que aconteceu no tablet.
 */
const TOQUE = 14

/**
 * O espaço vazio que a tela tem SEMPRE, além do que o arranjo ocupa.
 *
 * É o que permite arrastar uma caixa pra um canto livre. E ele existir o tempo
 * todo — e não só durante o arrasto — é o que impede o desenho de encolher
 * debaixo do dedo no instante do toque: a régua já era essa antes de o dedo
 * encostar.
 */
const FOLGA = 340

/**
 * Os degraus do zoom.
 *
 * Degraus fixos, e não um pinça contínuo, porque o gesto de pinça no tablet
 * briga com o arrasto da caixa: o mesmo dedo não pode significar as duas
 * coisas. Com degraus, mover e aproximar nunca se confundem.
 */
const ESCALAS = [0.25, 0.4, 0.5, 0.75, 1, 1.5, 2]

const TEXTO = '#111827'
const SETA = '#4b5563'

export function FlowPanel({ chart, onClose }: { chart: Flowchart; onClose: () => void }) {
  const updateFlowNode = useStore((s) => s.updateFlowNode)
  const updateFlowEdge = useStore((s) => s.updateFlowEdge)
  const buildFlowchart = useStore((s) => s.buildFlowchart)
  const flowStatus = useStore((s) => s.flowStatus)

  const addFlowNode = useStore((s) => s.addFlowNode)
  const removeFlowNode = useStore((s) => s.removeFlowNode)
  const addFlowEdge = useStore((s) => s.addFlowEdge)
  const removeFlowEdge = useStore((s) => s.removeFlowEdge)
  const flipFlowEdge = useStore((s) => s.flipFlowEdge)
  const resetFlowLayout = useStore((s) => s.resetFlowLayout)

  const flowHistory = useStore((s) => s.flowHistory)
  const undoFlow = useStore((s) => s.undoFlow)
  const redoFlow = useStore((s) => s.redoFlow)

  /** A caixa escolhida; é dela que a barra de baixo fala. */
  const [escolhida, setEscolhida] = useState<string | null>(null)
  /** Esperando o segundo toque pra fechar uma ligação nova. */
  const [ligandoDe, setLigandoDe] = useState<string | null>(null)
  /** Posição ao vivo durante o arrasto, antes de gravar. */
  const [arrastando, setArrastando] = useState<{ id: string; x: number; y: number } | null>(null)
  /**
   * Tamanho da tela CONGELADO enquanto se arrasta.
   *
   * Sem isto o arrasto entra num laço: a caixa anda pra fora, a tela cresce
   * pra caber, o SVG encolhe pra caber na largura, o mesmo dedo passa a valer
   * mais píxeis de desenho, a caixa anda mais, a tela cresce de novo. O app
   * trava sem fechar. Congelando o tamanho, a régua para de se mexer no meio
   * do movimento — e o desenho se ajusta de uma vez quando o dedo solta.
   *
   * Congela no tamanho que a tela JÁ TEM. A primeira versão congelava num
   * tamanho maior, e o desenho inteiro encolhia no instante do toque: a caixa
   * saía de debaixo do dedo antes do primeiro movimento.
   */
  const [telaCongelada, setTelaCongelada] = useState<{ w: number; h: number } | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [salvo, setSalvo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  /** "Como li": o entendimento desenhado por cima das posições originais. */
  const [comoLi, setComoLi] = useState(false)
  /** Nulo = caber na largura, que é como o painel abre. */
  const [escala, setEscala] = useState<number | null>(null)
  const [lateral, setLateral] = useState(true)
  /** Fechada por padrão: foi ela que estava atrapalhando mexer no desenho. */
  const [setasAbertas, setSetasAbertas] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const telaRef = useRef<HTMLDivElement | null>(null)

  const arranjo = useMemo(
    () =>
      layout({
        // A caixa sendo arrastada entra no arranjo já na posição do dedo: as
        // setas acompanham o movimento, que é o que mostra se o lugar novo
        // deixa o desenho legível ou não.
        nodes: chart.nodes.map((n) =>
          arrastando?.id === n.id ? { ...n, pos: { x: arrastando.x, y: arrastando.y } } : n,
        ),
        edges: chart.edges,
      }),
    [chart.nodes, chart.edges, arrastando],
  )

  const porId = useMemo(
    () => new Map(chart.nodes.map((n) => [n.id, n])),
    [chart.nodes],
  )
  const rotuloDaSeta = useMemo(
    () => new Map(chart.edges.map((e) => [e.id, e.label])),
    [chart.edges],
  )

  const larguraTela = telaCongelada?.w ?? arranjo.width + FOLGA
  const alturaTela = telaCongelada?.h ?? arranjo.height + FOLGA

  const paraVoltar = flowHistory.chartId === chart.id ? flowHistory.feitos.at(-1) : undefined
  const paraAvancar = flowHistory.chartId === chart.id ? flowHistory.desfeitos.at(-1) : undefined

  const abrirEdicao = (id: string, atual: string) => {
    setEditando(id)
    setRascunho(atual)
  }

  const fecharEdicao = () => {
    if (!editando) return
    const alvo = editando
    setEditando(null)
    if (alvo.startsWith('seta:')) {
      void updateFlowEdge(chart.id, alvo.slice(5), { label: rascunho.trim() })
    } else {
      void updateFlowNode(chart.id, alvo, { label: rascunho.trim() })
    }
  }

  /**
   * Converte um ponto da TELA pro sistema do desenho.
   *
   * Sem isto o arrasto anda numa velocidade diferente do dedo, porque o SVG é
   * escalado pra caber na tela — e a caixa foge da mão.
   */
  const daTela = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = svg.createSVGPoint()
    p.x = clientX
    p.y = clientY
    const d = p.matrixTransform(ctm.inverse())
    return { x: d.x, y: d.y }
  }

  /**
   * Toque na caixa: escolhe, liga ou começa a arrastar.
   *
   * O arrasto e o toque entram pelo mesmo gesto, de propósito: separá-los em
   * dois modos obrigaria a escolher o modo antes de saber o que se quer fazer.
   * Quem solta sem andar escolheu; quem andou, moveu.
   */
  const pegarCaixa = (e: React.PointerEvent, posto: PlacedNode) => {
    e.stopPropagation()

    if (ligandoDe) {
      if (ligandoDe !== posto.id) void addFlowEdge(chart.id, ligandoDe, posto.id)
      setLigandoDe(null)
      setEscolhida(posto.id)
      return
    }

    // Onde o dedo encostou, em píxeis de TELA — é por esta medida que se
    // decide se foi toque ou arrasto.
    const naTela = { x: e.clientX, y: e.clientY }
    setTelaCongelada({ w: larguraTela, h: alturaTela })
    const alvo = e.currentTarget as unknown as HTMLElement
    try {
      // Captura: sem ela o dedo que sai de cima da caixa larga o arrasto no
      // meio. Com ela, o movimento continua chegando até soltar.
      alvo.setPointerCapture(e.pointerId)
    } catch {
      // Ponteiro já encerrado (ou sintético): o arrasto segue sem captura.
    }
    let andou = false
    let deslocamento = { x: 0, y: 0 }

    const mover = (evento: Event) => {
      const ev = evento as PointerEvent
      const d = daTela(ev.clientX, ev.clientY)
      if (!d) return
      if (!andou && Math.hypot(ev.clientX - naTela.x, ev.clientY - naTela.y) < TOQUE) return
      if (!andou) {
        andou = true
        /*
         * A distância entre o dedo e o canto da caixa é medida AGORA, no
         * primeiro movimento, com a régua que está valendo — e não no toque,
         * antes de a tela congelar. Medir antes e usar depois foi o que fazia a
         * caixa pular pra longe da mão assim que o dedo andava.
         */
        const inicio = daTela(naTela.x, naTela.y)
        if (inicio) deslocamento = { x: inicio.x - posto.x, y: inicio.y - posto.y }
      }
      const x = d.x - deslocamento.x
      const y = d.y - deslocamento.y
      setArrastando({ id: posto.id, x: Math.max(0, x), y: Math.max(0, y) })
    }

    const desligar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
      alvo.removeEventListener('pointercancel', abandonar)
      // Rede de segurança: se o dedo sair da caixa e soltar fora dela, é a
      // janela que avisa. Sem isto a caixa fica grudada no dedo pra sempre.
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', abandonar)
      setTelaCongelada(null)
    }

    const soltar = () => {
      desligar()
      setArrastando((atual) => {
        if (atual && atual.id === posto.id) {
          void updateFlowNode(chart.id, posto.id, { pos: { x: atual.x, y: atual.y } })
        }
        return null
      })
      if (!andou) setEscolhida((atual) => (atual === posto.id ? null : posto.id))
    }

    /**
     * Gesto interrompido: a caixa volta pro lugar, sem gravar nada.
     *
     * `pointercancel` é o navegador dizendo "este gesto agora é meu" (ou o
     * sistema interrompendo). Gravar onde a caixa parou nessas horas é o pior
     * dos dois mundos: o arrasto não aconteceu E a caixa saiu do lugar um
     * tiquinho. Era o que acontecia quando o navegador roubava o gesto.
     */
    const abandonar = () => {
      desligar()
      setArrastando(null)
    }

    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
    alvo.addEventListener('pointercancel', abandonar)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', abandonar)
  }

  /**
   * Arrastar o FUNDO passeia pelo desenho.
   *
   * Existe porque o `touch-action: none` do SVG tirou do navegador a rolagem
   * com o dedo — e tinha que tirar, senão ele rouba o gesto da caixa. Quem
   * rola passa a ser o painel: dedo no vazio, o desenho anda junto. É o que
   * todo editor de fluxograma faz, e é o único jeito de alcançar o resto de um
   * desenho grande com a caneta.
   */
  const passear = (e: React.PointerEvent) => {
    const tela = telaRef.current
    if (!tela) return
    const inicio = {
      x: e.clientX,
      y: e.clientY,
      left: tela.scrollLeft,
      top: tela.scrollTop,
    }
    const alvo = e.currentTarget as unknown as HTMLElement
    try {
      alvo.setPointerCapture(e.pointerId)
    } catch {
      // Segue sem captura.
    }

    const mover = (evento: Event) => {
      const ev = evento as PointerEvent
      tela.scrollLeft = inicio.left - (ev.clientX - inicio.x)
      tela.scrollTop = inicio.top - (ev.clientY - inicio.y)
    }

    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
      alvo.removeEventListener('pointercancel', soltar)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }

    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
    alvo.addEventListener('pointercancel', soltar)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
  }

  /** Cria a caixa num canto livre, embaixo de tudo, e já a deixa escolhida. */
  const novaCaixa = async (kind: FlowShape) => {
    const abaixo = Math.max(0, ...arranjo.nodes.map((n) => n.y + n.h)) + 40
    const id = await addFlowNode(chart.id, { x: 60, y: abaixo }, kind)
    if (id) setEscolhida(id)
  }

  /**
   * Um degrau de zoom pra cada lado.
   *
   * O degrau é escolhido a partir do tamanho que o desenho ESTÁ, medido na
   * tela — e não a partir do último número escolhido. Em "Caber" não existe
   * número nenhum, e supor um fazia o botão mentir: num fluxograma pequeno, que
   * já cabia em tamanho real, apertar + não mudava nada.
   */
  const mudarZoom = (passo: 1 | -1) => {
    const svg = svgRef.current
    const agora = svg ? svg.getBoundingClientRect().width / larguraTela : (escala ?? 1)
    const proximo =
      passo > 0
        ? ESCALAS.find((e) => e > agora * 1.02)
        : [...ESCALAS].reverse().find((e) => e < agora * 0.98)
    setEscala(proximo ?? (passo > 0 ? ESCALAS[ESCALAS.length - 1] : ESCALAS[0]))
  }

  const salvar = async () => {
    setErro(null)
    setSalvo(null)
    setSalvando(true)
    try {
      const png = await paraPng(svgRef.current, arranjo.width, arranjo.height)
      const { onde } = await salvarImagem(png, `Fluxograma ${carimbo(chart.updatedAt)}.png`)
      setSalvo(onde)
    } catch (err) {
      setErro(err instanceof Error && err.message ? err.message : 'Não deu pra salvar a imagem.')
    } finally {
      setSalvando(false)
    }
  }

  const semNome = chart.nodes.filter((n) => !n.label).length
  const porOrdem = chart.edges.filter((e) => e.direcao === 'ordem').length

  return (
    <div className="flow-panel" role="dialog" aria-label="Fluxograma montado">
      <header className="flow-topo">
        <div className="flow-titulo">
          <button
            className="flow-rail"
            onClick={() => setLateral((v) => !v)}
            aria-label={lateral ? 'Esconder a lateral' : 'Mostrar a lateral'}
            title={lateral ? 'Esconder a lateral' : 'Mostrar as formas e as setas'}
          >
            ☰
          </button>
          <div>
            <h2>Fluxograma</h2>
            <p className="muted">
              {chart.nodes.length} caixa{chart.nodes.length === 1 ? '' : 's'} ·{' '}
              {chart.edges.length} liga{chart.edges.length === 1 ? 'ção' : 'ções'}
              {chart.soltos > 0 && ` · ${chart.soltos} traço(s) de fora`}
            </p>
          </div>
        </div>
        <div className="flow-acoes">
          {/* Voltar e avançar: os mesmos ↶ ↷ da tinta, porque significam a
              mesma coisa — desfazer o último passo do que está aberto. */}
          <div className="flow-grupo">
            <button
              onClick={() => void undoFlow(chart.id)}
              disabled={!paraVoltar}
              aria-label="Voltar"
              title={paraVoltar ? `Voltar: ${rotulo(paraVoltar, chart)}` : 'Nada pra voltar'}
            >
              ↶
            </button>
            <button
              onClick={() => void redoFlow(chart.id)}
              disabled={!paraAvancar}
              aria-label="Avançar"
              title={paraAvancar ? `Avançar: ${rotulo(chart, paraAvancar)}` : 'Nada pra avançar'}
            >
              ↷
            </button>
          </div>

          <div className="flow-grupo">
            <button onClick={() => mudarZoom(-1)} aria-label="Afastar" title="Afastar">
              −
            </button>
            <button
              className="flow-zoom"
              onClick={() => setEscala(null)}
              title="Voltar a caber na largura"
            >
              {escala === null ? 'Caber' : `${Math.round(escala * 100)}%`}
            </button>
            <button onClick={() => mudarZoom(1)} aria-label="Aproximar" title="Aproximar">
              +
            </button>
          </div>

          {/* O desenho montado mostra o RESULTADO; este modo mostra o
              ENTENDIMENTO, nas posições onde o usuário desenhou. É a única
              vista em que dá pra ver qual seta grudou em qual caixa — e um
              print dela diz, de uma vez, onde a leitura se perdeu. */}
          <button
            className={comoLi ? 'flow-salvar' : ''}
            onClick={() => setComoLi((v) => !v)}
            title="Mostra o que o app entendeu, por cima de onde você desenhou"
          >
            {comoLi ? '▦ Ver montado' : '◉ Como eu li'}
          </button>
          <button
            onClick={() => void resetFlowLayout(chart.id)}
            title="Esquece as posições arrastadas e arruma tudo sozinho de novo"
          >
            ⇵ Arrumar
          </button>
          <button onClick={() => void buildFlowchart()} disabled={flowStatus.state === 'lendo'}>
            {flowStatus.state === 'lendo' ? 'Lendo…' : '↻ Ler de novo'}
          </button>
          <button className="flow-salvar" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : '⤓ Salvar imagem'}
          </button>
          <button className="panel-close" onClick={onClose}>
            Voltar à folha
          </button>
        </div>
      </header>

      {/* O que o leitor não teve certeza fica dito, não escondido: é por aqui
          que o usuário sabe o que conferir antes de mandar o desenho adiante. */}
      {(semNome > 0 || porOrdem > 0 || chart.soltos > 0) && (
        <div className="flow-avisos">
          {semNome > 0 && (
            <span>
              {semNome} caixa(s) sem nome — toque na caixa pra escrever.
            </span>
          )}
          {porOrdem > 0 && (
            <span>
              {porOrdem} seta(s) sem ponta desenhada: a direção veio da ordem em que você fez o
              traço. Confira se apontam pro lado certo.
            </span>
          )}
          {chart.soltos > 0 && (
            <span>
              {chart.soltos} traço(s) não entraram: caixa que não fechou, ou seta que não encostou
              nas duas pontas.
            </span>
          )}
        </div>
      )}

      {/* O que a leitura viu, sempre à vista. Quando algo não sai como o
          usuário esperava, estes números dizem ONDE parou — sem eles, a
          conversa vira adivinhação de parte a parte. */}
      {chart.diagnostico && (
        <div className="flow-diag">
          <strong>Leitura:</strong> {chart.diagnostico.tracos} traços ·{' '}
          {chart.diagnostico.fechados} caixas de um traço só ·{' '}
          {chart.diagnostico.juntados} montadas juntando lados ·{' '}
          {chart.diagnostico.setas} setas · {chart.diagnostico.letra} traços de letra ·{' '}
          {chart.diagnostico.soltos} de fora
        </div>
      )}

      {/* Os nomes chegam depois do desenho, um por um. Enquanto chegam, a
          tela diz — mas o fluxograma já está montado atrás. */}
      {flowStatus.state === 'lendo' && flowStatus.message && (
        <div className="flow-lendo">{flowStatus.message}</div>
      )}
      {flowStatus.state === 'parado' && flowStatus.message && (
        <div className="flow-diag">{flowStatus.message}</div>
      )}

      {erro && <div className="flow-erro">{erro}</div>}
      {salvo && <div className="flow-salvo">✓ Salvo — {salvo}</div>}
      {flowStatus.state === 'erro' && <div className="flow-erro">{flowStatus.message}</div>}

      <div className="flow-corpo">
        {lateral && (
          <aside className="flow-lateral">
            <h3>Formas</h3>
            <div className="flow-paleta">
              {FORMAS.map((f) => (
                <button key={f} onClick={() => void novaCaixa(f)} title={`Nova: ${FORMA_NOME[f]}`}>
                  <svg viewBox="0 0 54 34" width="54" height="34" aria-hidden="true">
                    <Forma
                      kind={f}
                      x={3}
                      y={3}
                      w={48}
                      h={28}
                      fill={CORES[COR_DA_FORMA[f]].fundo}
                      stroke={CORES[COR_DA_FORMA[f]].borda}
                    />
                  </svg>
                  <span>{FORMA_NOME[f]}</span>
                </button>
              ))}
            </div>

            {/* As setas: nome, inverter e tirar. Ficam numa lista porque uma
                seta é fina demais pra ser um alvo de toque honesto num tablet
                — e a lista FECHA, porque aberta ela toma a tela de quem está
                mexendo nas caixas. */}
            <button className="flow-secao" onClick={() => setSetasAbertas((v) => !v)}>
              {setasAbertas ? '▾' : '▸'} Setas ({chart.edges.length})
            </button>
            {setasAbertas && (
              <div className="flow-setas">
                {chart.edges.length === 0 && <p className="muted">Nenhuma ainda.</p>}
                {chart.edges.map((e) => (
                  <div key={e.id} className="flow-seta-item">
                    <button
                      className="flow-seta-nome"
                      onClick={() => abrirEdicao(`seta:${e.id}`, e.label)}
                    >
                      {porId.get(e.from)?.label || 'caixa'} → {porId.get(e.to)?.label || 'caixa'}
                      {e.label ? `: ${e.label}` : ''}
                    </button>
                    <button
                      className="flow-seta-acao"
                      onClick={() => void flipFlowEdge(chart.id, e.id)}
                      title="Inverter o sentido desta seta"
                    >
                      ⇄
                    </button>
                    <button
                      className="flow-seta-acao"
                      onClick={() => void removeFlowEdge(chart.id, e.id)}
                      title="Tirar esta ligação"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}

        <div className="flow-tela" ref={telaRef}>
          {comoLi ? (
            // Passeia também aqui: o `touch-action: none` vale pros dois
            // desenhos, e sem isto esta vista ficaria sem como rolar.
            <ComoLi chart={chart} onPointerDown={passear} />
          ) : (
            <svg
              ref={svgRef}
              className="flow-svg"
              onPointerDown={passear}
              viewBox={`0 0 ${larguraTela} ${alturaTela}`}
              width={escala ? larguraTela * escala : larguraTela}
              height={escala ? alturaTela * escala : alturaTela}
              // Com zoom escolhido o desenho passa da largura do painel de
              // propósito: é a tela que rola. Em "Caber", o navegador reduz.
              style={escala ? { maxWidth: 'none' } : undefined}
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x={0} y={0} width={larguraTela} height={alturaTela} fill="#ffffff" />

              <defs>
                <marker
                  id="ponta"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={SETA} />
                </marker>
              </defs>

              {arranjo.edges.map((e) => {
                if (e.points.length < 2) return null
                const d = e.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
                const meio = e.points[Math.floor(e.points.length / 2)]
                const texto = rotuloDaSeta.get(e.id) ?? ''
                return (
                  <g key={e.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={SETA}
                      strokeWidth={2}
                      strokeDasharray={e.retorno ? '7 5' : undefined}
                      markerEnd="url(#ponta)"
                    />
                    {texto && (
                      <>
                        <rect
                          x={meio.x - texto.length * 4 - 6}
                          y={meio.y - 11}
                          width={texto.length * 8 + 12}
                          height={20}
                          rx={5}
                          fill="#ffffff"
                          stroke="#e5e7eb"
                        />
                        <text
                          x={meio.x}
                          y={meio.y + 4}
                          textAnchor="middle"
                          fontSize={13}
                          fill={SETA}
                          fontFamily="system-ui, sans-serif"
                        >
                          {texto}
                        </text>
                      </>
                    )}
                  </g>
                )
              })}

              {arranjo.nodes.map((n) => {
                const dado = porId.get(n.id)
                if (!dado) return null
                return (
                  <Caixa
                    key={n.id}
                    posto={n}
                    label={dado.label}
                    cor={dado.cor}
                    escolhida={escolhida === n.id || ligandoDe === n.id}
                    ligando={!!ligandoDe}
                    onPointerDown={(e) => pegarCaixa(e, n)}
                  />
                )
              })}
            </svg>
          )}
        </div>
      </div>

      {/* Editar no lugar: um campo sobre o desenho, não outra tela. */}
      {editando && (
        <div className="flow-editor">
          <label>
            <span>{editando.startsWith('seta:') ? 'Nome da seta' : 'Nome da caixa'}</span>
            <input
              autoFocus
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fecharEdicao()
                if (e.key === 'Escape') setEditando(null)
              }}
            />
          </label>
          <button className="flow-ok" onClick={fecharEdicao}>
            Pronto
          </button>
        </div>
      )}

      {/*
        A barra do que está escolhido.

        Tudo que dá pra fazer com a caixa escolhida mora aqui, numa linha só —
        nada de menu escondido nem de modo que se liga antes de saber o que se
        quer. "Ligar" é a única ação de dois tempos, e por isso ela se anuncia.
      */}
      {!editando && escolhida && porId.get(escolhida) && (
        <div className="flow-barra">
          <button
            className="flow-ok"
            onClick={() => abrirEdicao(escolhida, porId.get(escolhida)?.label ?? '')}
          >
            ✎ Nome
          </button>

          <div className="flow-formas">
            {FORMAS.map((f) => (
              <button
                key={f}
                className={porId.get(escolhida)?.kind === f ? 'ativo' : ''}
                onClick={() => void updateFlowNode(chart.id, escolhida, { kind: f })}
                title={FORMA_NOME[f]}
                aria-label={FORMA_NOME[f]}
              >
                <svg viewBox="0 0 38 24" width="38" height="24" aria-hidden="true">
                  <Forma kind={f} x={2} y={2} w={34} h={20} fill="none" stroke="currentColor" />
                </svg>
              </button>
            ))}
          </div>

          <div className="flow-cores">
            {CORES_LISTA.map((c) => (
              <button
                key={c}
                className={`flow-cor ${porId.get(escolhida)?.cor === c ? 'ativo' : ''}`}
                style={{ background: CORES[c].fundo, borderColor: CORES[c].borda }}
                onClick={() => void updateFlowNode(chart.id, escolhida, { cor: c })}
                aria-label={CORES[c].nome}
                title={CORES[c].nome}
              />
            ))}
          </div>

          <button
            className={ligandoDe ? 'flow-ok' : ''}
            onClick={() => setLigandoDe(ligandoDe ? null : escolhida)}
          >
            {ligandoDe ? '✕ Cancelar ligação' : '→ Ligar a…'}
          </button>

          <button
            onClick={() => {
              void removeFlowNode(chart.id, escolhida)
              setEscolhida(null)
            }}
            title="Tira a caixa do fluxograma; o desenho na folha continua lá"
          >
            ␡ Tirar
          </button>
        </div>
      )}

      {ligandoDe && (
        <div className="flow-lendo">
          Toque na caixa de destino pra fechar a ligação.
        </div>
      )}
    </div>
  )
}

/**
 * O contorno de cada forma, num lugar só.
 *
 * Serve ao desenho e aos botõezinhos da lateral pela mesma função, de
 * propósito: se o ícone fosse desenhado à parte, o dia em que uma forma mudasse
 * o botão continuaria prometendo a antiga.
 */
function Forma({
  kind,
  x,
  y,
  w,
  h,
  fill,
  stroke,
}: {
  kind: FlowShape
  x: number
  y: number
  w: number
  h: number
  fill: string
  stroke: string
}) {
  const cx = x + w / 2
  const cy = y + h / 2

  if (kind === 'decisao') {
    return (
      <polygon
        points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
    )
  }

  if (kind === 'dados') {
    // Paralelogramo: entrada e saída de dados, na convenção de fluxograma.
    const inclina = Math.min(24, w * 0.18)
    return (
      <polygon
        points={`${x + inclina},${y} ${x + w},${y} ${x + w - inclina},${y + h} ${x},${y + h}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
    )
  }

  if (kind === 'documento') {
    // Base ondulada: a folha impressa.
    const base = y + h - Math.min(16, h * 0.2)
    const onda = Math.min(22, h * 0.26)
    return (
      <path
        d={
          `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${base} ` +
          `C ${x + w * 0.72} ${base + onda}, ${x + w * 0.28} ${base - onda}, ${x} ${base} Z`
        }
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
    )
  }

  if (kind === 'banco') {
    // Cilindro: arquivo, banco de dados, pilha de papel — o que fica guardado.
    const r = Math.min(13, h * 0.17)
    return (
      <g>
        <path
          d={
            `M ${x} ${y + r} A ${w / 2} ${r} 0 0 1 ${x + w} ${y + r} ` +
            `L ${x + w} ${y + h - r} A ${w / 2} ${r} 0 0 1 ${x} ${y + h - r} Z`
          }
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
        {/* A boca do cilindro: sem ela o desenho vira só um retângulo gordo. */}
        <path
          d={`M ${x} ${y + r} A ${w / 2} ${r} 0 0 0 ${x + w} ${y + r}`}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
        />
      </g>
    )
  }

  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      // Início e fim são a caixa de cantos redondos da convenção.
      rx={kind === 'terminal' ? h / 2 : Math.min(10, h * 0.3)}
      fill={fill}
      stroke={stroke}
      strokeWidth={2}
    />
  )
}

/**
 * O que o app entendeu, desenhado onde o usuário desenhou.
 *
 * Cada caixa sai numerada, na posição e no tamanho em que foi reconhecida, e
 * cada ligação sai como uma seta de centro a centro. Comparando com a folha,
 * vê-se na hora qual seta grudou na caixa errada, qual caixa não foi vista e
 * qual foi vista onde não havia nada.
 *
 * Nasceu de uma série de rodadas em que os números diziam QUE a leitura errava
 * mas não ONDE — e um print desta tela responde isso de uma vez.
 */
function ComoLi({
  chart,
  onPointerDown,
}: {
  chart: Flowchart
  onPointerDown: (e: React.PointerEvent) => void
}) {
  if (chart.nodes.length === 0) return null

  const minX = Math.min(...chart.nodes.map((n) => n.bounds.minX))
  const minY = Math.min(...chart.nodes.map((n) => n.bounds.minY))
  const maxX = Math.max(...chart.nodes.map((n) => n.bounds.maxX))
  const maxY = Math.max(...chart.nodes.map((n) => n.bounds.maxY))
  const folga = 60
  const w = maxX - minX + folga * 2
  const h = maxY - minY + folga * 2

  const numero = new Map(chart.nodes.map((n, i) => [n.id, i + 1]))
  const centro = (id: string) => {
    const n = chart.nodes.find((x) => x.id === id)
    if (!n) return null
    return { x: (n.bounds.minX + n.bounds.maxX) / 2, y: (n.bounds.minY + n.bounds.maxY) / 2 }
  }

  return (
    <svg
      className="flow-svg"
      onPointerDown={onPointerDown}
      viewBox={`${minX - folga} ${minY - folga} ${w} ${h}`}
      width={w}
      height={h}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={minX - folga} y={minY - folga} width={w} height={h} fill="#ffffff" />
      <defs>
        <marker
          id="pontaLi"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
        </marker>
      </defs>

      {chart.edges.map((e) => {
        const de = centro(e.from)
        const para = centro(e.to)
        if (!de || !para) return null
        return (
          <line
            key={e.id}
            x1={de.x}
            y1={de.y}
            x2={para.x}
            y2={para.y}
            stroke="#dc2626"
            strokeWidth={3}
            markerEnd="url(#pontaLi)"
          />
        )
      })}

      {chart.nodes.map((n) => (
        <g key={n.id}>
          <rect
            x={n.bounds.minX}
            y={n.bounds.minY}
            width={Math.max(1, n.bounds.maxX - n.bounds.minX)}
            height={Math.max(1, n.bounds.maxY - n.bounds.minY)}
            fill="rgba(37, 99, 235, 0.08)"
            stroke="#2563eb"
            strokeWidth={2}
          />
          <circle cx={n.bounds.minX + 16} cy={n.bounds.minY + 16} r={15} fill="#2563eb" />
          <text
            x={n.bounds.minX + 16}
            y={n.bounds.minY + 22}
            textAnchor="middle"
            fontSize={17}
            fontWeight="700"
            fill="#ffffff"
            fontFamily="system-ui, sans-serif"
          >
            {numero.get(n.id)}
          </text>
        </g>
      ))}
    </svg>
  )
}

function Caixa({
  posto,
  label,
  cor: corEscolhida,
  escolhida,
  ligando,
  onPointerDown,
}: {
  posto: PlacedNode
  label: string
  cor?: FlowColor
  escolhida: boolean
  ligando: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const cor = CORES[corEscolhida ?? COR_DA_FORMA[posto.kind]]
  const cx = posto.x + posto.w / 2
  const cy = posto.y + posto.h / 2 + (posto.kind === 'documento' ? -6 : 0)
  const linhas = quebrar(label || '…', posto.kind === 'decisao' ? 18 : 24)

  return (
    <g
      className="flow-caixa"
      data-id={posto.id}
      onPointerDown={onPointerDown}
      /*
       * Repare que NÃO tem `touch-action` aqui.
       *
       * Tinha, e não servia pra nada: o navegador ignora `touch-action` em
       * elemento de dentro de um SVG, que não tem caixa de layout própria. A
       * declaração que vale está no `<svg>` inteiro, no CSS — e foi a falta
       * dela que fez o arrasto com a caneta não funcionar.
       */
      style={{ cursor: ligando ? 'crosshair' : 'move' }}
    >
      {/* O realce da escolhida fica POR BAIXO, pra não cobrir o nome. */}
      {escolhida && (
        <rect
          x={posto.x - 7}
          y={posto.y - 7}
          width={posto.w + 14}
          height={posto.h + 14}
          rx={14}
          fill="none"
          stroke={ligando ? '#dc2626' : '#111827'}
          strokeWidth={3}
          strokeDasharray={ligando ? '8 5' : undefined}
        />
      )}
      <Forma
        kind={posto.kind}
        x={posto.x}
        y={posto.y}
        w={posto.w}
        h={posto.h}
        fill={cor.fundo}
        stroke={cor.borda}
      />
      {linhas.map((linha, i) => (
        <text
          key={i}
          x={cx}
          y={cy + (i - (linhas.length - 1) / 2) * 18 + 5}
          textAnchor="middle"
          fontSize={15}
          fill={label ? TEXTO : '#9ca3af'}
          fontFamily="system-ui, sans-serif"
        >
          {linha}
        </text>
      ))}
    </g>
  )
}

/** Quebra o nome em linhas que caibam na caixa, sem partir palavra no meio. */
function quebrar(texto: string, limite: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return ['…']
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) {
    if (!atual) atual = p
    else if (atual.length + 1 + p.length <= limite) atual += ` ${p}`
    else {
      linhas.push(atual)
      atual = p
    }
  }
  if (atual) linhas.push(atual)
  return linhas.slice(0, 3)
}

function carimbo(instante: number): string {
  return new Date(instante)
    .toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(/[/:]/g, '-')
}

/**
 * O SVG vira PNG.
 *
 * Por que PNG e não o próprio SVG: o arquivo vai ser aberto por outra pessoa,
 * provavelmente no celular, e PNG abre em qualquer lugar. SVG abriria numa
 * tela de código em metade dos aparelhos.
 *
 * Três detalhes que, faltando, dão uma imagem errada sem erro nenhum: o SVG
 * precisa ir com o namespace declarado; o fundo precisa ser pintado — PNG
 * transparente vira um borrão preto em qualquer visualizador escuro; e a cópia
 * precisa ganhar a MOLDURA DO DESENHO no lugar da tela de trabalho, senão a
 * imagem salva sai com a folga de arrastar e o zoom escolhido grudados nela.
 */
async function paraPng(svg: SVGSVGElement | null, largura: number, altura: number): Promise<Blob> {
  if (!svg) throw new Error('O desenho ainda não está pronto.')

  const copia = svg.cloneNode(true) as SVGSVGElement
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copia.setAttribute('viewBox', `0 0 ${largura} ${altura}`)
  copia.setAttribute('width', String(largura))
  copia.setAttribute('height', String(altura))
  copia.removeAttribute('style')
  const texto = new XMLSerializer().serializeToString(copia)
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`

  const escala = 2 // pra não sair borrado quando alguém der zoom
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(largura * escala))
  canvas.height = Math.max(1, Math.round(altura * escala))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não consegui preparar a imagem.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve()
    }
    img.onerror = () => reject(new Error('Não consegui desenhar a imagem.'))
    img.src = url
  })

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('A imagem saiu vazia.'))),
      'image/png',
    )
  })
}
