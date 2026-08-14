/**
 * Modelo de domínio do Organizador.
 *
 * Hierarquia (igual OneNote):
 *   Notebook (Bloco de Anotações) → Section (Seção) → Page (Página)
 *
 * Dentro de uma página vivem quatro coisas independentes:
 *   Stroke  — a tinta da caneta
 *   Zone    — as faixas nomeadas que classificam a tinta que cai dentro delas
 *   Item    — o que foi promovido a tarefa / dúvida / tópico (carimbado com ícone)
 *   Recording — o áudio gravado durante a anotação
 */

export type Id = string

// ─── Hierarquia ──────────────────────────────────────────────────────────────

export interface Notebook {
  id: Id
  name: string
  /** Cor da lombada, mostrada na barra lateral. */
  color: string
  createdAt: number
  updatedAt: number
  /** Ordem manual na barra lateral. */
  order: number
}

export interface Section {
  id: Id
  notebookId: Id
  name: string
  color: string
  createdAt: number
  updatedAt: number
  order: number
}

export interface Page {
  id: Id
  sectionId: Id
  title: string
  /** Modelo de folha usado ao criar (ver zones/templates.ts). */
  templateId: string
  /** Altura da folha em unidades de página; cresce conforme se escreve pra baixo. */
  height: number
  createdAt: number
  updatedAt: number
  order: number
}

// ─── Tinta ───────────────────────────────────────────────────────────────────

/**
 * Um ponto capturado da caneta.
 * `p` é a pressão (0..1) e `t` o instante em ms desde o início do traço —
 * é o `t` que permite ligar a tinta ao áudio depois.
 */
export interface InkPoint {
  x: number
  y: number
  p: number
  t: number
}

export type ToolKind = 'pen' | 'highlighter' | 'eraser' | 'lasso'

export interface Stroke {
  id: Id
  pageId: Id
  points: InkPoint[]
  color: string
  /** Largura base em px de página; a pressão modula em cima disso. */
  width: number
  tool: Extract<ToolKind, 'pen' | 'highlighter'>
  /** Zona onde o traço caiu no momento em que foi escrito. */
  zoneId: Id | null
  /** Instante absoluto (epoch ms) do início do traço. */
  startedAt: number
  /** Caixa envolvente, em coordenadas de página. Cache pra busca rápida. */
  bounds: Bounds
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// ─── Zonas ───────────────────────────────────────────────────────────────────

/** O que a zona significa. Define o tipo padrão dos itens criados dentro dela. */
export type ZoneKind = 'anotacao' | 'topicos' | 'duvidas' | 'pendencias' | 'documentos' | 'livre'

export interface Zone {
  id: Id
  pageId: Id
  kind: ZoneKind
  /** Nome mostrado no rótulo da zona; editável pelo usuário. */
  label: string
  /** Retângulo em fração da largura/altura da folha (0..1), pra escalar em qualquer tela. */
  rect: { x: number; y: number; w: number; h: number }
}

// ─── Itens (o que foi carimbado) ─────────────────────────────────────────────

export type ItemKind = 'tarefa' | 'duvida' | 'topico' | 'documento' | 'pendencia' | 'importante'

export type ItemStatus = 'aberto' | 'concluido' | 'arquivado'

export interface Item {
  id: Id
  pageId: Id
  kind: ItemKind
  status: ItemStatus
  /** Traços que compõem este item. */
  strokeIds: Id[]
  /** Região da página que o item ocupa — usada pro recorte na tela estratificada. */
  bounds: Bounds
  /** Título legível. Vem do OCR ou digitado à mão; vazio até ser reconhecido. */
  title: string
  /** Estado da transcrição da letra manuscrita. */
  ocr: OcrState
  createdAt: number
  updatedAt: number
}

export type OcrState =
  | { status: 'pendente' }
  | { status: 'processando' }
  | { status: 'pronto'; text: string; at: number }
  | { status: 'falhou'; reason: string }

// ─── Áudio ───────────────────────────────────────────────────────────────────

export interface Recording {
  id: Id
  pageId: Id
  /** Instante absoluto (epoch ms) em que a gravação começou. */
  startedAt: number
  durationMs: number
  mimeType: string
  /** Onde o pino do áudio foi fixado na folha, em coordenadas de página. */
  anchor: { x: number; y: number }
  /** Rótulo opcional dado pelo usuário. */
  label: string
}

/** O blob de áudio vive numa store separada pra não pesar as consultas de metadados. */
export interface RecordingBlob {
  id: Id
  blob: Blob
}
