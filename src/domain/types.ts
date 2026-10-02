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
  /**
   * Altura de UMA repetição da divisão em zonas, em px de página.
   *
   * Era uma constante (1754, o A4). Virou campo da página porque isso era o
   * limite que impedia esticar uma faixa pra baixo: a divisão se repete a cada
   * folha, então nenhuma zona podia passar do fim dela. Agora a folha estica
   * junto. Opcional — página antiga simplesmente usa o padrão.
   */
  sheetHeight?: number
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

export type ToolKind = 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'image' | 'zone'

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

/**
 * O que a zona significa.
 *
 * É daqui que sai a estratificação automática: a zona onde a escrita caiu
 * define em que aba do painel ela vai aparecer (ver `items/detect.ts`).
 */
export type ZoneKind =
  | 'anotacao'
  | 'pautas'
  | 'topicos'
  | 'tarefas'
  | 'duvidas'
  | 'pendencias'
  | 'documentos'
  /** Espaço pra desenhar um fluxograma à mão, que depois é remontado limpo. */
  | 'fluxograma'
  | 'livre'

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

export type ItemKind =
  | 'tarefa'
  | 'pauta'
  | 'duvida'
  | 'topico'
  | 'documento'
  | 'pendencia'
  | 'importante'
  /** Linha escrita no corpo da folha: vira texto e ficha, mas não é trabalho. */
  | 'nota'

/** Quanto corre. Fica vazio até o usuário dizer. */
export type Priority = 'alta' | 'media' | 'baixa'

/**
 * `arquivado` é o "não era item": guarda a decisão do usuário pra que a
 * identificação automática não recrie o mesmo campo na próxima passada.
 */
export type ItemStatus = 'aberto' | 'concluido' | 'arquivado'

/**
 * De onde o item veio.
 *
 * `carimbo` — o usuário cercou a tinta com o laço e escolheu o tipo.
 * `auto`    — o app identificou o campo pela zona em que a escrita caiu.
 *
 * A diferença importa na hora de reconciliar: só os automáticos são refeitos
 * quando a tinta muda; os carimbados são do usuário e ninguém mexe neles.
 */
export type ItemSource = 'carimbo' | 'auto'

export interface Item {
  id: Id
  pageId: Id
  kind: ItemKind
  status: ItemStatus
  source: ItemSource
  /** Zona de onde o campo saiu; nulo quando foi carimbado fora de qualquer zona. */
  zoneId: Id | null
  /**
   * O tipo foi escolhido pelo usuário?
   *
   * Ausente quer dizer que ele veio da zona — e então acompanha a zona quando
   * ela muda de significado. Escolha do usuário não se mexe nunca.
   */
  kindByUser?: boolean
  /** Traços que compõem este item. */
  strokeIds: Id[]
  /** Região da página que o item ocupa — usada pro recorte na tela estratificada. */
  bounds: Bounds
  /** Título legível. Vem do OCR ou digitado à mão; vazio até ser reconhecido. */
  title: string

  /*
   * A ficha do registro.
   *
   * É o que permite trabalhar na Central sem voltar à folha: prazo pra saber
   * o que corre, prioridade pra saber o que vem antes, responsável pra saber
   * com quem, e uma observação pro que a letra não disse. Tudo opcional — a
   * anotação continua valendo sozinha, sem nada disso preenchido.
   */
  /** Prazo, em epoch ms do início do dia. Nulo = sem prazo. */
  dueAt?: number | null
  priority?: Priority | null
  /** Com quem: nome livre, do jeito que o usuário escreve. */
  assignee?: string
  /** Observação digitada, além do que está escrito à mão. */
  note?: string
  /** Estado da transcrição da letra manuscrita. */
  ocr: OcrState
  createdAt: number
  updatedAt: number
}

/**
 * Estado da transcrição.
 *
 * `manual` é o texto que o usuário escreveu com o dedo: vale mais que qualquer
 * leitura automática e nunca é sobrescrito, nem quando a linha ganha palavras
 * novas depois.
 */
export type OcrState =
  | { status: 'pendente' }
  | { status: 'processando' }
  | { status: 'pronto'; text: string; at: number }
  | { status: 'manual'; text: string; at: number }
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
  /**
   * Onde a escuta parou, em ms.
   *
   * Guardado no banco, e não só na tela: uma conversa de uma hora se ouve em
   * pedaços, ao longo de dias. Opcional — gravação antiga simplesmente não tem,
   * e começa do zero como sempre começou.
   */
  positionMs?: number
}

// ─── Fluxograma ──────────────────────────────────────────────────────────────

