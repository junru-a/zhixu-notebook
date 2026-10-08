import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { architectureMiddleware } from './server/architecture.js';
import { launcherHealth } from './server/launcherHealth.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DEEPSEEK_');
  const config = { apiKey: process.env.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || env.DEEPSEEK_MODEL || 'deepseek-flash' };
  return {
  plugins: [react(), { name: 'local-architecture-api', configureServer(server) { server.middlewares.use(launcherHealth(process.cwd())); server.middlewares.use(architectureMiddleware(config)); }, configurePreviewServer(server) { server.middlewares.use(launcherHealth(process.cwd())); server.middlewares.use(architectureMiddleware(config)); } }],
  server: { host: '127.0.0.1', port: 5290, strictPort: true },
  test: { environment: 'node' },
}; });
