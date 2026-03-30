import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    test: {
      environment: "node",
      env: {
        VITE_API_URL: process.env.VITE_API_URL ?? 'http://localhost:8000',
      }
    },
    base: "/",
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_URL ?? 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})