/**
 * As formas que uma caixa pode ter.
 *
 * As três primeiras são as que a LEITURA sabe reconhecer num rabisco
 * (`flow/shapes.ts`): retângulo, losango e cantos redondos se distinguem pela
 * geometria do traço. As outras vêm da lateral do painel, escolhidas à mão —
 * paralelogramo, documento e cilindro são convenção de fluxograma, mas ninguém
 * desenha os três de um jeito que dê pra separar de um retângulo torto.
 *
 * Por isso a lista é maior que a de `ShapeKind`: o que se pode ESCOLHER é mais
 * do que o que se pode ADIVINHAR.
 */
export type FlowShape =
  | 'acao'
  | 'decisao'
  | 'terminal'
  | 'dados'
  | 'documento'
  | 'banco'

export interface FlowChartNode {
  id: Id
  kind: FlowShape
  /** O nome da caixa: lido da letra de dentro, ou escrito pelo usuário. */
  label: string
  /** O usuário mexeu no nome ou na forma? Então a remontagem não desfaz. */
  editado?: boolean
  /** Onde a caixa foi desenhada à mão — é o que dá a ordem esquerda/direita. */
  bounds: Bounds
  /**
   * Onde o usuário ARRASTOU a caixa, no desenho montado.
   *
   * Quando existe, manda no arranjo automático. O arranjo acerta a estrutura,
   * mas quem sabe o que fica bem ao lado de quê é quem desenhou — e remontar
   * não pode desfazer isso, pelo mesmo motivo que não desfaz um nome corrigido.
   */
  pos?: { x: number; y: number }
  /** Cor escolhida pelo usuário; sem ela, a cor é a da forma. */
  cor?: FlowColor
  /** Caixa que o usuário criou no painel, sem tinta nenhuma por trás. */
  criadaAMao?: boolean
}

/** As cores que uma caixa pode ter. Poucas, e cada uma com um sentido óbvio. */
export type FlowColor = 'azul' | 'verde' | 'laranja' | 'vermelho' | 'roxo' | 'cinza'

export interface FlowChartEdge {
  id: Id
  from: Id
  to: Id
  label: string
  /** A direção veio da ponta de seta desenhada, ou só da ordem do traço? */
  direcao: 'ponta' | 'ordem' | 'mao'
  /** Ligação que o usuário fez no painel, sem traço nenhum por trás. */
  criadaAMao?: boolean
}

/**
 * O fluxograma montado a partir do desenho de uma zona.
 *
 * Fica guardado porque o usuário corrige nomes à mão, e remontar do zero a
 * cada abertura apagaria essas correções — o mesmo motivo pelo qual o texto
 * transcrito à mão nunca é sobrescrito.
 */
export interface Flowchart {
  id: Id
  pageId: Id
  /**
   * A zona de onde veio, quando veio de uma.
   *
   * Hoje a leitura é da folha inteira: um fluxograma de verdade passa da
   * altura de uma folha, e a divisão em zonas se repete a cada folha — ler só
   * a zona fazia as caixas de baixo sumirem. Fica opcional pros fluxogramas
   * montados antes disso.
   */
  zoneId?: Id
  nodes: FlowChartNode[]
  edges: FlowChartEdge[]
  /** Quantos traços o leitor não soube aproveitar; aparece na tela. */
  soltos: number
  /**
   * O traço mais novo que entrou nesta leitura.
   *
   * Serve pra uma pergunta só: *há desenho na folha que este fluxograma ainda
   * não viu?* Não dá pra responder com `updatedAt`, que muda a cada edição do
   * painel — depois de trocar uma cor ele seria mais novo que a tinta, e o
   * aviso sumiria com desenho novo esperando.
   *
   * Opcional: fluxograma montado antes disto simplesmente não avisa.
   */
  lidoAte?: number
  /**
   * O que a leitura viu, passo a passo.
   *
   * Fica guardado e aparece na tela porque "não achei caixa nenhuma" é um
   * beco: sem estes números não dá pra saber se a caixa não fechou, se a seta
   * não encostou ou se a tinta nem chegou. Uma foto da tela basta.
   */
  diagnostico?: {
    tracos: number
    fechados: number
    juntados: number
    formas: number
    setas: number
    letra: number
    soltos: number
  }
  updatedAt: number
}

/** O blob de áudio vive numa store separada pra não pesar as consultas de metadados. */
export interface RecordingBlob {
  id: Id
  blob: Blob
}

// ─── Imagens ─────────────────────────────────────────────────────────────────

/**
 * Uma foto ou print colado na folha. Fica sempre ATRÁS da tinta, pra que dê
 * pra anotar por cima — que é o motivo de existir.
 */
export interface PageImage {
  id: Id
  pageId: Id
  /** Posição e tamanho em px de página. */
  rect: { x: number; y: number; w: number; h: number }
  mime: string
  /** Proporção original, preservada ao redimensionar. */
  aspect: number
  createdAt: number
}

/** Como no áudio, o binário fica separado dos metadados. */
export interface ImageBlob {
  id: Id
  blob: Blob
}
