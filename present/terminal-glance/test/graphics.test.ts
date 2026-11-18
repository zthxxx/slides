import type { StreamEvent } from '../runtime/graphics'
import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { cursorPast, decodeBase64, GraphicsStream, imageSize, KittyAssembler, layoutCells, parseLength } from '../runtime/graphics'

const ST = '\x1B\\'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/** Printable text with line breaks, other escape sequences the VT parser must still get, and erases. */
const plain = fc.string({ unit: fc.constantFrom(...'abc xyz012\r\n─╭'), maxLength: 40 })
const passThrough = fc.constantFrom('\x1B[31m', '\x1B[0m', '\x1B[2K', '\x1B[?1049h', '\x1B]0;title\x07', `\x1B]7501;state=done${ST}`, '\x1B_Xother\x1B\\', '\x1B[H', '\x1B[5D', '\x1B[1J')
const erase = fc.constantFrom<[string, string]>(['\x1B[J', 'below'], ['\x1B[0J', 'below'], ['\x1B[2J', 'screen'], ['\x1B[3J', 'scrollback'], ['\x1Bc', 'all'])
const pairKey = fc.string({ unit: fc.constantFrom(...'abcfmsvCrqiI'), minLength: 1, maxLength: 3 })
const pairValue = fc.string({ unit: fc.constantFrom(...'0123456789Tdtp'), minLength: 1, maxLength: 4 })
const base64 = fc.uint8Array({ maxLength: 300 }).map(toBase64)
const kitty = fc.record({ control: fc.dictionary(pairKey, pairValue, { maxKeys: 5 }), base64 })
const iterm2 = fc.record({ args: fc.dictionary(fc.constantFrom('inline', 'width', 'height', 'name', 'size'), pairValue, { maxKeys: 4 }), base64, end: fc.constantFrom('\x07', ST) })

type Part =
  | { kind: 'plain', text: string }
  | { kind: 'erase', text: string, region: string }
  | { kind: 'kitty', control: Record<string, string>, base64: string }
  | { kind: 'iterm2', args: Record<string, string>, base64: string, end: string }

const part: fc.Arbitrary<Part> = fc.oneof(
  plain.map(text => ({ kind: 'plain' as const, text })),
  passThrough.map(text => ({ kind: 'plain' as const, text })),
  erase.map(([text, region]) => ({ kind: 'erase' as const, text, region })),
  kitty.map(command => ({ kind: 'kitty' as const, ...command })),
  iterm2.map(command => ({ kind: 'iterm2' as const, ...command })),
)

const join = (pairs: Record<string, string>, separator: string) => Object.entries(pairs).map(([key, value]) => `${key}=${value}`).join(separator)

function serialize(parts: Part[]): string {
  return parts.map((entry) => {
    if (entry.kind === 'plain' || entry.kind === 'erase')
      return entry.text
    if (entry.kind === 'kitty')
      return `\x1B_G${join(entry.control, ',')};${entry.base64}${ST}`
    return `\x1B]1337;File=${join(entry.args, ';')}:${entry.base64}${entry.end}`
  }).join('')
}

/** Feeds the bytes in chunks of the given sizes; adjacent text events are merged, since chunking may split text anywhere. */
function run(bytes: Uint8Array, sizes: number[]) {
  const stream = new GraphicsStream()
  const events: StreamEvent[] = []
  let offset = 0
  for (const size of [...sizes, bytes.length]) {
    const next = Math.min(offset + size, bytes.length)
    events.push(...stream.push(bytes.slice(offset, next)))
    offset = next
  }
  const merged: (Exclude<StreamEvent, { kind: 'text' | 'erase' }> | { kind: 'erase', region: string, data: string } | { kind: 'text', text: string })[] = []
  for (const event of events) {
    if (event.kind === 'erase') {
      merged.push({ ...event, data: decoder.decode(event.data) })
      continue
    }
    if (event.kind !== 'text') {
      merged.push(event)
      continue
    }
    const last = merged.at(-1)
    const text = decoder.decode(event.data, { stream: true })
    if (last?.kind === 'text')
      last.text += text
    else
      merged.push({ kind: 'text', text })
  }
  return merged.filter(event => event.kind !== 'text' || event.text !== '')
}

