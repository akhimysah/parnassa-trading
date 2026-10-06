import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Les données viennent des widgets TradingView (iframes) : aucun proxy ni clé d'API n'est nécessaire.
// Le mode « pages » sert le site sous https://akhimysah.github.io/parnassa-trading/.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'pages' ? '/parnassa-trading/' : '/',
  server: { port: 5200 },
}));
