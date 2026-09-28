import { useStore } from '../state/store'
import {
  ERASER_MAX,
  ERASER_MIN,
  ERASER_PRESETS,
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
  { kind: 'image', glyph: '🖼', label: 'Imagem' },
  { kind: 'zone', glyph: '▣', label: 'Zonas' },
]

const ITEM_KINDS: ItemKind[] = [
  'tarefa',
  'pauta',
  'duvida',
  'topico',
  'pendencia',
  'documento',
  'importante',
]

const ITEM_LABEL: Record<ItemKind, string> = {
  tarefa: 'Tarefa',
  pauta: 'Pauta',
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
  const autoFields = useStore((s) => s.autoFields)
  const toggleAutoFields = useStore((s) => s.toggleAutoFields)
  const showText = useStore((s) => s.showText)
  const toggleShowText = useStore((s) => s.toggleShowText)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const eraserSize = useStore((s) => s.eraserSize)
  const setEraserSize = useStore((s) => s.setEraserSize)

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

      {/* Com a borracha ligada, a barra passa a controlar o tamanho DELA. É a
          medida que importa naquele momento, e evita duas barras concorrendo. */}
      {tool === 'eraser' ? (
        <SizeControl
          value={eraserSize}
          onChange={setEraserSize}
          min={ERASER_MIN}
          max={ERASER_MAX}
          step={1}
          presets={ERASER_PRESETS}
          decimals={0}
          label="Tamanho da borracha"
          variant="eraser"
        />
      ) : (
        <>
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

          <SizeControl
            value={penWidth}
            onChange={setPenWidth}
            min={PEN_WIDTH_MIN}
            max={PEN_WIDTH_MAX}
            step={0.1}
            presets={PEN_WIDTH_PRESETS}
            decimals={1}
            label="Espessura do traço"
            variant="pen"
            disabled={tool === 'highlighter'}
            note={tool === 'highlighter' ? 'marca-texto tem espessura fixa' : undefined}
          />
        </>
      )}

      <div className="toolbar-divider" />

      <button className={`tool-btn ${showZones ? 'active' : ''}`} onClick={toggleZones}>
        <span className="tool-glyph">▦</span>
        <span className="tool-label">Ver zonas</span>
      </button>

      {/* A transcrição na folha, embaixo da letra. Desligar é pra quando a
          linha de texto atrapalhar a escrita, não pra apagar nada. */}
      <button
        className={`tool-btn ${showText ? 'active' : ''}`}
        onClick={toggleShowText}
        title={
          showText
            ? 'O texto transcrito aparece na folha, embaixo da sua letra'
            : 'Texto escondido; a transcrição continua guardada'
        }
      >
        <span className="tool-glyph">T</span>
        <span className="tool-label">Texto</span>
      </button>

      {/* O que o app identifica sozinho dentro das zonas. Fica ao lado das
          zonas de propósito: é a mesma ideia, vista de dois ângulos. */}
      <button
        className={`tool-btn ${autoFields ? 'active' : ''}`}
        onClick={toggleAutoFields}
        title={
          autoFields
            ? 'Cada linha escrita dentro de uma zona vira item no painel'
            : 'Identificação desligada: só o laço cria itens'
        }
      >
        <span className="tool-glyph">⊞</span>
        <span className="tool-label">Campos</span>
      </button>

      <button className="tool-btn" onClick={toggleTheme}>
        <span className="tool-glyph">{theme === 'dark' ? '☀' : '☾'}</span>
        <span className="tool-label">{theme === 'dark' ? 'Claro' : 'Escuro'}</span>
      </button>

      <div className="toolbar-tip">
        {tool === 'eraser' ? (
          <>
            <strong>2 toques</strong> na folha voltam à caneta
          </>
        ) : tool === 'zone' ? (
          <>
            <strong>arraste</strong> a faixa, os cantos, ou o vazio pra criar
          </>
        ) : (
          <>
            <strong>segure o dedo</strong> numa linha pra corrigir o texto
          </>
        )}
      </div>
    </aside>
  )
}

/**
 * Controle de tamanho, usado pela caneta e pela borracha.
 *
 * A amostra é desenhada na medida real, então o que se vê é o que sai — vale
 * tanto pro traço quanto pro alcance da borracha, que sem isso seria cego.
 */
function SizeControl({
  value,
  onChange,
  min,
  max,
  step,
  presets,
  decimals,
  label,
  variant,
  disabled = false,
  note,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  presets: readonly number[]
  decimals: number
  label: string
  variant: 'pen' | 'eraser'
  disabled?: boolean
  note?: string
}) {
  // A amostra da borracha é um círculo do diâmetro real, mas a caixa é pequena:
  // acima disso ela é mostrada proporcional, sem estourar a lateral.
  const previewMax = 34
  const shown = variant === 'eraser' ? Math.min(previewMax, value) : value

  return (
    <div className={`width-control ${disabled ? 'disabled' : ''}`}>
      <div className={`width-preview ${variant === 'eraser' ? 'eraser-preview' : ''}`} aria-hidden>
        <span
          className={variant === 'eraser' ? 'eraser-preview-dot' : 'width-preview-dot'}
          style={{ width: shown, height: shown }}
        />
      </div>

      <input
        className="width-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />

      <div className="width-value">{value.toFixed(decimals)}</div>

      <div className="width-presets">
        {presets.map((p) => (
          <button
            key={p}
            className={`width-preset ${Math.abs(value - p) < step / 2 ? 'active' : ''}`}
            onClick={() => onChange(p)}
            disabled={disabled}
            aria-label={`${label} ${p}`}
          >
            <span
              style={{
                width: Math.max(2, Math.min(16, variant === 'eraser' ? p / 3.5 : p)),
                height: Math.max(2, Math.min(16, variant === 'eraser' ? p / 3.5 : p)),
              }}
            />
          </button>
        ))}
      </div>

      {note && <div className="width-note">{note}</div>}
    </div>
  )
}