function expected(parts: Part[]) {
  const events: ReturnType<typeof run> = []
  const text = (value: string) => {
    const last = events.at(-1)
    if (last?.kind === 'text')
      last.text += value
    else if (value)
      events.push({ kind: 'text', text: value })
  }
  for (const entry of parts) {
    if (entry.kind === 'plain') {
      text(entry.text)
    }
    else if (entry.kind === 'erase') {
      events.push({ kind: 'erase', region: entry.region as 'below', data: entry.text })
    }
    else if (entry.kind === 'kitty') {
      events.push({ kind: 'kitty', control: entry.control, base64: entry.base64 })
    }
    else {
      events.push({ kind: 'iterm2', args: entry.args, base64: entry.base64 })
    }
  }
  return events
}

describe('inline image sequences in the output stream', () => {
  test('images come out in order and every other byte reaches the VT parser, erases as their own events, across any chunking', () => {
    fc.assert(fc.property(
      fc.array(part, { maxLength: 12 }),
      fc.array(fc.integer({ min: 0, max: 40 }), { maxLength: 60 }),
      (parts, sizes) => {
        expect(run(encoder.encode(serialize(parts)), sizes)).toEqual(expected(parts))
      },
    ))
  })

  test('an image sequence cut off by another escape is dropped, and the escape that cut it is kept', () => {
    fc.assert(fc.property(base64, plain, fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 30 }), (data, after, sizes) => {
      const bytes = encoder.encode(`\x1B_Ga=T;${data}\x1B[31m${after}`)
      expect(run(bytes, sizes)).toEqual(expected([{ kind: 'plain', text: `\x1B[31m${after}` }]))
    }))
  })
})

describe('kitty chunked transmission', () => {
  test('chunks join to the whole payload under the first chunk\'s control data', () => {
    fc.assert(fc.property(
      fc.dictionary(fc.constantFrom('a', 'f', 'c', 'r', 'i'), pairValue, { maxKeys: 4 }),
      fc.uint8Array({ minLength: 1, maxLength: 3000 }),
      fc.integer({ min: 1, max: 200 }),
      (control, bytes, chunkSize) => {
        const payload = toBase64(bytes)
        const assembler = new KittyAssembler()
        const results = []
        for (let offset = 0; offset < payload.length; offset += chunkSize * 4) {
          const last = offset + chunkSize * 4 >= payload.length
          const chunkControl = offset === 0 ? { ...control, m: last ? '0' : '1' } : { m: last ? '0' : '1' }
          results.push(assembler.push({ control: chunkControl, base64: payload.slice(offset, offset + chunkSize * 4) }))
        }
        const complete = results.filter(result => result !== undefined)
        expect(complete).toHaveLength(1)
        expect(results.at(-1)).toBe(complete[0])
        const { m: _more, ...keys } = complete[0]!.control
        expect(keys).toEqual(control)
        expect(complete[0]!.base64).toBe(payload)
        expect(decodeBase64(complete[0]!.base64)).toEqual(bytes)
      },
    ))
  })
})

const dimension = fc.integer({ min: 1, max: 65535 })

function u16be(value: number) {
  return [value >> 8, value & 0xFF]
}

describe('image size from file headers', () => {
  test('PNG, GIF and JPEG headers give the pixel size', () => {
    fc.assert(fc.property(dimension, dimension, fc.uint8Array({ maxLength: 40 }), (width, height, filler) => {
      const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, ...u16be(width), 0, 0, ...u16be(height), 8, 6, 0, 0, 0])
      const gif = new Uint8Array([...encoder.encode('GIF89a'), width & 0xFF, width >> 8, height & 0xFF, height >> 8, 0, 0, 0])
      // SOI, an APP0 segment of arbitrary content, then SOF0: length, precision, height, width.
      const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, ...u16be(filler.length + 2), ...filler, 0xFF, 0xC0, 0, 17, 8, ...u16be(height), ...u16be(width), 3, 0, 0, 0])
      for (const file of [png, gif, jpeg])
        expect(imageSize(file)).toEqual({ width, height })
    }))
  })

  test('other bytes give no size', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
      fc.pre(bytes[0] !== 0x89 && bytes[0] !== 0x47 && bytes[0] !== 0xFF && bytes[0] !== 0x52)
      expect(imageSize(bytes)).toBeUndefined()
    }))
  })
})

