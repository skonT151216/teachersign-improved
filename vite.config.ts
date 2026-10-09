import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.SINGLE_FILE === 'true' ? [viteSingleFile()] : []),
  ],
  base: './',
  optimizeDeps: { entries: ['index.html'] },
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { proxy: { '/api': `http://127.0.0.1:${process.env.TEACHERSIGN_API_PORT || '8787'}` }, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.teachersign-demo/**'] }, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } },
});
