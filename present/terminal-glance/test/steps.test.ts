import type { StepInput } from '../runtime/steps'
import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { KEY_BYTES, stepChunks, TYPING, typingPlan } from '../runtime/steps'

/** What a step button may hold: named keys, typed text, a command line (possibly several lines). */
const text = fc.array(fc.oneof(fc.string({ unit: 'binary', minLength: 1, maxLength: 40 }), fc.constant('\n')), { maxLength: 30 })
  .map(parts => parts.join(''))
const step: fc.Arbitrary<StepInput> = fc.record({
  keys: fc.option(fc.array(fc.constantFrom(...Object.keys(KEY_BYTES)), { minLength: 1, maxLength: 3 }).map(keys => keys.join(' ')), { nil: undefined }),
  type: fc.option(text, { nil: undefined }),
  run: fc.option(text, { nil: undefined }),
})

function sentBytes(step: StepInput): string {
  return typingPlan(stepChunks(step)).map(write => write.text).join('')
}

describe('typing a step', () => {
  test('sends the keys, then the text with line breaks as Enter, then Enter for a command', () => {
    fc.assert(fc.property(step, (input) => {
      const keys = (input.keys?.split(' ') ?? []).map(key => KEY_BYTES[key]).join('')
      const asTyped = (value: string | undefined) => value?.replace(/\r?\n/g, '\r') ?? ''
      expect(sentBytes(input)).toBe(keys + asTyped(input.type) + (input.run === undefined ? '' : `${asTyped(input.run)}\r`))
    }))
  })

  test('finishes every step within the budget, in order', () => {
    fc.assert(fc.property(step, (input) => {
      const times = typingPlan(stepChunks(input)).map(write => write.at)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(times.at(-1) ?? 0).toBeLessThanOrEqual(TYPING.budgetMs)
    }))
  })

  test('types at most 6 ms per character, and faster for longer text', () => {
    fc.assert(fc.property(text.filter(value => value.length > 0), text.filter(value => value.length > 0), (shorter, extra) => {
      // Per keystroke typed: a CRLF line break is one Enter.
      const pace = (run: string) => {
        const times = typingPlan(stepChunks({ run })).map(write => write.at)
        return (times.at(-1) ?? 0) / [...run.replace(/\r?\n/g, '\r')].length
      }
      expect(pace(shorter)).toBeLessThanOrEqual(TYPING.charMs)
      expect(pace(shorter + extra)).toBeLessThanOrEqual(pace(shorter) + 1e-9)
    }))
  })

  test('sends typed text in a bounded number of writes, however long it is', () => {
    fc.assert(fc.property(step, (input) => {
      const chunks = stepChunks(input)
      const typedChunks = chunks.filter(chunk => chunk.typed).length
      const keyWrites = chunks.length - typedChunks
      expect(typingPlan(chunks).length).toBeLessThanOrEqual(keyWrites + TYPING.maxTextWrites + typedChunks)
    }))
  })
})
