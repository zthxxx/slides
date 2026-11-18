/**
 * A demo step: what a step button types into a terminal session.
 *
 * `keys` is sent first (as if pressed), then `type` is typed as is,
 * then `run` is typed and followed by Enter.
 */
export interface StepInput {
  keys?: string
  type?: string
  run?: string
}

/** Named keys a step may press; the bytes an xterm sends for them. */
export const KEY_BYTES: Readonly<Record<string, string>> = {
  '^C': '\x03',
  '^D': '\x04',
  '^L': '\x0C',
  '^S': '\x13',
  '^Z': '\x1A',
  '↑': '\x1B[A',
  '↓': '\x1B[B',
  '⏎': '\r',
}

export interface StepChunk {
  text: string
  /** Typed character by character, as a person would; otherwise sent at once. */
  typed: boolean
}

export function stepChunks(step: StepInput): StepChunk[] {
  const chunks: StepChunk[] = []
  for (const key of splitKeys(step.keys))
    chunks.push({ text: KEY_BYTES[key] ?? key, typed: false })
  // A line break in the text is the Enter key, so a multi-line command is typed line by line.
  if (step.type)
    chunks.push({ text: asKeystrokes(step.type), typed: true })
  if (step.run !== undefined) {
    chunks.push({ text: asKeystrokes(step.run), typed: true })
    chunks.push({ text: '\r', typed: false })
  }
  return chunks
}

function asKeystrokes(text: string): string {
  return text.replace(/\r?\n/g, '\r')
}

export const TYPING = {
  /** The pace of a short command. */
  charMs: 6,
  /** After a pressed key, so the program reacts before the next input. */
  keyPauseMs: 40,
  /** A whole step, however long its text: longer text is typed faster. Echoing it takes a few more milliseconds. */
  budgetMs: 600,
  /** Characters due within one frame go out in one write. */
  frameMs: 16,
  /**
   * Typed text goes out in at most about this many writes, however long it is: the shell redraws its line (with
   * syntax highlighting) once per read, so the number of writes, more than the bytes, decides when the echo is done.
   */
  maxTextWrites: 24,
} as const

/** One write of a step's playback, `at` milliseconds after it starts. */
export interface TimedWrite {
  at: number
  text: string
}

/** When each part of a step is written: typed text at an even pace, the whole step within TYPING.budgetMs. */
export function typingPlan(chunks: StepChunk[]): TimedWrite[] {
  const typedChars = chunks.reduce((count, chunk) => count + (chunk.typed ? [...chunk.text].length : 0), 0)
  const pauses = chunks.filter((chunk, index) => !chunk.typed && index < chunks.length - 1).length
  // Pauses take at most half the budget, typing the rest.
  const keyPauseMs = Math.min(TYPING.keyPauseMs, TYPING.budgetMs / 2 / Math.max(1, pauses))
  const charMs = Math.min(TYPING.charMs, (TYPING.budgetMs - pauses * keyPauseMs) / Math.max(1, typedChars))
  // Characters due within one write interval go out together.
  const writeMs = Math.max(TYPING.frameMs, typedChars * charMs / TYPING.maxTextWrites)

  const writes: TimedWrite[] = []
  let time = 0
  chunks.forEach((chunk, index) => {
    if (!chunk.typed) {
      writes.push({ at: Math.floor(time), text: chunk.text })
      if (index < chunks.length - 1)
        time += keyPauseMs
      return
    }
    let slot = -1
    for (const char of chunk.text) {
      const due = Math.floor(time / writeMs)
      if (due === slot)
        writes[writes.length - 1].text += char
      else
        writes.push({ at: Math.floor(time), text: char })
      slot = due
      time += charMs
    }
  })
  return writes
}

export function splitKeys(keys: string | undefined): string[] {
  return keys?.trim().split(/\s+/).filter(Boolean) ?? []
}

/** Matches `{a.pts}` / `{b.pid}`: a session's pty number or shell pid, known only once it runs. */
const SESSION_REF = /\{(\w+)\.(pts|pid)\}/g

export type SessionField = 'pts' | 'pid'

export function resolveSessionRefs(
  text: string,
  lookup: (session: string, field: SessionField) => number | undefined,
): string {
  return text.replace(SESSION_REF, (ref, session: string, field: SessionField) =>
    String(lookup(session, field) ?? ref))
}

export function referencedSessions(...texts: Array<string | undefined>): string[] {
  const names = new Set<string>()
  for (const text of texts) {
    for (const [, session] of text?.matchAll(SESSION_REF) ?? [])
      names.add(session)
  }
  return [...names]
}
