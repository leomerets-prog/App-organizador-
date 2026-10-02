import { useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { layout } from '../flow/layout'
import type { PlacedNode } from '../flow/layout'
import type { Flowchart, FlowColor, FlowShape } from '../domain/types'
import { salvarImagem } from '../audio/export'

/**
 * O fluxograma montado.
 *
 * O desenho à mão continua na folha, intacto. Aqui está a versão "oficial":
 * caixas do mesmo tamanho, em níveis, com as setas retas — que é o que faz um
 * fluxograma ser lido por outra pessoa em vez de decifrado.
 *
 * É um SVG de verdade, e não uma imagem — e por isso ele é EDITÁVEL aqui:
 * arrastar caixa, ligar uma na outra, acrescentar ramificação, trocar forma,
 * trocar cor, corrigir nome. O arranjo automático acerta a estrutura; quem
 * sabe o que fica bem ao lado de quê é quem desenhou.
 *
 * A lógica do painel cabe numa frase: **toca pra escolher, arrasta pra mover,
 * e o que dá pra fazer com o escolhido aparece numa barra só.** Nada de modo
 * escondido — a única exceção é "Ligar", que precisa de um segundo toque e
 * por isso avisa na tela o que está esperando.
 *
 * O botão Salvar transforma em PNG na hora de sair.
 */

const FORMA_NOME: Record<FlowShape, string> = {
  acao: 'Ação',
  decisao: 'Decisão',
  terminal: 'Início / Fim',
}

/** A cor que cada forma tem quando o usuário não escolheu nenhuma. */
const COR_DA_FORMA: Record<FlowShape, FlowColor> = {
  acao: 'azul',
  decisao: 'laranja',
  terminal: 'verde',
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

/** Quanto o dedo pode escorregar e o toque ainda contar como toque. */
const TOQUE = 6

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

  /** A caixa escolhida; é dela que a barra de baixo fala. */
  const [escolhida, setEscolhida] = useState<string | null>(null)
  /** Esperando o segundo toque pra fechar uma ligação nova. */
  const [ligandoDe, setLigandoDe] = useState<string | null>(null)
  /** Posição ao vivo durante o arrasto, antes de gravar. */
  const [arrastando, setArrastando] = useState<{ id: string; x: number; y: number } | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [salvo, setSalvo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  /** "Como li": o entendimento desenhado por cima das posições originais. */
  const [comoLi, setComoLi] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

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
  const paraDesenho = (e: React.PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = svg.createSVGPoint()
    p.x = e.clientX
    p.y = e.clientY
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

    const inicio = paraDesenho(e)
    if (!inicio) return
    const deslocamento = { x: inicio.x - posto.x, y: inicio.y - posto.y }
    const alvo = e.currentTarget as unknown as HTMLElement
    try {
      // Captura: sem ela o dedo que sai de cima da caixa larga o arrasto no
      // meio. Com ela, o movimento continua chegando até soltar.
      alvo.setPointerCapture(e.pointerId)
    } catch {
      // Ponteiro já encerrado (ou sintético): o arrasto segue sem captura.
    }
    let andou = false

    const mover = (evento: Event) => {
      const ev = evento as PointerEvent
      const svg = svgRef.current
      const ctm = svg?.getScreenCTM()
      if (!svg || !ctm) return
      const p = svg.createSVGPoint()
      p.x = ev.clientX
      p.y = ev.clientY
      const d = p.matrixTransform(ctm.inverse())
      const x = d.x - deslocamento.x
      const y = d.y - deslocamento.y
      if (!andou && Math.hypot(x - posto.x, y - posto.y) < TOQUE) return
      andou = true
      setArrastando({ id: posto.id, x: Math.max(0, x), y: Math.max(0, y) })
    }

    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
      alvo.removeEventListener('pointercancel', soltar)
      setArrastando((atual) => {
        if (atual && atual.id === posto.id) {
          void updateFlowNode(chart.id, posto.id, { pos: { x: atual.x, y: atual.y } })
        }
        return null
      })
      if (!andou) setEscolhida((atual) => (atual === posto.id ? null : posto.id))
    }

    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
    alvo.addEventListener('pointercancel', soltar)
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
        <div>
          <h2>Fluxograma</h2>
          <p className="muted">
            {chart.nodes.length} caixa{chart.nodes.length === 1 ? '' : 's'} ·{' '}
            {chart.edges.length} liga{chart.edges.length === 1 ? 'ção' : 'ções'}
            {chart.soltos > 0 && ` · ${chart.soltos} traço(s) de fora`}
          </p>
        </div>
        <div className="flow-acoes">
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
            onClick={() => {
              // Nasce num canto livre, abaixo de tudo: achar uma caixa nova
              // que apareceu embaixo é mais fácil que achar uma que nasceu
              // por cima de outra.
              const abaixo = Math.max(0, ...arranjo.nodes.map((n) => n.y + n.h)) + 40
              void addFlowNode(chart.id, { x: 60, y: abaixo })
            }}
            title="Cria uma caixa nova, pra acrescentar um passo que não está no desenho"
          >
            + Caixa
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

      <div className="flow-tela">
        {comoLi ? (
          <ComoLi chart={chart} />
        ) : (
        <svg
          ref={svgRef}
          className="flow-svg"
          viewBox={`0 0 ${arranjo.width} ${arranjo.height}`}
          width={arranjo.width}
          height={arranjo.height}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x={0} y={0} width={arranjo.width} height={arranjo.height} fill="#ffffff" />

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
          {!editando.startsWith('seta:') && (
            <div className="flow-formas">
              {(Object.keys(FORMA_NOME) as FlowShape[]).map((f) => (
                <button
                  key={f}
                  className={porId.get(editando)?.kind === f ? 'ativo' : ''}
                  onClick={() => void updateFlowNode(chart.id, editando, { kind: f })}
                >
                  {FORMA_NOME[f]}
                </button>
              ))}
            </div>
          )}
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
            {(Object.keys(FORMA_NOME) as FlowShape[]).map((f) => (
              <button
                key={f}
                className={porId.get(escolhida)?.kind === f ? 'ativo' : ''}
                onClick={() => void updateFlowNode(chart.id, escolhida, { kind: f })}
                title={FORMA_NOME[f]}
              >
                {FORMA_NOME[f]}
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

      {/* As setas: nome, inverter e tirar. Ficam numa lista porque uma seta é
          fina demais pra ser um alvo de toque honesto num tablet. */}
      {!editando && !escolhida && chart.edges.length > 0 && (
        <div className="flow-setas">
          <span className="muted">Setas:</span>
          {chart.edges.map((e) => (
            <span key={e.id} className="flow-seta-item">
              <button onClick={() => abrirEdicao(`seta:${e.id}`, e.label)}>
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
            </span>
          ))}
        </div>
      )}

    </div>
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
function ComoLi({ chart }: { chart: Flowchart }) {
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
  const cy = posto.y + posto.h / 2
  const linhas = quebrar(label || '…', posto.kind === 'decisao' ? 18 : 24)

  return (
    <g
      className="flow-caixa"
      onPointerDown={onPointerDown}
      style={{ cursor: ligando ? 'crosshair' : 'move', touchAction: 'none' }}
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
      {posto.kind === 'decisao' ? (
        <polygon
          points={`${cx},${posto.y} ${posto.x + posto.w},${cy} ${cx},${posto.y + posto.h} ${posto.x},${cy}`}
          fill={cor.fundo}
          stroke={cor.borda}
          strokeWidth={2}
        />
      ) : (
        <rect
          x={posto.x}
          y={posto.y}
          width={posto.w}
          height={posto.h}
          // Início e fim são a caixa de cantos redondos da convenção.
          rx={posto.kind === 'terminal' ? posto.h / 2 : 10}
          fill={cor.fundo}
          stroke={cor.borda}
          strokeWidth={2}
        />
      )}
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
 * Dois detalhes que, faltando, dão uma imagem em branco sem erro nenhum:
 * o SVG precisa ir com o namespace declarado, e o fundo precisa ser pintado —
 * PNG transparente vira um borrão preto em qualquer visualizador escuro.
 */
async function paraPng(svg: SVGSVGElement | null, largura: number, altura: number): Promise<Blob> {
  if (!svg) throw new Error('O desenho ainda não está pronto.')

  const copia = svg.cloneNode(true) as SVGSVGElement
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
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