describe('image layout in cells', () => {
  const geometry = fc.record({
    cell: fc.record({ width: fc.integer({ min: 4, max: 30 }), height: fc.integer({ min: 8, max: 50 }) }),
    cols: fc.integer({ min: 10, max: 300 }),
    rows: fc.integer({ min: 4, max: 120 }),
    startCol: fc.integer({ min: 0, max: 9 }),
    devicePixelRatio: fc.constantFrom(1, 1.5, 2, 3),
  })
  const length = fc.option(fc.oneof(
    fc.record({ unit: fc.constant('cells' as const), value: fc.integer({ min: 1, max: 400 }) }),
    fc.record({ unit: fc.constant('px' as const), value: fc.integer({ min: 1, max: 4000 }) }),
    fc.record({ unit: fc.constant('percent' as const), value: fc.integer({ min: 1, max: 100 }) }),
  ), { nil: undefined })
  const natural = fc.option(fc.record({ width: fc.integer({ min: 1, max: 5000 }), height: fc.integer({ min: 1, max: 5000 }) }), { nil: undefined })

  test('the image fits right of the cursor and above the last row, with at least one cell', () => {
    fc.assert(fc.property(geometry, natural, length, length, fc.boolean(), (geo, size, width, height, preserve) => {
      const box = layoutCells({ natural: size, width, height, preserveAspectRatio: preserve }, geo)
      expect(box.cols).toBeGreaterThanOrEqual(1)
      expect(box.rows).toBeGreaterThanOrEqual(1)
      expect(box.cols).toBeLessThanOrEqual(Math.max(1, geo.cols - geo.startCol))
      expect(box.rows).toBeLessThanOrEqual(Math.max(1, geo.rows - 1))
    }))
  })

  test('a requested width in cells that fits is kept, and the height follows the aspect ratio', () => {
    fc.assert(fc.property(geometry, fc.record({ width: fc.integer({ min: 10, max: 2000 }), height: fc.integer({ min: 10, max: 2000 }) }), fc.integer({ min: 1, max: 60 }), (geo, size, cols) => {
      const maxRows = geo.rows - 1
      const rows = Math.ceil(cols * geo.cell.width * size.height / size.width / geo.cell.height - 1e-6)
      fc.pre(cols <= geo.cols - geo.startCol && rows <= maxRows)
      const box = layoutCells({ natural: size, width: { unit: 'cells', value: cols }, preserveAspectRatio: true }, geo)
      expect(box).toEqual({ cols, rows: Math.max(1, rows), fit: 'contain' })
    }))
  })

  test('the cursor moves to the image\'s last row, right past it', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 200 }), fc.integer({ min: 1, max: 200 }), (cols, rows) => {
      const bytes = cursorPast({ cols, rows, fit: 'contain' })
      expect(bytes.split('\n')).toHaveLength(rows)
      expect(bytes.endsWith(`\x1B[${cols}C`)).toBe(true)
    }))
  })

  test('iTerm2 lengths parse as cells, pixels or percent; anything else is auto', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10000 }), fc.constantFrom('', 'px', '%'), (value, unit) => {
      expect(parseLength(`${value}${unit}`)).toEqual({ unit: unit === 'px' ? 'px' : unit === '%' ? 'percent' : 'cells', value })
    }))
    for (const value of [undefined, 'auto', '', '0', '-3', '12em'])
      expect(parseLength(value)).toBeUndefined()
  })
})
