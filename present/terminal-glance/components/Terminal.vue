<script setup lang="ts">
import { useIsSlideActive, useNav, useSlideContext } from '@slidev/client'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { terminalAppearance, TERMINAL_THEMES, toggleTerminalAppearance } from '../runtime/appearance'
import { namesTerminals, shellDemoKey, terminalAccent } from '../runtime/demo'
import { useLinux } from '../runtime/kernel'
import { serveRelayedSteps } from '../runtime/relay'
import { playStep, sessionKey, useShellSession } from '../runtime/session'
import { clampHeight, terminalHeights } from '../runtime/terminal-height'

const props = withDefaults(defineProps<{
  /** The terminal's name on this slide; steps address it by this name. */
  name?: string
}>(), {
  name: 'a',
})

const { $page, $renderContext } = useSlideContext()
const { isPrintMode } = useNav()
const isActive = useIsSlideActive()
const demo = inject(shellDemoKey, undefined)

// Only the audience window runs Linux; the presenter, overview and export render a stand-in.
const live = $renderContext.value === 'slide' && !isPrintMode.value
const key = sessionKey($page.value, props.name)
const session = live ? useShellSession(key) : undefined
const frame = useTemplateRef<HTMLElement>('frame')
const screen = useTemplateRef<HTMLDivElement>('screen')

if (live) {
  // Boot while the slide is still hidden, so the shell is ready when the talk reaches it.
  void useLinux().catch(() => {})
  serveRelayedSteps(({ page, to, step }) => void playStep(page, to, step).catch(() => {}))
}

watch([isActive, screen], ([active, element]) => {
  if (session && active && element)
    void session.show(element)
  if (session && !active)
    session.terminal.blur()
}, { immediate: true, flush: 'post' })

