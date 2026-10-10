import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Version publiée : le commit fourni par GitHub Actions (« local » ailleurs), pour dater les erreurs signalées.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const VERSION = env.GITHUB_SHA?.slice(0, 7) ?? 'local';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __VERSION__: JSON.stringify(VERSION) },
  base: mode === 'pages' ? '/parnassa-trading/' : '/',
  server: { port: 5200 },
}));
