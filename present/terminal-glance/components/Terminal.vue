<script setup lang="ts">
import { useIsSlideActive, useNav, useSlideContext } from '@slidev/client'
import { computed, inject, useTemplateRef, watch } from 'vue'
import { shellDemoKey, terminalAccent } from '../runtime/demo'
import { useLinux } from '../runtime/kernel'
import { serveRelayedSteps } from '../runtime/relay'
import { playStep, sessionKey, useShellSession } from '../runtime/session'

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
const session = live ? useShellSession(sessionKey($page.value, props.name)) : undefined
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

const title = computed(() => {
  const pts = session?.pts.value
  return pts === undefined ? props.name.toUpperCase() : `${props.name.toUpperCase()} · /dev/pts/${pts}`
})

const status = computed(() => {
  switch (session?.status.value) {
    case 'starting': return 'booting Linux…'
    case 'failed': return 'unavailable'
    default: return ''
  }
})
</script>

<template>
  <figure class="terminal-window">
    <header class="terminal-bar">
      <span class="terminal-dots"><i /><i /><i /></span>
      <span class="terminal-title" :style="{ color: accent }">{{ title }}</span>
      <span class="terminal-status">{{ status }}</span>
    </header>
    <div v-if="live" ref="screen" class="terminal-screen" />
    <div v-else class="terminal-screen terminal-stand-in">
      Linux runs in the slide window; steps clicked here are typed there
    </div>
  </figure>
</template>

<style scoped>
.terminal-window {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  margin: 0;
  overflow: hidden;
  border-radius: 0.6rem;
  background: #272936;
  box-shadow: 0 0.6rem 1.6rem rgb(0 0 0 / 0.25);
}

.terminal-bar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.45rem 0.9rem;
  background: #1e1f29;
  font-family: "Fira Code", Menlo, monospace;
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

.terminal-screen {
  flex: 1;
  min-height: 0;
  padding: 0.5rem 0.4rem 0.3rem 0.8rem;
  /* The emulator's host is enlarged by the slide scale and scaled back down (runtime/emulator.ts). */
  overflow: hidden;
}

.terminal-stand-in {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6272a4;
  font-family: "Fira Code", Menlo, monospace;
  font-size: 18px;
}
</style>

<style>
/* The element ghostty-web renders into: it makes it the focusable, contenteditable input of the terminal. */
.shell-session {
  width: 100%;
  height: 100%;
  outline: none;
  caret-color: transparent;
}
</style>
