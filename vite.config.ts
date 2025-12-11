
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Đảm bảo đường dẫn gốc là /
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true
  }
})
