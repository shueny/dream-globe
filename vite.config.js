import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the static build works from any sub-path (GitHub Pages, etc.).
  base: './',
  build: {
    // three.js alone is ~600 kB; the single chunk is expected.
    chunkSizeWarningLimit: 1000,
  },
})
