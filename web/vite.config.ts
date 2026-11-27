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
          const normalized = id.replace(/\\/g, '/');
          if (
            normalized.includes('/node_modules/react/') ||
            normalized.includes('/node_modules/react-dom/') ||
            normalized.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (normalized.includes('/node_modules/three/')) {
            return 'vendor-three';
          }
          if (
            normalized.includes('/node_modules/motion/') ||
            normalized.includes('/node_modules/motion-dom/') ||
            normalized.includes('/node_modules/motion-utils/') ||
            normalized.includes('/node_modules/framer-motion/')
          ) {
            return 'vendor-motion';
          }
          if (
            normalized.includes('/src/data/all_cards.json') ||
            normalized.includes('/src/data/sets.json') ||
            normalized.includes('/src/data/cardDataset.')
          ) {
            return 'card-data';
          }
        }
      }
    }
  }
});
