import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Empacotamento do Organizador como app Android.
 *
 * O `appId` é a identidade do app pro Android. Ele NÃO PODE MUDAR: o sistema
 * usa esse nome pra saber que uma instalação nova é a atualização da anterior.
 * Trocá-lo faria o Android tratar o app como outro programa, e as anotações
 * ficariam presas na instalação antiga.
 *
 * `webDir` aponta pra pasta que o `npm run build:tablet` gera — o mesmo pacote
 * que roda no navegador, agora servido de dentro do app.
 */
const config: CapacitorConfig = {
  appId: 'com.leomerets.organizador',
  appName: 'Organizador',
  webDir: 'tablet',
  android: {
    // A tinta é desenhada em canvas; sem isto o Android pode escolher um
    // caminho de renderização que engasga o traço.
    webContentsDebuggingEnabled: false,
  },
}

export default config
