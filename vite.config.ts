import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// In the production build the page may not make any network request at all: the app has no server and nothing leaves
// the device. The dev server needs a websocket for hot reload, so this only applies to `vite build`.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'"

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'no-network-csp',
      apply: 'build',
      transformIndexHtml: (html) => html.replace('</head>', `    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n  </head>`),
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
