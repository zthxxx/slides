import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { BellDetector } from '../runtime/bell'

/** Printable text, also non-ASCII, with none of the bytes that start, end or cancel a sequence. */
const text = fc.string({ unit: 'grapheme', maxLength: 12 }).map(value => value.replace(/[\x00-\x1F\x7F]/g, ''))

/** A piece of terminal output and whether it rings. */
const piece: fc.Arbitrary<{ bytes: string, rings: number }> = fc.oneof(
  text.map(value => ({ bytes: value, rings: 0 })),
  fc.constant({ bytes: '\x07', rings: 1 }),
  // OSC ended by BEL (window titles, color replies) or by ST.
  fc.tuple(fc.integer({ min: 0, max: 9999 }), text, fc.constantFrom('\x07', '\x1B\\'))
    .map(([code, value, end]) => ({ bytes: `\x1B]${code};${value}${end}`, rings: 0 })),
  // CSI with parameters, such as SGR and cursor moves.
  fc.tuple(fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 4 }), fc.constantFrom('m', 'H', 'A', 'J', 'h'))
    .map(([params, final]) => ({ bytes: `\x1B[${params.join(';')}${final}`, rings: 0 })),
  // DCS, APC (kitty graphics), PM, SOS strings ended by ST.
  fc.tuple(fc.constantFrom('P', '_', '^', 'X'), text)
    .map(([introducer, value]) => ({ bytes: `\x1B${introducer}${value}\x1B\\`, rings: 0 })),
)

const output = fc.array(piece, { maxLength: 30 })

/** Cut a string into consecutive chunks at the given positions. */
function chunked(value: string, cuts: number[]): string[] {
  const points = [...new Set(cuts.map(cut => cut % (value.length + 1)))].sort((a, b) => a - b)
  const chunks: string[] = []
  let start = 0
  for (const point of points) {
    chunks.push(value.slice(start, point))
    start = point
  }
  chunks.push(value.slice(start))
  return chunks
}

describe('terminal bell', () => {
  test('rings once per standalone BEL, never for one that ends or sits in a string, however the output is split', () => {
    fc.assert(fc.property(output, fc.array(fc.nat(), { maxLength: 8 }), fc.boolean(), (pieces, cuts, asBytes) => {
      const stream = pieces.map(item => item.bytes).join('')
      const detector = new BellDetector()
      const encoder = new TextEncoder()
      const rings = chunked(stream, cuts)
        .reduce((sum, chunk) => sum + detector.scan(asBytes ? encoder.encode(chunk) : chunk), 0)
      expect(rings).toBe(pieces.reduce((sum, item) => sum + item.rings, 0))
    }))
  })
})
