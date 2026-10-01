import { useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { layout } from '../flow/layout'
import type { PlacedNode } from '../flow/layout'
import type { Flowchart, FlowShape } from '../domain/types'
import { salvarImagem } from '../audio/export'

/**
 * O fluxograma montado.
 *
 * O desenho à mão continua na folha, intacto. Aqui está a versão "oficial":
 * caixas do mesmo tamanho, em níveis, com as setas retas — que é o que faz um
 * fluxograma ser lido por outra pessoa em vez de decifrado.
 *
 * É um SVG de verdade, e não uma imagem: o nome de cada caixa é editável no
 * lugar, porque o reconhecedor erra e corrigir aqui é mais rápido que voltar à
 * folha e reescrever. O botão Salvar transforma em PNG na hora de sair.
 */

const FORMA_NOME: Record<FlowShape, string> = {
  acao: 'Ação',
  decisao: 'Decisão',
  terminal: 'Início / Fim',
}

const CORES: Record<FlowShape, { borda: string; fundo: string }> = {
  acao: { borda: '#2563eb', fundo: '#eff6ff' },
  decisao: { borda: '#d97706', fundo: '#fffbeb' },
  terminal: { borda: '#059669', fundo: '#ecfdf5' },
}

const TEXTO = '#111827'
const SETA = '#4b5563'

export function FlowPanel({ chart, onClose }: { chart: Flowchart; onClose: () => void }) {
  const updateFlowNode = useStore((s) => s.updateFlowNode)
  const updateFlowEdge = useStore((s) => s.updateFlowEdge)
  const buildFlowchart = useStore((s) => s.buildFlowchart)
  const flowStatus = useStore((s) => s.flowStatus)

  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [salvo, setSalvo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const arranjo = useMemo(
    () => layout({ nodes: chart.nodes, edges: chart.edges }),
    [chart.nodes, chart.edges],
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

      {erro && <div className="flow-erro">{erro}</div>}
      {salvo && <div className="flow-salvo">✓ Salvo — {salvo}</div>}
      {flowStatus.state === 'erro' && <div className="flow-erro">{flowStatus.message}</div>}

      <div className="flow-tela">
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
                onEdit={() => abrirEdicao(n.id, dado.label)}
              />
            )
          })}
        </svg>
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

      {/* As setas também ganham nome — é o "sim" e o "não" de toda decisão. */}
      {!editando && chart.edges.length > 0 && (
        <div className="flow-setas">
          <span className="muted">Nome das setas:</span>
          {chart.edges.map((e) => (
            <button key={e.id} onClick={() => abrirEdicao(`seta:${e.id}`, e.label)}>
              {porId.get(e.from)?.label || 'caixa'} → {porId.get(e.to)?.label || 'caixa'}
              {e.label ? `: ${e.label}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Caixa({
  posto,
  label,
  onEdit,
}: {
  posto: PlacedNode
  label: string
  onEdit: () => void
}) {
  const cor = CORES[posto.kind]
  const cx = posto.x + posto.w / 2
  const cy = posto.y + posto.h / 2
  const linhas = quebrar(label || '…', posto.kind === 'decisao' ? 18 : 24)

  return (
    <g className="flow-caixa" onClick={onEdit} style={{ cursor: 'pointer' }}>
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
