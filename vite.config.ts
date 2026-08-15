import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
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
