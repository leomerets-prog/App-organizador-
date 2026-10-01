import type { Bounds, Id, Item, ItemKind, Stroke, Zone } from '../domain/types'
import { unionBounds } from '../lib/geometry'
import { ZONE_ITEM_KIND, ZONES_SEM_LINHA } from '../domain/templates'
import { zoneAtPoint } from '../zones/hit'
import { PAGE_MIN_HEIGHT } from '../domain/constants'

/**
 * Identificação dos campos escritos na folha.
 *
 * A ideia inteira cabe numa frase: **a zona diz o que a escrita significa, e
 * cada linha escrita ali dentro é um campo**. Quem escreve três linhas na
 * faixa "Tarefas" acaba com três tarefas no painel, sem carimbar nada.
 *
 * Por que linha, e não bloco: numa faixa de tarefas ou pendências as pessoas
 * escrevem uma por linha. Juntar linhas viraria uma tarefa só, gigante, que
 * não dá pra concluir em separado — o erro que mais custa aqui. Linhas
 * grudadas demais (baseline torta, letra que sobe) ainda são reunidas pelo
 * passo de junção abaixo, que é a defesa contra o exagero oposto.
 *
 * Módulo puro: não conhece React nem banco. É onde a lógica nova de
 * identificação deve nascer, e é o que `tools/fields-test.ts` verifica.
 */

// ─── Medidas da identificação (px de página) ─────────────────────────────────

/** Altura mínima considerada numa comparação; evita dividir por zero no ponto do i. */
const MIN_LINE_HEIGHT = 8

/** Quanto dois traços precisam se sobrepor na vertical pra serem a mesma linha. */
const LINE_OVERLAP = 0.3

/** Linhas separadas por menos que isto (× a altura típica) são a mesma linha torta. */
const LINE_MERGE_GAP = 0.25

/** Vão horizontal (× a altura da escrita) que separa duas colunas na mesma faixa. */
const COLUMN_GAP = 2.2

/**
 * Altura mínima assumida pra escrita ao medir o vão entre colunas.
 *
 * Sem este piso, uma linha rasa — um traço, uma palavra toda em letra baixa,
 * um sublinhado — daria um limite minúsculo e o espaço normal entre duas
 * palavras seria lido como duas colunas. Deu exatamente isso num teste no
 * navegador: duas palavras na mesma linha viraram duas tarefas.
 */
const MIN_WRITING_HEIGHT = 24

/** Abaixo disto é sujeira: pingo solto, vírgula perdida, encosto da mão. */
const MIN_FIELD_SIZE = 10

// ─── O que sai daqui ─────────────────────────────────────────────────────────

export interface DetectedField {
  zoneId: Id
  kind: ItemKind
  strokeIds: Id[]
  bounds: Bounds
}

export interface DetectOptions {
  /** Traços já falados por um item carimbado; ficam de fora pra não duplicar. */
  ignoreStrokeIds?: ReadonlySet<Id>
  /** Altura da folha usada pra resolver a zona de traços antigos. */
  pageHeight?: number
}

/**
 * Os campos escritos na folha, em ordem de leitura (de cima pra baixo).
 *
 * Toda zona gera campo: no corpo da anotação e na folha livre a linha vira
 * `nota` (ver `ZONE_ITEM_KIND`) — que tem texto e ficha, mas não é trabalho.
 */
export function detectFields(
  strokes: readonly Stroke[],
  zones: readonly Zone[],
  options: DetectOptions = {},
): DetectedField[] {
  const ignore = options.ignoreStrokeIds ?? new Set<Id>()
  const pageHeight = options.pageHeight ?? PAGE_MIN_HEIGHT

  const zoneById = new Map(zones.map((z) => [z.id, z]))
  const byZone = new Map<Id, Stroke[]>()

  for (const stroke of strokes) {
    if (ignore.has(stroke.id)) continue
    const zone = resolveZone(stroke, zoneById, zones, pageHeight)
    if (!zone) continue
    // No fluxograma a leitura não é por linha: lá uma caixa e a seta ao lado
    // estão na mesma altura e virariam duas tarefas sem sentido. Quem lê
    // aquela zona é `flow/`, e o resultado é um desenho, não uma lista.
    if (ZONES_SEM_LINHA.includes(zone.kind)) continue
    const list = byZone.get(zone.id)
    if (list) list.push(stroke)
    else byZone.set(zone.id, [stroke])
  }

  const fields: DetectedField[] = []

  for (const [zoneId, group] of byZone) {
    const zone = zoneById.get(zoneId)!
    const kind = ZONE_ITEM_KIND[zone.kind]

    const lines = clusterLines(group)
    const typical = typicalHeight(lines)

    for (const line of lines) {
      for (const run of splitColumns(line, typical)) {
        const bounds = unionBounds(run.map((s) => s.bounds))
        if (isNoise(run, bounds)) continue
        fields.push({
          zoneId,
          kind,
          strokeIds: run.map((s) => s.id),
          bounds,
        })
      }
    }
  }

  fields.sort((a, b) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX)
  return fields
}

