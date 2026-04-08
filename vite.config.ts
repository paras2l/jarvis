import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/src/')) {
            if (id.includes('node_modules')) {
              if (
                id.includes('react-dom') ||
                id.includes('react/jsx-runtime') ||
                id.includes('react/jsx-dev-runtime') ||
                id.includes('react/index') ||
                id.includes('scheduler') ||
                id.includes('loose-envify') ||
                id.includes('use-sync-external-store')
              ) {
                return 'vendor-react'
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase'
              }
              if (id.includes('tesseract.js') || id.includes('bmp-js') || id.includes('zlibjs') || id.includes('node-fetch')) {
                return 'vendor-ocr'
              }
            }
            return undefined
          }
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@core': path.resolve(__dirname, './src/core'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@styles': path.resolve(__dirname, './src/styles'),
    },
  },
})
