import type { ItemKind, Zone, ZoneKind, Id } from './types'
import { newId } from '../lib/id'

/**
 * Modelos de folha. Cada modelo é só uma lista de zonas em coordenadas
 * fracionárias, então o mesmo modelo serve em qualquer tamanho de tela.
 *
 * A zona não é só enfeite: é ela que diz o que a escrita significa. Escrever
 * dentro de "Tarefas" cria tarefa, dentro de "Pauta" cria pauta — sem carimbo,
 * sem gesto nenhum (ver `items/detect.ts`).
 */

export interface ZoneSpec {
  kind: ZoneKind
  label: string
  rect: { x: number; y: number; w: number; h: number }
}

export interface PageTemplate {
  id: string
  name: string
  description: string
  zones: ZoneSpec[]
}

export const TEMPLATES: PageTemplate[] = [
  {
    id: 'reuniao',
    name: 'Reunião',
    description: 'Pauta no topo, anotação livre no corpo, dúvidas na lateral, tarefas e pendências no rodapé.',
    zones: [
      { kind: 'pautas', label: 'Pauta', rect: { x: 0, y: 0, w: 1, h: 0.12 } },
      { kind: 'anotacao', label: 'Anotação', rect: { x: 0, y: 0.12, w: 0.68, h: 0.6 } },
      { kind: 'duvidas', label: 'Dúvidas', rect: { x: 0.68, y: 0.12, w: 0.32, h: 0.6 } },
      { kind: 'tarefas', label: 'Tarefas', rect: { x: 0, y: 0.72, w: 1, h: 0.14 } },
      { kind: 'pendencias', label: 'Pendências', rect: { x: 0, y: 0.86, w: 1, h: 0.14 } },
    ],
  },
  {
    id: 'levantamento',
    name: 'Levantamento',
    description: 'Metade da folha pro levantamento em si, com documentos, dúvidas e pendências separados.',
    zones: [
      { kind: 'topicos', label: 'Local / Referência', rect: { x: 0, y: 0, w: 1, h: 0.1 } },
      { kind: 'anotacao', label: 'Levantamento', rect: { x: 0, y: 0.1, w: 1, h: 0.46 } },
      { kind: 'documentos', label: 'Documentos', rect: { x: 0, y: 0.56, w: 0.5, h: 0.16 } },
      { kind: 'duvidas', label: 'Dúvidas', rect: { x: 0.5, y: 0.56, w: 0.5, h: 0.16 } },
      { kind: 'tarefas', label: 'Tarefas', rect: { x: 0, y: 0.72, w: 1, h: 0.14 } },
      { kind: 'pendencias', label: 'Pendências', rect: { x: 0, y: 0.86, w: 1, h: 0.14 } },
    ],
  },
  {
    id: 'estudo',
    name: 'Estudo',
    description: 'Coluna de tópicos à esquerda (Cornell), conteúdo à direita, dúvidas no rodapé.',
    zones: [
      { kind: 'topicos', label: 'Tópicos', rect: { x: 0, y: 0, w: 0.28, h: 0.85 } },
      { kind: 'anotacao', label: 'Conteúdo', rect: { x: 0.28, y: 0, w: 0.72, h: 0.85 } },
      { kind: 'duvidas', label: 'Dúvidas', rect: { x: 0, y: 0.85, w: 1, h: 0.15 } },
    ],
  },
  {
    id: 'lista',
    name: 'Lista de tarefas',
    description: 'Folha inteira de tarefas, com uma faixa de pendências no rodapé. Cada linha vira um item.',
    zones: [
      { kind: 'pautas', label: 'Assunto', rect: { x: 0, y: 0, w: 1, h: 0.1 } },
      { kind: 'tarefas', label: 'Tarefas', rect: { x: 0, y: 0.1, w: 1, h: 0.66 } },
      { kind: 'pendencias', label: 'Pendências', rect: { x: 0, y: 0.76, w: 1, h: 0.24 } },
    ],
  },
  {
    id: 'fluxograma',
    name: 'Fluxograma',
    description: 'Espaço grande pra desenhar o processo à mão; o app remonta limpo e estruturado.',
    zones: [
      { kind: 'pautas', label: 'Processo', rect: { x: 0, y: 0, w: 1, h: 0.08 } },
      { kind: 'fluxograma', label: 'Fluxograma', rect: { x: 0, y: 0.08, w: 1, h: 0.76 } },
      { kind: 'duvidas', label: 'Dúvidas', rect: { x: 0, y: 0.84, w: 0.5, h: 0.16 } },
      { kind: 'tarefas', label: 'Tarefas', rect: { x: 0.5, y: 0.84, w: 0.5, h: 0.16 } },
    ],
  },
  {
    id: 'livre',
    name: 'Livre',
    description: 'Folha inteira sem divisão. Nada é identificado sozinho: aqui o carimbo é seu.',
    zones: [{ kind: 'livre', label: '', rect: { x: 0, y: 0, w: 1, h: 1 } }],
  },
]

export function getTemplate(id: string): PageTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1]
}

export function buildZones(pageId: Id, templateId: string): Zone[] {
  return getTemplate(templateId).zones.map((spec) => ({
    id: newId(),
    pageId,
    kind: spec.kind,
    label: spec.label,
    rect: { ...spec.rect },
  }))
}

/** Cor de destaque de cada tipo de zona — usada no rótulo e na borda. */
export const ZONE_COLORS: Record<ZoneKind, string> = {
  anotacao: '#6b7280',
  pautas: '#0ea5e9',
  topicos: '#8b5cf6',
  tarefas: '#22c55e',
  duvidas: '#f59e0b',
  pendencias: '#ef4444',
  documentos: '#06b6d4',
  fluxograma: '#ec4899',
  livre: '#3f3f46',
}

/**
 * O que a escrita vira quando cai dentro da zona.
 *
 * **Toda linha escrita vira registro, em qualquer zona** — inclusive no corpo
 * da anotação e na folha livre, onde ela vira `nota`. Foi pedido assim:
 * "transcreve tudo, inclusive a anotação".
 *
 * A diferença entre `nota` e o resto não é ser ou não ser registro: é ser ou
 * não ser trabalho. Nota tem texto e ficha, mas não conta como coisa em aberto
 * e não ganha carimbo na margem — senão o corpo da folha viraria uma parede de
 * marcas e a Central, um depósito.
 */
export const ZONE_ITEM_KIND: Record<ZoneKind, ItemKind> = {
  anotacao: 'nota',
  pautas: 'pauta',
  topicos: 'topico',
  tarefas: 'tarefa',
  duvidas: 'duvida',
  pendencias: 'pendencia',
  documentos: 'documento',
  // O fluxograma é a exceção, e por um motivo só: ali a transcrição não é
  // linha por linha, é o desenho inteiro virando um grafo. Tratar cada caixa
  // como uma nota encheria a Central de pedaços sem sentido fora do desenho.
  fluxograma: 'nota',
  livre: 'nota',
}

/**
 * Zonas em que NÃO se identifica linha por linha.
 *
 * Hoje só o fluxograma: lá a leitura é outra (`flow/`), e o resultado é um
 * registro só — o desenho montado — em vez de um por linha.
 */
export const ZONES_SEM_LINHA: ZoneKind[] = ['fluxograma']
