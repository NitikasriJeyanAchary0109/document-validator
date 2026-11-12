// Copies the OCR engines into public/ocr so the page loads everything from its own origin and never from a CDN:
// Tesseract (engine, WebAssembly core, English data) and PaddleOCR (detection and recognition models, ONNX Runtime).
// Runs before dev and build; the copied files are git-ignored (about 41 MB, loaded only when someone reads a photo).
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
  ['node_modules/@gutenye/ocr-models/assets/ch_PP-OCRv4_det_infer.onnx', 'det.onnx'],
  ['node_modules/@gutenye/ocr-models/assets/ch_PP-OCRv4_rec_infer.onnx', 'rec.onnx'],
  ['node_modules/@gutenye/ocr-models/assets/ppocr_keys_v1.txt', 'dict.txt'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
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
