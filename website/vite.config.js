import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    // The gzip-size report does an extra full pass over every chunk after
    // bundling — skipping it noticeably lowers peak memory during `build`,
    // which matters on small instances (e.g. a 1GB EC2 t3.micro).
    reportCompressedSize: false,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:5001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5001', changeOrigin: true },
    },
  },
});
