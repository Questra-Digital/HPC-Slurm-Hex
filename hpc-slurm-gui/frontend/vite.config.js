import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` (development, production, etc.)
  const env = loadEnv(mode, process.cwd())

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5051,
      hmr: {
        host: env.HMR_HOST,   // 👈 using env variable here
        protocol: 'ws',
      },
      watch: {
        usePolling: true,
      },
    },
  }
})