watch(screen, (element, _, onCleanup) => {
  if (!session || !element)
    return
  const observer = new ResizeObserver(() => isActive.value && session.fit())
  observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { immediate: true })

const accent = computed(() => terminalAccent(demo?.terminals ?? [props.name], props.name))
const titleAccent = computed(() => terminalAppearance.value === 'light' ? `color-mix(in srgb, ${accent.value}, black 45%)` : accent.value)
const theme = computed(() => TERMINAL_THEMES[terminalAppearance.value])
const programStatus = computed(() => session?.programStatus.value)
const appearanceLabel = computed(() => `Switch all terminals to ${terminalAppearance.value === 'dark' ? 'light' : 'dark'} mode`)

function toggleAppearance(event: MouseEvent) {
  toggleTerminalAppearance()
  ;(event.currentTarget as HTMLButtonElement).blur()
}

const title = computed(() => {
  const pts = session?.pts.value
  const parts = [namesTerminals(demo) && props.name.toUpperCase(), pts !== undefined && `/dev/pts/${pts}`]
  return parts.filter(Boolean).join(' · ')
})

/** Rows the drag handle keeps at least; one row is the font size in slide pixels until the emulator has measured it. */
const MIN_ROWS = 10
const FALLBACK_ROW_HEIGHT = 18

/** The height while a drag is in progress; stored when the drag ends. */
const draggedHeight = ref<number>()
const height = computed(() => draggedHeight.value ?? terminalHeights.get(key))
const frameStyle = computed(() => ({
  '--terminal-background': theme.value.background,
  '--terminal-foreground': theme.value.foreground,
  ...(height.value === undefined ? {} : { height: `${height.value}px`, flex: '0 1 auto' }),
}))

/** Sizes in slide pixels (layout sizes, before Slidev's scale): about ten rows, up to the room the slide has left. */
function heightBounds(box: HTMLElement): { min: number, max: number } {
  const scale = box.getBoundingClientRect().height / box.offsetHeight || 1
  const cellHeight = session?.terminal.cellHeight
  const rowHeight = cellHeight ? cellHeight / scale : FALLBACK_ROW_HEIGHT
  const screenElement = screen.value
  const screenStyle = screenElement && getComputedStyle(screenElement)
  const rowsHeight = screenElement && screenStyle
    ? screenElement.clientHeight - Number.parseFloat(screenStyle.paddingTop) - Number.parseFloat(screenStyle.paddingBottom)
    : 0
  // Title bar, paddings and the part of the screen below the last whole row.
  const chrome = box.offsetHeight - rowsHeight
  const min = Math.ceil(chrome + MIN_ROWS * rowHeight + 1)

  const column = box.parentElement
  if (!column)
    return { min, max: box.offsetHeight }
  const columnStyle = getComputedStyle(column)
  const siblings = [...column.children].filter(child => child !== box) as HTMLElement[]
  // A sibling terminal still in the layout's flexible height may shrink to its own minimum.
  const taken = siblings.reduce((sum, sibling) => sum + (sibling.matches('.terminal-window') && !sibling.style.height ? min : sibling.offsetHeight), 0)
  const max = column.clientHeight
    - Number.parseFloat(columnStyle.paddingTop) - Number.parseFloat(columnStyle.paddingBottom)
    - (Number.parseFloat(columnStyle.rowGap) || 0) * siblings.length
    - taken
  return { min, max: Math.floor(max) }
}

function startResize(event: PointerEvent) {
  const box = frame.value
  if (!box || event.button !== 0)
    return
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  const scale = box.getBoundingClientRect().height / box.offsetHeight || 1
  const startY = event.clientY
  const startHeight = box.offsetHeight
  const bounds = heightBounds(box)

  // The terminal refits through its ResizeObserver, which also resizes the pty (SIGWINCH).
  const move = (moveEvent: PointerEvent) => {
    draggedHeight.value = Math.round(clampHeight(startHeight + (moveEvent.clientY - startY) / scale, bounds))
  }
  const end = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    if (draggedHeight.value !== undefined && draggedHeight.value !== startHeight)
      terminalHeights.set(key, draggedHeight.value)
    draggedHeight.value = undefined
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
}

/** Double-click: back to the slide's own layout. */
function resetHeight() {
  terminalHeights.set(key, undefined)
}

const status = computed(() => {
  switch (session?.status.value) {
    case 'starting': return 'booting Linux…'
    case 'failed': return 'unavailable'
    default: return ''
  }
})
</script>

<template>
  <figure
    ref="frame"
    class="terminal-window"
    :data-terminal-appearance="terminalAppearance"
    :style="frameStyle"
  >
    <header class="terminal-bar">
      <span class="terminal-dots"><i /><i /><i /></span>
      <span class="terminal-title" :style="{ color: titleAccent }">{{ title }}</span>
      <span class="terminal-status">{{ status }}</span>
      <span
        v-if="programStatus"
        class="terminal-program-status"
        :data-program-state="programStatus.state"
        title="Latest OSC 7501 report; this does not check whether the process is alive"
        aria-live="polite"
      >{{ programStatus.app ? `${programStatus.app} · ` : '' }}{{ programStatus.state }}{{ programStatus.progress !== undefined ? ` ${programStatus.progress}%` : '' }}</span>
      <button class="terminal-appearance" type="button" :aria-label="appearanceLabel" :title="appearanceLabel" @click="toggleAppearance">
        <svg v-if="terminalAppearance === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" /></svg>
      </button>
    </header>
    <div v-if="live" ref="screen" class="terminal-screen" />
    <div v-else class="terminal-screen terminal-stand-in">
      Linux runs in the slide window; steps clicked here are typed there
    </div>
    <div
      v-if="live"
      class="terminal-resize"
      title="Drag to resize · double-click to reset"
      @pointerdown="startResize"
      @dblclick="resetHeight"
    />
  </figure>
</template>

<style scoped>
.terminal-window {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  margin: 0;
  overflow: hidden;
  border-radius: 0.6rem;
  background: var(--terminal-background);
  color: var(--terminal-foreground);
  box-shadow: 0 0.6rem 1.6rem rgb(0 0 0 / 0.25);
}

.terminal-bar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.45rem 0.9rem;
  background: #1e1f29;
  font-family: "Hack Nerd Font Mono", Menlo, monospace;
  font-size: 15px;
  line-height: 1.4;
}

