import { useStore } from '../state/store'
import {
  INK_COLOR,
  PEN_COLORS,
  PEN_WIDTH_MAX,
  PEN_WIDTH_MIN,
  PEN_WIDTH_PRESETS,
} from '../domain/constants'
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
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)

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
            className={`swatch ${penColor === color ? 'active' : ''} ${
              color === INK_COLOR ? 'swatch-ink' : ''
            }`}
            style={color === INK_COLOR ? undefined : { background: color }}
            onClick={() => setPenColor(color)}
            aria-label={color === INK_COLOR ? 'Cor padrão' : `Cor ${color}`}
          />
        ))}
      </div>

      <WidthControl value={penWidth} onChange={setPenWidth} disabled={tool === 'highlighter'} />

      <div className="toolbar-divider" />

      <button className={`tool-btn ${showZones ? 'active' : ''}`} onClick={toggleZones}>
        <span className="tool-glyph">▦</span>
        <span className="tool-label">Zonas</span>
      </button>

      <button className="tool-btn" onClick={toggleTheme}>
        <span className="tool-glyph">{theme === 'dark' ? '☀' : '☾'}</span>
        <span className="tool-label">{theme === 'dark' ? 'Claro' : 'Escuro'}</span>
      </button>

      <div className="toolbar-tip">
        <strong>3 voltas</strong> rabiscadas ligam a borracha
      </div>
    </aside>
  )
}

/**
 * Controle da espessura: barra contínua com amostra do traço em tamanho real.
 *
 * As espessuras fixas de antes não serviam — o mais fino delas ainda saía
 * grosso, e não havia como chegar num traço mais fino que o menor botão.
 * A barra resolve isso e os atalhos evitam ter que mirar toda hora.
 */
function WidthControl({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <div className={`width-control ${disabled ? 'disabled' : ''}`}>
      <div className="width-preview" aria-hidden>
        {/* A amostra usa a mesma medida do traço, então o que se vê é o que sai. */}
        <span className="width-preview-dot" style={{ width: value, height: value }} />
      </div>

      <input
        className="width-slider"
        type="range"
        min={PEN_WIDTH_MIN}
        max={PEN_WIDTH_MAX}
        step={0.1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Espessura do traço"
      />

      <div className="width-value">{value.toFixed(1)}</div>

      <div className="width-presets">
        {PEN_WIDTH_PRESETS.map((w) => (
          <button
            key={w}
            className={`width-preset ${Math.abs(value - w) < 0.05 ? 'active' : ''}`}
            onClick={() => onChange(w)}
            disabled={disabled}
            aria-label={`Espessura ${w}`}
          >
            <span style={{ width: Math.max(2, w), height: Math.max(2, w) }} />
          </button>
        ))}
      </div>

      {disabled && <div className="width-note">marca-texto tem espessura fixa</div>}
    </div>
  )
}
