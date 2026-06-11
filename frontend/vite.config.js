import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    host: '0.0.0.0',
    port: 2059,

    allowedHosts: [
      'backend.iic.utsav56.me',
    ],

    proxy: {
      '/api': {
        target: 'https://backend.iic.utsav56.me',
        changeOrigin: true,
        ws: true
      },
      '/ws': {
        target: 'ws://backend.iic.utsav56.me',
        ws: true
      },
      '/uploads': {
        target: 'https://backend.iic.utsav56.me',
        changeOrigin: true
      }
    }
  }
});