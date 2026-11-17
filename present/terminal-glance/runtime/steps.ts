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
  '^Z': '\x1A',
  '↑': '\x1B[A',
  '↓': '\x1B[B',
  '⏎': '\r',
}

export interface StepChunk {
  text: string
  /** Typed one character at a time, as a person would; otherwise sent at once. */
  typed: boolean
}

export function stepChunks(step: StepInput): StepChunk[] {
  const chunks: StepChunk[] = []
  for (const key of splitKeys(step.keys))
    chunks.push({ text: KEY_BYTES[key] ?? key, typed: false })
  if (step.type)
    chunks.push({ text: step.type, typed: true })
  if (step.run) {
    chunks.push({ text: step.run, typed: true })
    chunks.push({ text: '\r', typed: false })
  }
  return chunks
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
