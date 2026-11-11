import { describe, expect, it } from 'vitest'
import { readQuality } from './read'

describe('readQuality', () => {
  it('averages line confidence weighted by how much text each line holds', () => {
    expect(readQuality([{ text: 'ABCDEFGHIJ', conf: 90 }, { text: 'KLMNO', conf: 40 }])).toBeCloseTo((90 * 10 + 40 * 5) / 15)
  })
  it('ignores lines with almost no text, such as stray marks', () => {
    expect(readQuality([{ text: 'ABCDEFGH', conf: 80 }, { text: '| .', conf: 0 }, { text: 'a', conf: 5 }])).toBe(80)
  })
  it('is 0 when nothing readable came out', () => {
    expect(readQuality([])).toBe(0)
    expect(readQuality([{ text: '__ ..', conf: 90 }])).toBe(0)
  })
})
