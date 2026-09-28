import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // A versão do APK entra no próprio app, pra que ele saiba se identificar.
  // Fora da esteira do GitHub vale "dev".
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APK_VERSION_CODE ?? 'dev'),
  },
  plugins: [
    react(),
    VitePWA({
      /*
       * O service worker se AUTODESTRÓI, de propósito.
       *
       * Dentro do APK os arquivos já vêm no aparelho: o cache do service
       * worker não acrescenta nada e ainda traz um risco sério — ele guarda a
       * versão antiga da tela e continua servindo ela depois que o usuário
       * instala a atualização, ou serve um index.html que aponta pra arquivos
       * que a versão nova não tem mais. Um app que abre branco depois de
       * atualizar, sem explicação nenhuma.
       *
       * Com `selfDestroying`, o service worker que já está instalado em quem
       * usava as versões anteriores é substituído por um que se apaga e limpa
       * os caches. Quem instalar daqui pra frente nunca mais terá um.
       *
       * Contrapartida: o caminho por navegador (Termux) perde o modo offline.
       * É legado — o APK é o caminho real, e nele nada disso faz falta.
       */
      selfDestroying: true,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      // O servidor simples do Termux (python -m http.server) não conhece a
      // extensão .webmanifest e a entrega com o tipo errado, o que faz o
      // Chrome recusar a instalação. Com .json o tipo sai correto.
      manifestFilename: 'manifest.json',
      manifest: {
        name: 'Organizador',
        short_name: 'Organizador',
        description: 'Caderno de trabalho com caneta que se organiza sozinho',
        theme_color: '#101013',
        background_color: '#101013',
        display: 'fullscreen',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        // Depois da primeira abertura o app roda direto do cache: o ícone na
        // tela inicial funciona mesmo com o servidor desligado.
        navigateFallback: 'index.html',
      },
    }),
  ],
})
