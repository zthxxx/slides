<script setup lang="ts">
import { useIsSlideActive, useNav, useSlideContext } from '@slidev/client'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { terminalAppearance, TERMINAL_THEMES, toggleTerminalAppearance } from '../runtime/appearance'
import { armBellSound } from '../runtime/bell'
import { namesTerminals, shellDemoKey, terminalAccent } from '../runtime/demo'
import { useLinux } from '../runtime/kernel'
import { serveRelayedSteps } from '../runtime/relay'
import { playStep, sessionKey, useShellSession } from '../runtime/session'
import { clampHeight, terminalHeights } from '../runtime/terminal-height'

const props = withDefaults(defineProps<{
  /** The terminal's name on this slide; steps address it by this name. */
  name?: string
  /** Share of the demo's height when stacked with other terminals (flex-grow); a dragged height takes precedence. */
  grow?: number
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
  armBellSound()
  serveRelayedSteps(({ page, to, step }) => void playStep(page, to, step).catch(() => {}))
}

/**
 * Maximized: the window fills the slide, 20 px from its edges, over everything else on it; the screen refits, so the
 * shell gets the new size (SIGWINCH). `position: fixed` resolves against Slidev's scaled slide container, which is
 * transformed, so the window stays inside the slide and keeps its scale. A placeholder holds the window's place, so
 * other terminals on the slide keep their size. Esc stays with the shell (vim needs it); the button or a click on the
 * backdrop restores the window.
 */
const maximized = ref(false)
const placeholderHeight = ref(0)

function toggleMaximized(event: MouseEvent) {
  ;(event.currentTarget as HTMLButtonElement).blur()
  if (!maximized.value)
    placeholderHeight.value = frame.value?.offsetHeight ?? 0
  maximized.value = !maximized.value
  if (maximized.value)
    session?.terminal.focus()
}

watch(isActive, (active) => {
  if (!active)
    maximized.value = false
})

watch([isActive, screen], ([active, element]) => {
  if (session && active && element)
    void session.show(element).then(updateMinHeight)
  if (session && !active)
    session.terminal.blur()
}, { immediate: true, flush: 'post' })

watch(screen, (element, _, onCleanup) => {
  if (!session || !element)
    return
  const observer = new ResizeObserver(() => {
    if (!isActive.value)
      return
    session.fit()
    updateMinHeight()
  })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { immediate: true })

const accent = computed(() => terminalAccent(demo?.terminals ?? [props.name], props.name))
const titleAccent = computed(() => terminalAppearance.value === 'light' ? `color-mix(in srgb, ${accent.value}, black 45%)` : accent.value)
const theme = computed(() => TERMINAL_THEMES[terminalAppearance.value])
const programStatus = computed(() => session?.programStatus.value)
const programStatusText = computed(() => {
  const status = programStatus.value
  if (!status)
    return ''
  const progress = status.progress !== undefined ? ` ${status.progress}%` : ''
  return `${status.app ? `${status.app} · ` : ''}${status.state}${progress}`
})

/** The bell icon shows for a while after each bell, as in iTerm2 and Ghostty; a new bell starts it over. */
const BELL_SHOWN_MS = 2600
const bells = computed(() => session?.bells.value ?? 0)
const bellShown = ref(false)
watch(bells, (count, _, onCleanup) => {
  if (!count)
    return
  bellShown.value = true
  const timer = setTimeout(() => bellShown.value = false, BELL_SHOWN_MS)
  onCleanup(() => clearTimeout(timer))
})
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
/** About ten rows, in slide pixels, once the emulator has measured its rows: a layout share never squeezes it below. */
const minHeight = ref<number>()
const frameStyle = computed(() => maximized.value
  ? {
      '--terminal-background': theme.value.background,
      '--terminal-foreground': theme.value.foreground,
    }
  : {
      '--terminal-background': theme.value.background,
      '--terminal-foreground': theme.value.foreground,
      ...layoutStyle.value,
    })
const layoutStyle = computed(() => ({
  ...(minHeight.value === undefined ? {} : { minHeight: `${minHeight.value}px` }),
  ...(height.value !== undefined
    ? { height: `${height.value}px`, flex: '0 1 auto' }
    : props.grow !== undefined ? { flex: `${props.grow} 1 0` } : {}),
}))

function updateMinHeight() {
  const box = frame.value
  if (box?.offsetHeight && session?.terminal.cellHeight)
    minHeight.value = heightBounds(box).min
}

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
  <div v-if="maximized" class="terminal-placeholder" :style="{ ...layoutStyle, height: `${placeholderHeight}px`, flex: '0 0 auto' }" />
  <div v-if="maximized" class="terminal-backdrop" @click="maximized = false" />
  <figure
    ref="frame"
    class="terminal-window"
    :class="{ maximized }"
    :data-terminal-appearance="terminalAppearance"
    :style="frameStyle"
  >
    <header class="terminal-bar">
      <span class="terminal-dots"><i /><i /><i /></span>
      <span class="terminal-title" :style="{ color: titleAccent }">{{ title }}</span>
      <span v-if="bellShown" :key="bells" class="terminal-bell" role="img" aria-label="Bell" title="Bell (BEL, 0x07)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
        </svg>
      </span>
      <span class="terminal-status">{{ status }}</span>
      <!-- Keyed by its text, so every change mounts it anew and replays the pop animation. -->
      <span
        v-if="programStatus"
        :key="programStatusText"
        class="terminal-program-status"
        :data-program-state="programStatus.state"
        title="Latest OSC 7501 report; this does not check whether the process is alive"
        aria-live="polite"
      >{{ programStatusText }}</span>
      <button
        v-if="live"
        class="terminal-appearance terminal-maximize"
        type="button"
        :aria-label="maximized ? 'Restore the terminal' : 'Maximize the terminal over the slide'"
        :title="maximized ? 'Restore' : 'Maximize'"
        @click="toggleMaximized"
      >
        <svg v-if="maximized" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
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
      v-if="live && !maximized"
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
  /* Visible, so the status stamp may stick out over the window's edge; the bar and the screen round their own corners. */
  overflow: visible;
  border-radius: 0.6rem;
  background: var(--terminal-background);
  color: var(--terminal-foreground);
  box-shadow: 0 0.6rem 1.6rem rgb(0 0 0 / 0.25);
}

.terminal-window.maximized {
  position: fixed;
  inset: 20px;
  z-index: 41;
  height: auto;
  min-height: 0;
  box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.45);
}

