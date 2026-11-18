<script setup lang="ts">
import type { BootStage } from '../runtime/kernel'
import { computed } from 'vue'
import { summarizeDownloads } from '../runtime/downloads'
import { KERNEL_DOWNLOAD, linuxBoot } from '../runtime/kernel'

/**
 * A terminal's screen until its shell's first prompt: Linux's boot stages, which one is running, and the downloads'
 * progress. It is in the system's monospace font: the terminal font is `font-display: block`, so text set in it stays
 * invisible until that 1.2 MB file arrives, which on a cold load is most of this screen's life.
 */
type StageState = BootStage['state']

interface Row {
  label: string
  state: StageState
  detail: string
}

const MARKS: Record<StageState, string> = { waiting: '○', active: '●', done: '✓', failed: '✗' }

const mb = (bytes: number) => (bytes / 2 ** 20).toFixed(1)
const took = (stage: BootStage) => stage.startedAt !== undefined && stage.endedAt !== undefined
  ? `${((stage.endedAt - stage.startedAt) / 1000).toFixed(1)} s`
  : ''

/**
 * A download's file and size; no duration: a build's index.html preloads both downloads before this page's scripts
 * run, so a time counted from the stage's start would leave out most of it.
 */
function downloadDetail(stage: BootStage, what: string, include: (name: string) => boolean): string {
  switch (stage.state) {
    case 'done': return stage.bytes ? `${what} · ${mb(stage.bytes)} MB` : what
    case 'failed': return `${what} · failed`
    case 'waiting': return what
  }
  const { loaded, total } = summarizeDownloads(include)
  return total ? `${what} · ${mb(loaded)} / ${mb(total)} MB` : what
}

const rows = computed<Row[]>(() => {
  const { kernel, disk, boot } = linuxBoot
  return [
    { label: 'Download kernel', state: kernel.state, detail: downloadDetail(kernel, KERNEL_DOWNLOAD, name => name === KERNEL_DOWNLOAD) },
    { label: 'Download disk', state: disk.state, detail: downloadDetail(disk, 'boot data', name => name !== KERNEL_DOWNLOAD) },
    { label: 'Boot Linux', state: boot.state, detail: ['kernel, /init, kwtty', boot.state === 'done' && took(boot)].filter(Boolean).join(' · ') },
    // The terminal shows this screen until the shell's first output, so the shell is starting once Linux is up.
    { label: 'Start shell', state: boot.state === 'done' ? 'active' : 'waiting', detail: 'zsh, jovial' },
  ]
})

/** The downloads' bytes, full once both are done. */
const progress = computed(() => {
  if (linuxBoot.kernel.state === 'done' && linuxBoot.disk.state === 'done')
    return '100%'
  const { loaded, total } = summarizeDownloads()
  return `${total ? Math.min(100, loaded / total * 100) : 0}%`
})
</script>

<template>
  <div class="linux-boot" role="status">
    <p class="linux-boot-title">
      <span class="linux-boot-prompt" aria-hidden="true">❯</span>
      Booting Linux…
    </p>
    <ol class="linux-boot-stages">
      <li v-for="row in rows" :key="row.label" :data-state="row.state">
        <span class="linux-boot-mark" aria-hidden="true">{{ MARKS[row.state] }}</span>
        <span>{{ row.label }}</span>
        <span class="linux-boot-detail">{{ row.detail }}</span>
      </li>
    </ol>
    <span class="linux-boot-progress"><i :style="{ width: progress }" /></span>
  </div>
</template>

<style scoped>
/* Centered over the screen; it fades in late, so a shell that starts at once shows none of it. */
.linux-boot {
  --boot-text: #8a93b8;
  --boot-dim: #535c82;
  --boot-active: #f8f8f2;
  --boot-done: #50fa7b;
  --boot-running: #8be9fd;
  --boot-failed: #ff5555;
  --boot-track: rgb(98 114 164 / 0.25);

  position: absolute;
  inset: 0;
  z-index: 2;
  /* Opaque, over the emulator's empty screen and its cursor. */
  background: var(--terminal-background);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: var(--boot-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  animation: linux-boot-in 0.3s ease-out 0.2s both;

  p { margin: 0 }
}

[data-terminal-appearance="light"] .linux-boot {
  --boot-text: #5b6378;
  --boot-dim: #a3a9ba;
  --boot-active: #292d3e;
  --boot-done: #247247;
  --boot-running: #176e80;
  --boot-failed: #b82836;
  --boot-track: rgb(41 45 62 / 0.12);
}

.linux-boot-title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--boot-active);
  font-size: 20px;
}

/* A shell prompt's arrow, blinking like a cursor until the real prompt arrives. */
.linux-boot-prompt {
  color: var(--boot-done);
  font-size: 24px;
  font-weight: 700;
  animation: linux-boot-blink 1.1s ease-in-out infinite;
}

.linux-boot-stages {
  display: grid;
  /* The detail column fits its longest text (`unkernel-alpine.wasm · 12.2 / 12.2 MB`), so the block keeps its place. */
  grid-template-columns: auto auto 38ch;
  gap: 0.35rem 0.9rem;
  margin: 0;
  padding: 0;
  font-size: 15px;
  list-style: none;

  li {
    display: contents;

    &::before { display: none }
  }

  [data-state="waiting"] { color: var(--boot-dim) }
  [data-state="active"] { color: var(--boot-active) }
  [data-state="done"] .linux-boot-mark { color: var(--boot-done) }
  [data-state="failed"] .linux-boot-mark { color: var(--boot-failed) }

  [data-state="active"] .linux-boot-mark {
    color: var(--boot-running);
    animation: linux-boot-blink 1.1s ease-in-out infinite;
  }
}

.linux-boot-detail {
  opacity: 0.8;
}

.linux-boot-progress {
  width: min(22rem, 70%);
  height: 4px;
  border-radius: 2px;
  background: var(--boot-track);
  overflow: hidden;

  i {
    display: block;
    height: 100%;
    background: var(--boot-running);
    transition: width 0.2s linear;
  }
}

@keyframes linux-boot-in {
  from { opacity: 0 }
}

@keyframes linux-boot-blink {
  50% { opacity: 0.3 }
}
</style>
