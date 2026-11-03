import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri loads the dev server from 127.0.0.1 and needs the port fixed.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: { target: 'chrome110' },
});
