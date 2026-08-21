import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const replitHosts = ['.replit.dev', '.repl.co', '.replit.app'];

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: 'index.html',
        control: 'control/index.html',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: replitHosts,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: replitHosts,
  },
});
