import type { Zone, ZoneKind, Id } from './types'
import { newId } from '../lib/id'

/**
 * Modelos de folha. Cada modelo é só uma lista de zonas em coordenadas
 * fracionárias, então o mesmo modelo serve em qualquer tamanho de tela.
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
    description: 'Tópicos no topo, anotação livre no corpo, dúvidas na lateral, pendências no rodapé.',
    zones: [
      { kind: 'topicos', label: 'Tópicos', rect: { x: 0, y: 0, w: 1, h: 0.12 } },
      { kind: 'anotacao', label: 'Anotação', rect: { x: 0, y: 0.12, w: 0.68, h: 0.72 } },
      { kind: 'duvidas', label: 'Dúvidas', rect: { x: 0.68, y: 0.12, w: 0.32, h: 0.72 } },
      { kind: 'pendencias', label: 'Pendências', rect: { x: 0, y: 0.84, w: 1, h: 0.16 } },
    ],
  },
  {
    id: 'levantamento',
    name: 'Levantamento',
    description: 'Metade da folha pro levantamento em si, com documentos e pendências separados.',
    zones: [
      { kind: 'topicos', label: 'Local / Referência', rect: { x: 0, y: 0, w: 1, h: 0.1 } },
      { kind: 'anotacao', label: 'Levantamento', rect: { x: 0, y: 0.1, w: 1, h: 0.5 } },
      { kind: 'documentos', label: 'Documentos', rect: { x: 0, y: 0.6, w: 0.5, h: 0.24 } },
      { kind: 'duvidas', label: 'Dúvidas', rect: { x: 0.5, y: 0.6, w: 0.5, h: 0.24 } },
      { kind: 'pendencias', label: 'Pendências', rect: { x: 0, y: 0.84, w: 1, h: 0.16 } },
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
    id: 'livre',
    name: 'Livre',
    description: 'Folha inteira sem divisão. Você cria as zonas na mão se quiser.',
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
  topicos: '#8b5cf6',
  duvidas: '#f59e0b',
  pendencias: '#ef4444',
  documentos: '#06b6d4',
  livre: '#3f3f46',
}

/** Ao carimbar algo dentro de uma zona sem escolher ícone, vira este tipo. */
export const ZONE_DEFAULT_ITEM: Record<ZoneKind, string | null> = {
  anotacao: null,
  topicos: 'topico',
  duvidas: 'duvida',
  pendencias: 'pendencia',
  documentos: 'documento',
  livre: null,
}
