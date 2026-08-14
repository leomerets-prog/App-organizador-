import { useStore } from '../state/store'
import { PEN_COLORS, PEN_WIDTHS } from '../domain/constants'
import type { ItemKind, ToolKind } from '../domain/types'
import { ITEM_COLOR, ITEM_GLYPH } from '../ink/renderer'

/**
 * Barra de ferramentas lateral.
 *
 * Quando há tinta selecionada pelo laço, ela troca de cara e vira a paleta de
 * carimbos — o gesto "cerquei isto → isto é uma tarefa" acontece sem sair da mão.
 */

const TOOLS: { kind: ToolKind; glyph: string; label: string }[] = [
  { kind: 'pen', glyph: '✎', label: 'Caneta' },
  { kind: 'highlighter', glyph: '▬', label: 'Marca-texto' },
  { kind: 'lasso', glyph: '◌', label: 'Laço' },
  { kind: 'eraser', glyph: '⌫', label: 'Borracha' },
]

const ITEM_KINDS: ItemKind[] = ['tarefa', 'duvida', 'topico', 'pendencia', 'documento', 'importante']

const ITEM_LABEL: Record<ItemKind, string> = {
  tarefa: 'Tarefa',
  duvida: 'Dúvida',
  topico: 'Tópico',
  pendencia: 'Pendência',
  documento: 'Documento',
  importante: 'Importante',
}

export function Toolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const penColor = useStore((s) => s.penColor)
  const setPenColor = useStore((s) => s.setPenColor)
  const penWidth = useStore((s) => s.penWidth)
  const setPenWidth = useStore((s) => s.setPenWidth)
  const showZones = useStore((s) => s.showZones)
  const toggleZones = useStore((s) => s.toggleZones)

  const selection = useStore((s) => s.selection)
  const clearSelection = useStore((s) => s.clearSelection)
  const stampSelection = useStore((s) => s.stampSelection)

  if (selection.size > 0) {
    return (
      <aside className="toolbar stamping">
        <div className="toolbar-title">
          {selection.size} {selection.size === 1 ? 'traço' : 'traços'}
        </div>
        <div className="toolbar-hint">Isto é o quê?</div>

        {ITEM_KINDS.map((kind) => (
          <button
            key={kind}
            className="stamp-btn"
            style={{ '--stamp': ITEM_COLOR[kind] } as React.CSSProperties}
            onClick={() => void stampSelection(kind)}
          >
            <span className="stamp-glyph">{ITEM_GLYPH[kind]}</span>
            <span className="stamp-label">{ITEM_LABEL[kind]}</span>
          </button>
        ))}

        <button className="tool-btn subtle" onClick={clearSelection}>
          <span className="tool-glyph">✕</span>
          <span className="tool-label">Cancelar</span>
        </button>
      </aside>
    )
  }

  return (
    <aside className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.kind}
          className={`tool-btn ${tool === t.kind ? 'active' : ''}`}
          onClick={() => setTool(t.kind)}
          title={t.label}
        >
          <span className="tool-glyph">{t.glyph}</span>
          <span className="tool-label">{t.label}</span>
        </button>
      ))}

      <div className="toolbar-divider" />

      <div className="swatches">
        {PEN_COLORS.map((color) => (
          <button
            key={color}
            className={`swatch ${penColor === color ? 'active' : ''}`}
            style={{ background: color }}
            onClick={() => setPenColor(color)}
            aria-label={`Cor ${color}`}
          />
        ))}
      </div>

      <div className="widths">
        {PEN_WIDTHS.map((w) => (
          <button
            key={w}
            className={`width-btn ${penWidth === w ? 'active' : ''}`}
            onClick={() => setPenWidth(w)}
            aria-label={`Espessura ${w}`}
          >
            <span className="width-dot" style={{ width: w * 2.2, height: w * 2.2 }} />
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <button className={`tool-btn ${showZones ? 'active' : ''}`} onClick={toggleZones}>
        <span className="tool-glyph">▦</span>
        <span className="tool-label">Zonas</span>
      </button>

      <div className="toolbar-tip">
        Sem borracha na caneta?
        <strong>Rabisque 3 voltas por cima pra apagar.</strong>
      </div>
    </aside>
  )
}
