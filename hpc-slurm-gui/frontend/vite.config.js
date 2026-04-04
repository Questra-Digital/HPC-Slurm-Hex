import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',       // listen on all interfaces inside container
    port: 5051,
    hmr: {
      //host: 'localhost', // <-- external IP your browser uses
      host: '59.103.246.24', // <-- external IP your browser uses
      //clientPort: 5051,   // <-- browser-facing port for HMR websocket on windows development
      clientPort: 80,   // <-- browser-facing port for HMR websocket
      protocol: 'ws',         // 'ws' for HTTP, 'wss' for HTTPS
    },
    watch: {
      usePolling: true,      // optional: helps Docker detect file changes
    },
  },
})
