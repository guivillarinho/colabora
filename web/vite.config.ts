import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL ?? 'http://localhost:3000',
    ),
    'process.env.VITE_USER_AVATAR_URL': JSON.stringify(
      process.env.VITE_USER_AVATAR_URL ?? '',
    ),
    'process.env.VITE_CLOUD_UPLOADS': JSON.stringify(
      process.env.VITE_CLOUD_UPLOADS ?? 'false',
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
})