.terminal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgb(18 18 18 / 0.55);
  backdrop-filter: blur(4px);
  cursor: zoom-out;
}

.terminal-bar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.45rem 0.9rem;
  border-radius: 0.6rem 0.6rem 0 0;
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

/* A stamp laid over the title bar's right side, overlapping the screen a little, so the state reads from afar. */
.terminal-program-status {
  position: absolute;
  top: 0.5rem;
  right: 5.4rem;
  z-index: 3;
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: 0.25rem 0.9rem;
  border: 2px solid currentColor;
  border-radius: 0.55rem;
  color: #c9cbd8;
  background: color-mix(in srgb, currentColor 20%, rgb(30 31 41 / 0.72));
  backdrop-filter: blur(3px);
  box-shadow: 0 0.4rem 1.2rem rgb(0 0 0 / 0.35);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.02em;
  rotate: -10deg;
  animation: program-status-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);

  &[data-program-state="working"] { color: #bd93f9 }
  &[data-program-state="done"] { color: #50fa7b }
  &[data-program-state="blocked"] { color: #f1fa8c }
  &[data-program-state="error"] { color: #ff5555 }
}

@keyframes program-status-pop {
  0% { scale: 0.4; opacity: 0 }
  55% { scale: 1.18; opacity: 1 }
  78% { scale: 0.95 }
  100% { scale: 1 }
}

.terminal-bell {
  display: grid;
  place-items: center;
  color: #f1fa8c;
  transform-origin: 50% 10%;
  animation: terminal-bell-ring 0.7s ease-in-out, terminal-bell-fade 2.6s ease-in forwards;

  svg {
    width: 1.2rem;
    height: 1.2rem;
    fill: currentColor;
  }
}

@keyframes terminal-bell-ring {
  0%, 100% { rotate: 0deg }
  20% { rotate: 20deg }
  40% { rotate: -16deg }
  60% { rotate: 10deg }
  80% { rotate: -5deg }
}

@keyframes terminal-bell-fade {
  0%, 65% { opacity: 1 }
  100% { opacity: 0 }
}

@media (prefers-reduced-motion: reduce) {
  .terminal-program-status { animation: none }
  .terminal-bell { animation: terminal-bell-fade 2.6s ease-in forwards }
}

[data-terminal-appearance="light"] {
  .terminal-bar { background: #e5e5e9 }
  .terminal-appearance { color: #505971 }
  .terminal-appearance:hover { background: rgb(0 0 0 / 0.08) }
  .terminal-bell { color: #8a6100 }
  .terminal-program-status {
    color: #505971;
    background: color-mix(in srgb, currentColor 14%, rgb(255 255 255 / 0.78));
    box-shadow: 0 0.4rem 1.2rem rgb(0 0 0 / 0.18);
  }
  [data-program-state="working"] { color: #6740a1 }
  [data-program-state="done"] { color: #247247 }
  [data-program-state="blocked"] { color: #8a6100 }
  [data-program-state="error"] { color: #b82836 }
}

.terminal-screen {
  flex: 1;
  min-height: 0;
  padding: 0.5rem 0.4rem 8px 0.8rem;
  border-radius: 0 0 0.6rem 0.6rem;
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
