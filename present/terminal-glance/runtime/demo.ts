import type { InjectionKey } from 'vue'

/** What a `<ShellDemo>` tells the steps inside it. */
export interface ShellDemoContext {
  /** Terminal names in display order; the first is the default target of a step. */
  terminals: readonly string[]
}

export const shellDemoKey: InjectionKey<ShellDemoContext> = Symbol('shell-demo')

/** Per-terminal accent, shared by a terminal's title bar and the badges of steps aimed at it. */
export const TERMINAL_ACCENTS = ['#8be9fd', '#ffb86c', '#50fa7b', '#ff79c6'] as const

export function terminalAccent(terminals: readonly string[], name: string): string {
  const index = Math.max(terminals.indexOf(name), 0)
  return TERMINAL_ACCENTS[index % TERMINAL_ACCENTS.length]
}