/**
 * A zona do traço.
 *
 * O traço já guarda a zona onde caiu quando foi escrito — é o que vale, porque
 * foi a divisão que o usuário tinha na frente. Traços antigos (ou de uma folha
 * cuja zona sumiu) são resolvidos pela posição, do mesmo jeito que na escrita.
 */
function resolveZone(
  stroke: Stroke,
  zoneById: Map<Id, Zone>,
  zones: readonly Zone[],
  pageHeight: number,
): Zone | null {
  if (stroke.zoneId) {
    const known = zoneById.get(stroke.zoneId)
    if (known) return known
  }
  const center = {
    x: (stroke.bounds.minX + stroke.bounds.maxX) / 2,
    y: (stroke.bounds.minY + stroke.bounds.maxY) / 2,
  }
  return zoneAtPoint(zones as Zone[], center, pageHeight)
}

// ─── Agrupamento em linhas ───────────────────────────────────────────────────

/** Os traços de uma zona, repartidos nas linhas em que foram escritos. */
function clusterLines(strokes: readonly Stroke[]): Stroke[][] {
  const sorted = [...strokes].sort(
    (a, b) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX,
  )

  const lines: { bounds: Bounds; strokes: Stroke[] }[] = []

  for (const stroke of sorted) {
    let best: (typeof lines)[number] | null = null
    let bestScore = 0
    for (const line of lines) {
      const score = overlapScore(line.bounds, stroke.bounds)
      if (score > bestScore) {
        bestScore = score
        best = line
      }
    }
    if (best && bestScore >= LINE_OVERLAP) {
      best.strokes.push(stroke)
      best.bounds = unionBounds([best.bounds, stroke.bounds])
    } else {
      lines.push({ bounds: { ...stroke.bounds }, strokes: [stroke] })
    }
  }

  return mergeTouchingLines(lines).map((line) =>
    line.strokes.sort((a, b) => a.bounds.minX - b.bounds.minX),
  )
}

/**
 * Junta linhas quase encostadas.
 *
 * Existe por causa do acento e do ponto do i, que ficam altos demais pra
 * sobrepor a linha, e da letra que sobe no fim da frase. O limite é apertado
 * (um quarto da altura típica) porque juntar demais é pior que separar demais:
 * duas tarefas viradas uma só não dá pra concluir em separado.
 */
function mergeTouchingLines(
  lines: { bounds: Bounds; strokes: Stroke[] }[],
): { bounds: Bounds; strokes: Stroke[] }[] {
  if (lines.length <= 1) return lines

  const ordered = [...lines].sort((a, b) => a.bounds.minY - b.bounds.minY)
  const heights = ordered
    .map((l) => l.bounds.maxY - l.bounds.minY)
    .sort((a, b) => a - b)
  const typical = Math.max(MIN_LINE_HEIGHT, heights[Math.floor(heights.length / 2)])
  const limit = typical * LINE_MERGE_GAP

  const out: { bounds: Bounds; strokes: Stroke[] }[] = []
  for (const line of ordered) {
    const last = out[out.length - 1]
    if (last && line.bounds.minY - last.bounds.maxY < limit) {
      last.strokes.push(...line.strokes)
      last.bounds = unionBounds([last.bounds, line.bounds])
    } else {
      out.push({ bounds: { ...line.bounds }, strokes: [...line.strokes] })
    }
  }
  return out
}

/**
 * Reparte a linha onde houver um vão horizontal grande.
 *
 * Numa faixa larga cabem duas anotações lado a lado na mesma altura; sem isto
 * elas virariam um campo só, com meio metro de folha em branco no meio.
 */
function splitColumns(line: Stroke[], typical: number): Stroke[][] {
  if (line.length <= 1) return [line]

  const bounds = unionBounds(line.map((s) => s.bounds))
  // A referência é a maior entre esta linha e a escrita da zona: uma linha
  // rasa no meio de letra graúda continua medindo o vão pela letra graúda.
  const height = Math.max(MIN_WRITING_HEIGHT, typical, bounds.maxY - bounds.minY)
  const limit = height * COLUMN_GAP

  const runs: Stroke[][] = []
  let current: Stroke[] = []
  let reach = -Infinity

  for (const stroke of line) {
    if (current.length > 0 && stroke.bounds.minX - reach > limit) {
      runs.push(current)
      current = []
    }
    current.push(stroke)
    reach = Math.max(reach, stroke.bounds.maxX)
  }
  if (current.length > 0) runs.push(current)
  return runs
}

