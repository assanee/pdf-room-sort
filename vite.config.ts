import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Pure static SPA. Vercel auto-detects the Vite preset:
//   build:  npm run build   ->  output: dist
// No serverless functions, no environment variables.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
