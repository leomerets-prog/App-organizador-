/**
 * Verificação de versão nova.
 *
 * O app é offline por natureza, então isto é sempre um extra: falhar em
 * verificar não pode atrapalhar nada, e não existe checagem automática
 * incomodando no meio do trabalho — quem pergunta é o usuário.
 *
 * LIMITE CONHECIDO: o repositório é privado, e a API do GitHub responde 404
 * para quem não está autenticado. Sem tornar algo público, o app não consegue
 * LER qual é a versão mais recente. Guardar um token dentro do APK resolveria
 * e está fora de cogitação: qualquer pessoa com o arquivo leria o repositório.
 *
 * Por isso o caminho manual — abrir a página de versões no navegador, onde o
 * usuário já está logado — é o principal, e não um plano B. A verificação
 * automática fica pronta e entra em funcionamento sozinha se um dia a origem
 * das versões virar pública.
 */

/** Versão instalada. Injetada na compilação; "dev" quando roda do código. */
export const INSTALLED_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

export const RELEASES_PAGE =
  'https://github.com/leomerets-prog/App-organizador-/releases/tag/ultimo'

const RELEASE_API =
  'https://api.github.com/repos/leomerets-prog/App-organizador-/releases/tags/ultimo'

export type UpdateCheck =
  | { estado: 'atualizado'; versao: string }
  | { estado: 'disponivel'; versao: string }
  | { estado: 'sem-internet' }
  | { estado: 'sem-acesso' }
  | { estado: 'falhou' }

/**
 * Pergunta ao GitHub qual é a última versão publicada.
 * Nunca lança: qualquer tropeço vira um estado que a tela sabe explicar.
 */
export async function checkForUpdate(signal?: AbortSignal): Promise<UpdateCheck> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { estado: 'sem-internet' }
  }

  try {
    const resposta = await fetch(RELEASE_API, {
      signal,
      headers: { Accept: 'application/vnd.github+json' },
    })

    // 404 aqui quase sempre significa repositório privado, não versão ausente.
    if (resposta.status === 404 || resposta.status === 401 || resposta.status === 403) {
      return { estado: 'sem-acesso' }
    }
    if (!resposta.ok) return { estado: 'falhou' }

    const dados = (await resposta.json()) as { body?: string }
    const publicada = parseVersion(dados.body ?? '')
    if (!publicada) return { estado: 'falhou' }

    return isNewer(publicada, INSTALLED_VERSION)
      ? { estado: 'disponivel', versao: publicada }
      : { estado: 'atualizado', versao: publicada }
  } catch {
    return { estado: 'sem-internet' }
  }
}

/** A descrição da versão começa com "Versão N"; é dali que sai o número. */
export function parseVersion(texto: string): string | null {
  const achou = /Vers[aã]o\s+(\d+)/i.exec(texto)
  return achou ? achou[1] : null
}

/** Compara versões numéricas. "dev" nunca é considerada atualizada. */
export function isNewer(publicada: string, instalada: string): boolean {
  const a = Number(publicada)
  const b = Number(instalada)
  if (!Number.isFinite(a)) return false
  if (!Number.isFinite(b)) return true
  return a > b
}

/**
 * Abre a página de versões fora do app.
 *
 * Dentro do APK isto entrega o endereço ao navegador do sistema, que é onde o
 * usuário está logado no GitHub e onde o Android sabe instalar o arquivo.
 */
export function openReleasesPage(): void {
  window.open(RELEASES_PAGE, '_blank', 'noopener')
}
