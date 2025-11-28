import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',       // listen on all interfaces inside container
    port: 5051,
    hmr: {
      host: '59.103.246.24', // <-- external IP your browser uses
      protocol: 'ws',         // 'ws' for HTTP, 'wss' for HTTPS
    },
    watch: {
      usePolling: true,      // optional: helps Docker detect file changes
    },
  },
})
