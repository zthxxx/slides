<script setup lang="ts">
import { useId } from 'vue'
import './diagram.css'

const id = useId()
const arrow = (tone: string) => `url(#${id}-${tone})`
</script>

<template>
  <figure class="tg-diagram">
    <svg viewBox="0 0 1440 580" role="img" aria-label="botmux tmux backend: Web terminal and IM messages reach the worker over separate input paths. The worker writes to a tmux pane via send-keys or paste-buffer and reads raw output via pipe-pane. It broadcasts output to Web viewers and observes status for scheduling; both input sources reach one Agent process.">
      <defs>
        <marker v-for="tone in ['a', 'b', 'line']" :id="`${id}-${tone}`" :key="tone" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
          <path class="head" :class="tone" d="M0,0 L12,6 L0,12 Z" />
        </marker>
      </defs>
      <rect class="zone" x="24" y="24" width="1392" height="506" rx="14" />
      <text class="zone-label" x="50" y="62">BOTMUX · TMUX PIPE BACKEND</text>
      <rect class="box b" x="55" y="105" width="230" height="90" rx="12" />
      <text class="label" x="170" y="143" text-anchor="middle">IM messages</text>
      <text class="sub" x="170" y="174" text-anchor="middle">turn queue / ready gate</text>
      <rect class="box a" x="55" y="340" width="230" height="90" rx="12" />
      <text class="label" x="170" y="378" text-anchor="middle">Web terminal</text>
      <text class="sub" x="170" y="409" text-anchor="middle">interactive input</text>
      <rect class="box" x="450" y="170" width="245" height="160" rx="12" />
      <text class="label" x="572" y="218" text-anchor="middle">botmux worker</text>
      <text class="sub" x="572" y="252" text-anchor="middle">input · output fan-out</text>
      <text class="sub" x="572" y="287" text-anchor="middle">OSC / hooks / idle</text>
      <rect class="box" x="865" y="170" width="220" height="160" rx="12" />
      <text class="label mono" x="975" y="231" text-anchor="middle">tmux server</text>
      <text class="sub" x="975" y="268" text-anchor="middle">one pane</text>
      <rect class="box a" x="1200" y="170" width="180" height="160" rx="12" />
      <text class="label" x="1290" y="231" text-anchor="middle">Agent</text>
      <text class="sub" x="1290" y="268" text-anchor="middle">one process</text>
      <path class="edge b" d="M285,150 H365 V205 H450" :marker-end="arrow('b')" />
      <path class="edge a" d="M285,365 H365 V270 H450" :marker-end="arrow('a')" />
      <path class="edge a" d="M450,303 H400 V405 H285" :marker-end="arrow('a')" />
      <text class="edge-label a" x="365" y="448" text-anchor="middle">WebSocket · input / output</text>
      <path class="edge b" d="M695,205 H865" :marker-end="arrow('b')" />
      <text class="edge-label b mono" x="780" y="143" text-anchor="middle">send-keys</text>
      <text class="edge-label b mono" x="780" y="168" text-anchor="middle">paste-buffer</text>
      <path class="edge a" d="M865,293 H695" :marker-end="arrow('a')" />
      <text class="edge-label a mono" x="780" y="363" text-anchor="middle">pipe-pane</text>
      <text class="edge-label a" x="780" y="389" text-anchor="middle">raw output · FIFO</text>
      <path class="edge a" d="M1085,205 H1200" :marker-end="arrow('a')" />
      <path class="edge a" d="M1200,293 H1085" :marker-end="arrow('a')" />
      <text class="edge-label a mono" x="1142" y="150" text-anchor="middle">pane PTY</text>
      <text class="sub" x="720" y="489" text-anchor="middle">many inputs → one byte stream · one output stream → many observers</text>
      <text class="figure-tag" x="1385" y="562" text-anchor="end">botmux cb8ff44b2 · tmux-pipe-backend.ts / worker.ts</text>
    </svg>
  </figure>
</template>
