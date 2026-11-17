import type { ProgramStatus } from '../runtime/program-status'
import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { ProgramStatusObserver } from '../runtime/program-status'

const ST = '\x1B\\'
const REPLY = `\x1B]7501;?${ST}`
const terminator = fc.constantFrom('\x07', ST)
const state = fc.constantFrom<ProgramStatus['state']>('idle', 'working', 'done', 'blocked', 'error')
const app = fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_.+-'), { minLength: 1, maxLength: 32 }).map(chars => chars.join(''))
const report = fc.record({ state, app, progress: fc.integer({ min: 0, max: 100 }), end: terminator })
const chunks = fc.array(fc.integer({ min: 1, max: 30 }), { maxLength: 100 })

function observe(data: string, sizes: number[] = [], binary = false) {
  const events: (ProgramStatus | undefined | string)[] = []
  const observer = new ProgramStatusObserver({
    reply: reply => events.push(reply),
    onStatus: status => events.push(status),
  })
  const bytes = new TextEncoder().encode(data)
  let offset = 0
  for (const size of sizes) {
    const next = Math.min(offset + size, bytes.length)
    const part = bytes.slice(offset, next)
    observer.scan(binary ? part : new TextDecoder().decode(part))
    offset = next
  }
  observer.scan(binary ? bytes.slice(offset) : new TextDecoder().decode(bytes.slice(offset)))
  return events
}

describe('OSC 7501 program status', () => {
  test('reports and replies stay ordered across arbitrary transport chunk boundaries', () => {
    fc.assert(fc.property(fc.array(report, { minLength: 1, maxLength: 20 }), chunks, fc.boolean(), (reports, sizes, binary) => {
      const expected: (ProgramStatus | string | undefined)[] = []
      const stream = reports.map((entry) => {
        expected.push(REPLY, {
          state: entry.state,
          app: entry.app,
          ...(['working', 'blocked'].includes(entry.state) ? { progress: entry.progress } : {}),
        })
        return `plain text\x1B]7501;?${entry.end}\x1B]7501;state=${entry.state}:app=${entry.app}:progress=${entry.progress}${entry.end}`
      }).join('') + `\x1B]7501;state=clear${ST}`
      expected.push(undefined)
      expect(observe(stream, sizes, binary)).toEqual(expected)
    }))
  })

  test('a probe only replies; unrelated, malformed and child reports never take over the root record', () => {
    fc.assert(fc.property(app, terminator, chunks, (name, end, sizes) => {
      const invalid = [
        `\x1B]7501;app=${name}${end}`,
        `\x1B]7501;state=unknown:app=${name}${end}`,
        `\x1B]7501;state=working:id=child${end}`,
        `\x1B]7501;state=clear:id=child${end}`,
        `\x1B]9;4;1;40${end}`,
        `\x1B]0;state=done${end}`,
        `\x1B]7501;state=working\x1B[31m${end}`,
      ].join('')
      expect(observe(`\x1B]7501;?${end}${invalid}`, sizes, true)).toEqual([REPLY])
    }))
  })

  test('an explicit id never overwrites or clears the root, even when its value is malformed', () => {
    const id = fc.oneof(
      app,
      fc.constantFrom('', 'bad id', 'invalid;id', '坏标识', '/child', 'child/', 'a//b'),
      fc.array(fc.integer({ min: 0x20, max: 0x7E }), { maxLength: 160 }).map(bytes => String.fromCharCode(...bytes)),
    )
    fc.assert(fc.property(id, terminator, chunks, fc.boolean(), (value, end, sizes, binary) => {
      const addressed = (state: string) => [
        `state=${state}:id=${value}`,
        `id=${value}:state=${state}`,
        `state=${state}: id = ${value} `,
        `state=${state}:id=${value}:id=`,
      ].map(payload => `\x1B]7501;${payload}${end}`).join('')
      const stream = `\x1B]7501;state=working:app=root${end}`
        + addressed('done') + addressed('clear')
        + `\x1B]7501;state=done:app=root${end}`
      expect(observe(stream, sizes, binary)).toEqual([
        { state: 'working', app: 'root' }, { state: 'done', app: 'root' },
      ])
    }), { examples: [['bad id', ST, [1, 2, 3], true], ['', '\x07', [1], false]] })
  })

  test('an oversized or unfinished frame cannot swallow the next valid report', () => {
    fc.assert(fc.property(fc.integer({ min: 4096, max: 12_000 }), chunks, terminator, (length, sizes, end) => {
      const huge = `\x1B]7501;state=working:app=${'x'.repeat(length)}`
      const valid = `\x1B]7501;state=done:app=demo${end}`
      expect(observe(huge + end + valid, sizes, true)).toEqual([{ state: 'done', app: 'demo' }])
      expect(observe(huge + valid, sizes, true)).toEqual([{ state: 'done', app: 'demo' }])
    }))
  })

  test('tmux passthrough envelopes preserve reporting and probe replies across arbitrary chunks', () => {
    fc.assert(fc.property(report, chunks, (entry, sizes) => {
      const inner = `\x1B]7501;state=${entry.state}:app=${entry.app}${entry.end}`
      const wrap = (sequence: string) => `\x1BPtmux;${sequence.replaceAll('\x1B', '\x1B\x1B')}${ST}`
      expect(observe(wrap(`\x1B]7501;?${entry.end}`) + wrap(inner), sizes, true)).toEqual([
        REPLY, { state: entry.state, app: entry.app },
      ])
    }))
  })

  test('each report replaces optional fields and a full terminal reset clears the record', () => {
    fc.assert(fc.property(app, fc.integer({ min: 0, max: 100 }), (name, progress) => {
      expect(observe(`\x1B]7501;state=working:app=${name}:progress=${progress}${ST}\x1B]7501;state=done${ST}\x1Bc`)).toEqual([
        { state: 'working', app: name, progress }, { state: 'done' }, undefined,
      ])
    }))
  })
})
