import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// In the production build the page may only talk to its own origin: there is no server to send anything to, and the
// OCR engine and its language data are loaded from this site rather than a CDN (connect-src 'self', worker-src 'self').
// The dev server needs a websocket for hot reload, so this only applies to `vite build`.
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'"

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      // ONNX Runtime names its WebAssembly file in its own code, so the bundler copies it into assets/. The app loads its
      // copy from ocr/ (see src/ocr/paddle.ts), so the second copy is dead weight.
      name: 'drop-duplicate-ort-wasm',
      apply: 'build',
      generateBundle(_, bundle) {
        for (const name of Object.keys(bundle)) if (/assets\/ort-wasm.*\.wasm$/.test(name)) delete bundle[name]
      },
    },
    {
      name: 'no-network-csp',
      apply: 'build',
      transformIndexHtml: (html) => html.replace('</head>', `    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n  </head>`),
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'eval/**/*.test.ts'],
  },
})
