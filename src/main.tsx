import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { ErrorBoundary, installCrashScreen, showCrash } from './crash'

// Antes de tudo: a partir daqui, nenhum erro deixa a tela branca e muda.
installCrashScreen()

/*
 * Varre service workers e caches antigos.
 *
 * Quem usou as versões anteriores tem um service worker registrado guardando a
 * tela inteira. Dentro do APK isso não ajuda em nada — os arquivos já estão no
 * aparelho — e atrapalha muito: depois de atualizar, ele pode continuar
 * servindo a versão velha, ou um index.html que aponta pra arquivos que a
 * versão nova não tem mais. Aqui o registro é desfeito na primeira abertura.
 */
function limparCacheAntigo(): void {
  try {
    void navigator.serviceWorker?.getRegistrations().then((registros) => {
      for (const registro of registros) void registro.unregister()
    })
    void caches?.keys().then((chaves) => {
      for (const chave of chaves) void caches.delete(chave)
    })
  } catch {
    // Navegador sem service worker ou com armazenamento bloqueado: nada a fazer.
  }
}

limparCacheAntigo()

// Marca de arranque. A verificação automática (tools/smoke-android.sh) procura
// estas linhas no log do Android pra saber se o app abriu de verdade.
console.log('organizador: iniciando')

try {
  const raiz = document.getElementById('root')
  if (!raiz) throw new Error('A página abriu sem o elemento raiz.')

  createRoot(raiz).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
} catch (error) {
  showCrash(error, 'erro ao abrir o app')
}
