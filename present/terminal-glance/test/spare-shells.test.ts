import type { SparePty, TerminalSize } from '../runtime/spare-shells'
import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { SHELL_SETTLED_MARK, SpareShells } from '../runtime/spare-shells'

/**
 * The VM boundary: a shell on a pty that prints what the test tells it to, records what is typed into it (the
 * spare's answers to its queries) and the sizes it is given, and ends when closed.
 */
class FakeShell implements SparePty {
  readonly output: ReadableStream<Uint8Array>
  readonly ended: Promise<void>
  readonly typed: string[] = []
  readonly sizes: TerminalSize[]
  closed = false
  settledPrinted = false
  #controller!: ReadableStreamDefaultController<Uint8Array>
  #end!: () => void

  constructor(size: TerminalSize, readonly onResize: (shell: FakeShell) => void = () => {}) {
    this.sizes = [size]
    this.output = new ReadableStream({ start: controller => void (this.#controller = controller) })
    this.ended = new Promise(resolve => this.#end = resolve)
  }

  print(bytes: Uint8Array): void {
    if (!this.closed)
      this.#controller.enqueue(bytes)
  }

  async write(data: string): Promise<void> {
    this.typed.push(data)
  }

  resize(cols: number, rows: number): void {
    this.sizes.push({ cols, rows })
    this.onResize(this)
  }

  async close(): Promise<void> {
    this.exit()
  }

  exit(): void {
    if (this.closed)
      return
    this.closed = true
    this.#controller.close()
    this.#end()
  }
}

const COLORS = { foreground: '#f8f8f2', background: '#272936' }
const SPARE_SIZE = { cols: 80, rows: 8 }
const TERMINAL_SIZE = { cols: 92, rows: 32 }
const DA1_ANSWER = '\x1B[?62;22c'
const OSC11_ANSWER = '\x1B]11;rgb:2727/2929/3636\x07'

function options(spawn: (size: TerminalSize) => Promise<FakeShell>, capacity = 1) {
  return {
    spawn,
    colors: () => COLORS,
    whenIdle: () => Promise.resolve(),
    settledMark: SHELL_SETTLED_MARK,
    settleTimeoutMs: 60_000,
    redrawWaitMs: 2,
    capacity,
    size: SPARE_SIZE,
  }
}

/** Lets the streams pass on what has been printed. */
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const encode = (text: string) => new TextEncoder().encode(text)

/** What a shell prints at start: text, SGR and OSC sequences, jovial's two queries and the settled mark. */
interface Token {
  text: string
  /** The answer a terminal owes this token, when it is a query. */
  answer?: string
}

const token: fc.Arbitrary<Token> = fc.oneof(
  fc.string({ unit: fc.constantFrom(...'abc ~─╭╰➤[]:0123456789'), minLength: 1, maxLength: 12 }).map(text => ({ text })),
  fc.constantFrom('\x1B[0m', '\x1B[38;5;252m', '\x1B[?2004h', '\r\n', '\x1B[K', '\x1B]0;root@unkernel\x07').map(text => ({ text })),
  fc.constant({ text: '\x1B]11;?\x1B\\', answer: '\x1B]11;rgb:2727/2929/3636\x1B\\' }),
  fc.constant({ text: '\x1B]11;?\x07', answer: OSC11_ANSWER }),
  fc.constant({ text: '\x1B[c', answer: DA1_ANSWER }),
  fc.constant({ text: SHELL_SETTLED_MARK }),
)

/** Cut `bytes` into chunks at the given fractions of its length, as the pty may deliver it. */
function chunked(bytes: Uint8Array, cuts: number[]): Uint8Array[] {
  const points = [...new Set(cuts.map(cut => Math.floor(cut * bytes.length)))].filter(point => point > 0 && point < bytes.length).sort((a, b) => a - b)
  return [0, ...points].map((start, index) => bytes.slice(start, points[index] ?? bytes.length))
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  for await (const part of stream)
    parts.push(part)
  return Uint8Array.from(parts.flatMap(part => [...part]))
}

describe('a terminal taking a spare shell', () => {
  const plan = fc.record({
    tokens: fc.array(token, { minLength: 1, maxLength: 24 }),
    /** Where in the shell's output the terminal takes the spare, as a fraction of its bytes. */
    handOverAt: fc.double({ min: 0, max: 1, noNaN: true }),
    beforeCuts: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 6 }),
    afterCuts: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 6 }),
    redraw: fc.constantFrom('', '\r\x1B[A\x1B[J╭─[unkernel] 06:05:51\r\n╰──➤ '),
  })

  test('shows all the shell printed, in order, and every query is answered once: by the spare or by the terminal', async () => {
    await fc.assert(fc.asyncProperty(plan, async ({ tokens, handOverAt, beforeCuts, afterCuts, redraw }) => {
      const output = encode(tokens.map(t => t.text).join(''))
      const cut = Math.floor(handOverAt * output.length)
      // A shell redraws its prompt on SIGWINCH only between writes, never in the middle of a sequence.
      const offsets = tokens.reduce<number[]>((ends, t) => [...ends, (ends.at(-1) ?? 0) + encode(t.text).length], [])
      const redrawn = redraw && (cut === 0 || offsets.includes(cut)) ? encode(redraw) : new Uint8Array()

      const shells: FakeShell[] = []
      const spares = new SpareShells(options(async (size) => {
        shells.push(new FakeShell(size, s => s.print(redrawn)))
        return shells.at(-1)!
      }))
      spares.fill()
      await tick()
      const shell = shells[0]!
      for (const part of chunked(output.subarray(0, cut), beforeCuts)) {
        shell.print(part)
        await tick()
      }
      const handedOver = await spares.take(TERMINAL_SIZE)!
      for (const part of chunked(output.subarray(cut), afterCuts))
        shell.print(part)
      shell.exit()
      const shown = await readAll(handedOver.output)

      // The shell's output as printed, the redraw included where it came; the queries in the part printed before the
      // hand-over are the spare's to answer, and the terminal never sees them.
      const printed: Token[] = !redrawn.length
        ? tokens
        : [...tokens.slice(0, offsets.indexOf(cut) + 1), { text: redraw }, ...tokens.slice(offsets.indexOf(cut) + 1)]
      const held = cut + redrawn.length
      const answeredBySpare: string[] = []
      const terminalSees: string[] = []
      let end = 0
      for (const t of printed) {
        end += encode(t.text).length
        if (t.answer && end <= held)
          answeredBySpare.push(t.answer)
        else
          terminalSees.push(t.text)
      }

      expect(handedOver.pty).toBe(shell)
      expect(shell.typed).toEqual(answeredBySpare)
      expect(shown).toEqual(encode(terminalSees.join('')))
      expect(shell.sizes).toEqual([SPARE_SIZE, TERMINAL_SIZE])
    }), { numRuns: 300 })
  })
})

