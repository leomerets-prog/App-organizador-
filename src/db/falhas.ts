/**
 * O BANCO NÃO CONSEGUIU GUARDAR — e o usuário precisa saber.
 *
 * Cada ação grava na memória primeiro (a tela responde na hora) e no banco
 * depois. Quando o banco recusa (armazenamento cheio — com reuniões de uma
 * hora gravadas, é o cenário provável —, conexão caída, transação abortada), a
 * falha ia parar num `console.warn` que ninguém lê: a tinta continuava na tela
 * e sumia na próxima abertura. Achado da revisão da casa, reproduzido: traço
 * na tela, zero no banco, nenhum aviso.
 *
 * Aqui mora só o reconhecimento da falha e o aviso pra quem estiver ouvindo.
 * Puro o bastante pra ser conferido em teste.
 */

/** Os erros que só o banco do navegador (IndexedDB) produz. */
const NOMES_DO_BANCO = new Set([
  'QuotaExceededError',
  'AbortError',
  'InvalidStateError',
  'TransactionInactiveError',
  'UnknownError',
  'VersionError',
  'DataError',
  'ReadOnlyError',
  'DataCloneError',
  'ConstraintError',
])

export function ehFalhaDoBanco(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false
  const nome = (erro as { name?: unknown }).name
  return typeof nome === 'string' && NOMES_DO_BANCO.has(nome)
}

/** A falha em palavras que ele entende e que dizem o que fazer. */
export function explicarFalha(erro: unknown): string {
  const nome = (erro as { name?: string } | null)?.name
  if (nome === 'QuotaExceededError') {
    return 'O armazenamento do tablet está cheio.'
  }
  return 'O banco do aplicativo recusou a gravação.'
}

type Ouvinte = (mensagem: string) => void
const ouvintes = new Set<Ouvinte>()

export function aoFalharGravacao(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function avisarFalhaDeGravacao(erro: unknown): void {
  const mensagem = explicarFalha(erro)
  for (const ouvinte of ouvintes) {
    try {
      ouvinte(mensagem)
    } catch {
      // Um ouvinte com problema não pode calar os outros.
    }
  }
}
