import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: { outDir: '.gas-build', emptyOutDir: true, target: 'es2022', rollupOptions: { input: 'gas-entry.html' } },
});
