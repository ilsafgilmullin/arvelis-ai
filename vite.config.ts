import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const replitHosts = ['.replit.dev', '.repl.co', '.replit.app'];

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: replitHosts,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: replitHosts,
  },
});
