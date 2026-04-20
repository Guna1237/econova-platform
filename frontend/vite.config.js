import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = 'http://localhost:8000'

// Proxy all backend routes through Vite dev server to avoid CORS in local dev.
// In production (Vercel), the frontend calls the Render backend directly via VITE_API_URL.
const backendProxy = () => ({
  target: BACKEND,
  changeOrigin: true,
  secure: false,
})

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      '/token':       backendProxy(),
      '/users':       backendProxy(),
      '/market':      backendProxy(),
      '/auction':     backendProxy(),
      '/admin':       backendProxy(),
      '/loans':       backendProxy(),
      '/treasury':    backendProxy(),
      '/offers':      backendProxy(),
      '/mortgage':    backendProxy(),
      '/news':        backendProxy(),
      '/banking':     backendProxy(),
      '/shortsell':   backendProxy(),
      '/leaderboard': backendProxy(),
      '/banker':      backendProxy(),
      // SSE endpoint
      '/events': {
        target: BACKEND,
        changeOrigin: true,
        secure: false,
      },
      // WebSocket fallback
      '/ws': {
        target: BACKEND.replace('http', 'ws'),
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
