// Copies the OCR engine into public/ocr so the page loads everything from its own origin and never from a CDN.
// Runs before dev and build; the copied files are git-ignored (about 11 MB).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'ocr')
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
]

mkdirSync(out, { recursive: true })
for (const [from, to] of files) {
  const src = join(root, from)
  if (!existsSync(src)) {
    console.error(`Missing ${from}. Run "npm install" first.`)
    process.exit(1)
  }
  copyFileSync(src, join(out, to))
}
console.log(`OCR assets copied to public/ocr (${files.length} files)`)