.terminal-dots {
  display: flex;
  gap: 0.4rem;

  i {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background: #ff5f57;

    &:nth-child(2) { background: #febc2e }
    &:nth-child(3) { background: #28c840 }
  }
}

.terminal-title {
  font-weight: 700;
}

.terminal-status {
  margin-left: auto;
  color: #6272a4;
}

.terminal-appearance {
  display: grid;
  place-items: center;
  padding: 0.2rem;
  border: 0;
  border-radius: 0.25rem;
  color: #c9cbd8;
  background: transparent;
  cursor: pointer;

  &:hover { background: rgb(255 255 255 / 0.12) }
  &:focus-visible { outline: 2px solid currentColor }

  svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.terminal-program-status {
  max-width: 46%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: 0.1rem 0.45rem;
  border: 1px solid #687187;
  border-radius: 0.3rem;
  color: #c9cbd8;
  font-size: 0.85em;

  &[data-program-state="working"] { color: #bd93f9; border-color: #bd93f9 }
  &[data-program-state="done"] { color: #50fa7b; border-color: #50fa7b }
  &[data-program-state="blocked"] { color: #f1fa8c; border-color: #f1fa8c }
  &[data-program-state="error"] { color: #ff5555; border-color: #ff5555 }
}

[data-terminal-appearance="light"] {
  .terminal-bar { background: #e5e5e9 }
  .terminal-appearance { color: #505971 }
  .terminal-appearance:hover { background: rgb(0 0 0 / 0.08) }
  .terminal-program-status { color: #505971 }
  [data-program-state="working"] { color: #6740a1; border-color: #6740a1 }
  [data-program-state="done"] { color: #247247; border-color: #247247 }
  [data-program-state="blocked"] { color: #8a6100; border-color: #8a6100 }
  [data-program-state="error"] { color: #b82836; border-color: #b82836 }
}

.terminal-screen {
  flex: 1;
  min-height: 0;
  padding: 0.5rem 0.4rem 8px 0.8rem;
  /* The emulator's host is enlarged by the slide scale and scaled back down (runtime/emulator.ts). */
  overflow: hidden;
}

/* Over the screen's bottom padding, so it covers no row of text. */
.terminal-resize {
  position: absolute;
  inset: auto 0 0;
  height: 8px;
  cursor: ns-resize;
  touch-action: none;

  &::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: 2px;
    width: 48px;
    height: 3px;
    border-radius: 2px;
    background: currentColor;
    opacity: 0;
    transform: translateX(-50%);
    transition: opacity 0.15s;
  }

  &:hover::after,
  &:active::after { opacity: 0.45 }
}

.terminal-stand-in {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6272a4;
  font-family: "Hack Nerd Font Mono", Menlo, monospace;
  font-size: 18px;
}
</style>

<style>
/* The terminal font, served from public/fonts/hack-nerd-font-mono/ (see its README.md). */
@font-face {
  font-family: "Hack Nerd Font Mono";
  src: url("/fonts/hack-nerd-font-mono/HackNerdFontMono-Regular.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: "Hack Nerd Font Mono";
  src: url("/fonts/hack-nerd-font-mono/HackNerdFontMono-Bold.woff2") format("woff2");
  font-weight: bold;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: "Hack Nerd Font Mono";
  src: url("/fonts/hack-nerd-font-mono/HackNerdFontMono-Italic.woff2") format("woff2");
  font-weight: normal;
  font-style: italic;
  font-display: block;
}

@font-face {
  font-family: "Hack Nerd Font Mono";
  src: url("/fonts/hack-nerd-font-mono/HackNerdFontMono-BoldItalic.woff2") format("woff2");
  font-weight: bold;
  font-style: italic;
  font-display: block;
}

/* The element ghostty-web renders into: it makes it the focusable, contenteditable input of the terminal. */
.shell-session {
  width: 100%;
  height: 100%;
  outline: none;
  caret-color: transparent;
}
</style>