/** Altura típica da escrita da zona: a mediana das linhas encontradas. */
function typicalHeight(lines: readonly Stroke[][]): number {
  if (lines.length === 0) return MIN_WRITING_HEIGHT
  const heights = lines
    .map((line) => {
      const b = unionBounds(line.map((s) => s.bounds))
      return b.maxY - b.minY
    })
    .sort((a, b) => a - b)
  return heights[Math.floor(heights.length / 2)]
}

/** Sobreposição vertical das duas caixas, em fração da mais baixa delas. */
function overlapScore(a: Bounds, b: Bounds): number {
  const overlap = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
  if (overlap <= 0) return 0
  const smaller = Math.max(
    MIN_LINE_HEIGHT,
    Math.min(a.maxY - a.minY, b.maxY - b.minY),
  )
  return overlap / smaller
}

function isNoise(strokes: readonly Stroke[], bounds: Bounds): boolean {
  // Marca-texto sozinho não é campo: ele marca alguma coisa, não é a coisa.
  if (strokes.every((s) => s.tool === 'highlighter')) return true
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  return Math.hypot(w, h) < MIN_FIELD_SIZE
}

// ─── Reconciliação com o que já existe ───────────────────────────────────────

export interface FieldSyncPlan {
  create: DetectedField[]
  /** Itens que já existiam e mudaram de tinta ou de tamanho. */
  update: { item: Item; field: DetectedField }[]
  /** Itens automáticos cuja tinta sumiu. */
  remove: Id[]
}

/**
 * O que fazer com os campos identificados, dado o que já está no painel.
 *
 * A regra que sustenta tudo: um item automático é reconhecido pela tinta que
 * ele contém. Enquanto sobrar um traço em comum, ele continua sendo o mesmo
 * item — mantém o tipo que o usuário escolheu, o "concluído" que ele marcou e
 * o "arquivado" de quando ele disse que aquilo não era item. Sem isso, cada
 * palavra nova acrescentada à linha apagaria a decisão dele.
 */
export function planFieldSync(
  fields: readonly DetectedField[],
  autoItems: readonly Item[],
): FieldSyncPlan {
  const pairs: { fieldIndex: number; item: Item; shared: number }[] = []

  const owner = new Map<Id, Item[]>()
  for (const item of autoItems) {
    for (const strokeId of item.strokeIds) {
      const list = owner.get(strokeId)
      if (list) list.push(item)
      else owner.set(strokeId, [item])
    }
  }

  fields.forEach((field, fieldIndex) => {
    const counts = new Map<Id, { item: Item; shared: number }>()
    for (const strokeId of field.strokeIds) {
      for (const item of owner.get(strokeId) ?? []) {
        const entry = counts.get(item.id)
        if (entry) entry.shared++
        else counts.set(item.id, { item, shared: 1 })
      }
    }
    for (const entry of counts.values()) {
      pairs.push({ fieldIndex, item: entry.item, shared: entry.shared })
    }
  })

  // Mais tinta em comum ganha. O empate cai no item mais antigo, pra que duas
  // passadas seguidas cheguem sempre ao mesmo resultado.
  pairs.sort((a, b) => b.shared - a.shared || a.item.createdAt - b.item.createdAt)

  const takenFields = new Set<number>()
  const takenItems = new Set<Id>()
  const plan: FieldSyncPlan = { create: [], update: [], remove: [] }

  for (const pair of pairs) {
    if (takenFields.has(pair.fieldIndex) || takenItems.has(pair.item.id)) continue
    takenFields.add(pair.fieldIndex)
    takenItems.add(pair.item.id)
    const field = fields[pair.fieldIndex]
    if (!sameField(pair.item, field)) plan.update.push({ item: pair.item, field })
  }

  fields.forEach((field, index) => {
    if (!takenFields.has(index)) plan.create.push(field)
  })

  for (const item of autoItems) {
    if (!takenItems.has(item.id)) plan.remove.push(item.id)
  }

  return plan
}

/** O item já descreve exatamente este campo? Então não se toca no banco. */
function sameField(item: Item, field: DetectedField): boolean {
  if (item.zoneId !== field.zoneId) return false
  if (item.strokeIds.length !== field.strokeIds.length) return false
  const have = new Set(item.strokeIds)
  for (const id of field.strokeIds) if (!have.has(id)) return false
  return (
    item.bounds.minX === field.bounds.minX &&
    item.bounds.minY === field.bounds.minY &&
    item.bounds.maxX === field.bounds.maxX &&
    item.bounds.maxY === field.bounds.maxY
  )
}
