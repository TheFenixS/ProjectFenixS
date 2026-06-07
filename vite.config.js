import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    // Lokaalissa kehityksessä: aja `vercel dev` portissa 3000
    // Vite ohjaa /api/* kutsut sinne jolloin [...path].js toimii
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
