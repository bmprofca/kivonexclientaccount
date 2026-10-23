import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Kivonex Cloud API the dev server forwards to; the browser test points it at a throwaway one.
const api = process.env.KIVONEX_API ?? 'http://127.0.0.1:8790'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT ?? 5176),
    strictPort: true,
    proxy: {
      '/v1': api,
      '/healthz': api
    }
  }
})
