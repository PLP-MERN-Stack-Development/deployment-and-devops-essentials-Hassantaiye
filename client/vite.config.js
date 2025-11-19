import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  
  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: mode === 'production' ? false : 'hidden',
    minify: mode === 'production' ? 'terser' : 'esbuild',
    terserOptions: mode === 'production' ? {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    } : {},
    rollupOptions: {
      output: {
        // Code splitting configuration
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('socket.io-client')) {
              return 'vendor-socket';
            }
            if (id.includes('axios')) {
              return 'vendor-axios';
            }
            if (id.includes('react-icons')) {
              return 'vendor-icons';
            }
            return 'vendor-other';
          }
        },
        // File naming for better caching
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name.split('.')[1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            return 'assets/images/[name]-[hash][extname]';
          }
          if (/woff|woff2|eot|ttf|otf/i.test(extType)) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    // Chunk size warning limit
    chunkSizeWarningLimit: 1600,
  },
  
  // Server configuration for development
  server: {
    port: 5173,
    host: true, // Listen on all addresses
    open: true, // Automatically open browser
    cors: true,
    proxy: {
      // API proxy for development
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      // Socket.IO proxy for development
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  
  // Preview configuration (production build preview)
  preview: {
    port: 4173,
    host: true,
    open: true,
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      // Add any path aliases you need
      '@': '/src',
      '@components': '/src/components',
      '@assets': '/src/assets',
    },
  },
  
  // Environment variables configuration
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  
  // Base public path
  base: './',
}))