describe('keeping spares', () => {
  const step = fc.constantFrom('take', 'settle', 'retire', 'crash')

  test('keeps at most `capacity` spares, starts one only after the one before settled, and never hands out a closed one', async () => {
    await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 3 }), fc.array(step, { maxLength: 24 }), async (capacity, steps) => {
      const shells: FakeShell[] = []
      const spares = new SpareShells(options(async (size) => {
        const shell = new FakeShell(size, s => s.print(encode('\r\x1B[A\x1B[J prompt ')))
        shells.push(shell)
        return shell
      }, capacity))
      const taken = new Set<FakeShell>()
      let crashedAt: number | undefined
      spares.fill()
      await tick()

      for (const what of steps) {
        const waiting = shells.filter(shell => !taken.has(shell) && !shell.closed)
        switch (what) {
          case 'take': {
            const handedOver = await spares.take(TERMINAL_SIZE)
            if (handedOver) {
              expect(handedOver.pty.closed).toBe(false)
              expect(taken.has(handedOver.pty)).toBe(false)
              // The oldest first: the one furthest along.
              expect(handedOver.pty).toBe(waiting[0]!)
              taken.add(handedOver.pty)
              // As its terminal does.
              void readAll(handedOver.output)
            }
            else {
              expect(waiting).toEqual([])
            }
            break
          }
          case 'settle': {
            const starting = shells.find(shell => !shell.settledPrinted && !shell.closed)
            if (starting) {
              starting.settledPrinted = true
              starting.print(encode(`\r\n${SHELL_SETTLED_MARK}`))
            }
            break
          }
          case 'retire': {
            spares.retire()
            await tick()
            for (const shell of waiting)
              expect(shell.closed).toBe(true)
            break
          }
          case 'crash': {
            const starting = shells.find(shell => !shell.settledPrinted && !shell.closed && !taken.has(shell))
            if (starting) {
              starting.exit()
              crashedAt ??= shells.length
            }
            break
          }
        }
        await tick()

        const kept = shells.filter(shell => !taken.has(shell) && !shell.closed)
        expect(spares.count).toBe(kept.length)
        expect(kept.length).toBeLessThanOrEqual(capacity)
        // One shell starting at a time, a terminal's included: they would share the VM's CPU.
        expect(shells.filter(shell => !shell.settledPrinted && !shell.closed).length).toBeLessThanOrEqual(1)
        if (crashedAt !== undefined)
          expect(shells.length).toBe(crashedAt)
      }
      for (const shell of shells)
        expect(shell.sizes[0]).toEqual(SPARE_SIZE)
    }), { numRuns: 200 })
  })
})
