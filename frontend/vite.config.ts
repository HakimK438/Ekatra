import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // In development the API runs on :8000 (override with API_URL); in production a rewrite sends /api to the API project (vercel.json).
  const api = loadEnv(mode, '.', '').API_URL || 'http://localhost:8000'
  return {
    plugins: [react()],
    server: { proxy: { '/api': api } },
    preview: { proxy: { '/api': api } },
    test: { environment: 'node' },
    build: {
      rollupOptions: {
        output: {
          // Large libraries in their own files, so browsers cache them across updates of the app itself.
          manualChunks: {
            charts: ['recharts'],
            react: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query'],
          },
        },
      },
    },
  }
})
