import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['b144-2401-4900-57a0-42f6-6c28-f126-64d2-834.ngrok-free.app'],
  },
})
