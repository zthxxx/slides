import type { Ref } from 'vue'
import { readonly, ref } from 'vue'

export type TerminalAppearance = 'dark' | 'light'

const STORAGE_KEY = 'terminal-glance:appearance'

function readAppearance(): TerminalAppearance {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  }
  catch {
    return 'dark'
  }
}

const appearance: Ref<TerminalAppearance> = import.meta.hot?.data.terminalAppearance ?? ref<TerminalAppearance>(readAppearance())
if (import.meta.hot)
  import.meta.hot.data.terminalAppearance = appearance

export const terminalAppearance = readonly(appearance)

export function toggleTerminalAppearance(): void {
  appearance.value = appearance.value === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(STORAGE_KEY, appearance.value)
  }
  catch {}
}

function syncAppearance(event: StorageEvent): void {
  try {
    if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null))
      appearance.value = event.newValue === 'light' ? 'light' : 'dark'
  }
  catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', syncAppearance)
  import.meta.hot?.dispose(() => window.removeEventListener('storage', syncAppearance))
}

export const TERMINAL_THEMES = {
  dark: {
    background: '#272936', foreground: '#f8f8f2', cursor: '#f8f8f2',
    selectionBackground: '#44475a', selectionForeground: '#ffffff',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
    brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
  light: {
    background: '#f6f5f1', foreground: '#292d3e', cursor: '#292d3e',
    selectionBackground: '#cbd5e7', selectionForeground: '#171a29',
    black: '#292d3e', red: '#b82836', green: '#247247', yellow: '#8a6100',
    blue: '#3b53a3', magenta: '#93419a', cyan: '#176e80', white: '#e3e5ec',
    brightBlack: '#687187', brightRed: '#d03b47', brightGreen: '#32814c', brightYellow: '#987000',
    brightBlue: '#4c63bb', brightMagenta: '#a24daa', brightCyan: '#207e91', brightWhite: '#ffffff',
  },
} as const
