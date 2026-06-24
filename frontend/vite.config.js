import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // base: '/saripos/',  
  //

  server: {
    // Proxy API calls to XAMPP during development.
    // React runs on localhost:5173; PHP runs on localhost:80/saripos/backend/
    proxy: {
      '/saripos': {
        target: 'http://localhost',
        changeOrigin: true,
      },
    },
  },

  build: {
    // After `npm run build`, copy the contents of dist/ into
    // C:/xampp/htdocs/saripos/ alongside the backend/ folder.
    outDir: '../dist',
    emptyOutDir: true,
  },
});
