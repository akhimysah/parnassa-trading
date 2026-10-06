import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Les données viennent des widgets TradingView (iframes) : aucun proxy ni clé d'API n'est nécessaire.
export default defineConfig({
  plugins: [react()],
  server: { port: 5200 },
});
