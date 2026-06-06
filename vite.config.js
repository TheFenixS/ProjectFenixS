import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      open: true,
    },
    define: {
      __INVENTORY_API__: JSON.stringify(
        env.VITE_INVENTORY_API || 'http://localhost:8000'
      ),
      __PUMP_API__: JSON.stringify(
        env.VITE_PUMP_API || 'http://localhost:8001'
      ),
      __PORTFOLIO_API__: JSON.stringify(
        env.VITE_PORTFOLIO_API || 'http://localhost:8002'
      ),
    },
  };
});
