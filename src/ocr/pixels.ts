// Small pixel helpers shared by the photo clean-up steps. Pure functions on grey images, so they are tested without a browser.

/** Mean of a (2r+1) square around each pixel, via an integral image. */
export function boxBlur(g: Float32Array, w: number, h: number, r: number): Float32Array {
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += g[y * w + x]!
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1]! + row
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      const sum = integral[y1 * (w + 1) + x1]! - integral[y0 * (w + 1) + x1]! - integral[y1 * (w + 1) + x0]! + integral[y0 * (w + 1) + x0]!
      out[y * w + x] = sum / ((x1 - x0) * (y1 - y0))
    }
  }
  return out
}
