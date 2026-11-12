import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // relative base so the build works on GitHub Pages (username.github.io/repo/) and anywhere else
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      manifest: {
        name: 'Streak',
        short_name: 'Streak',
        description: 'Habits, streaks and Koban rewards – private, offline, no ads.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f4ede1',
        theme_color: '#b8860b',
        icons: [
          { src: 'icons/streak-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/streak-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/streak-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,json,m4a,mp3}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
