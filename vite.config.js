import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // The Unity project (its Library/ alone is ~3 GB) and the Python venv are not part of the web app. Watching them
    // exhausts the OS inotify limit (ENOSPC) and crashes the dev server on startup. public/unity/ (the WebGL build)
    // must stay watched so Vite serves it, hence unity/CardiacDigitalTwin only.
    watch: {
      ignored: ['**/unity/CardiacDigitalTwin/**', '**/python_backend/**', '**/dist/**'],
    },
  },
})
