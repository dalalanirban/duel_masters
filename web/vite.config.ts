import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: false
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/') || id.includes('node_modules\\three\\')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/motion/') || id.includes('node_modules\\motion\\')) {
            return 'vendor-motion';
          }
        }
      }
    }
  }
});
