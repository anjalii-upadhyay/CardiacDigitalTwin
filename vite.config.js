import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['b144-2401-4900-57a0-42f6-6c28-f126-64d2-834.ngrok-free.app'],
    // The Unity project (its Library/ alone is ~3 GB), the Python backend and the dataset
    // are not part of the web app. Watching them exhausts the OS inotify limit (ENOSPC)
    // and crashes the dev server on startup.
    watch: {
      ignored: ['**/unity/**', '**/python_backend/**', '**/dataset/**', '**/models/**', '**/dist/**'],
    },
  },
})
