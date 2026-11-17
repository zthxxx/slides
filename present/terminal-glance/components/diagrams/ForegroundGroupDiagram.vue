<script setup lang="ts">
import { useId } from 'vue'
import './diagram.css'

// Marker ids must be unique per instance: Slidev renders a slide more than once (overview, presenter).
const id = useId()
const arrow = (tone: string) => `url(#${id}-${tone})`
</script>

<template>
  <figure class="tg-diagram">
    <svg
      viewBox="0 0 1400 540"
      role="img"
      aria-label="A terminal's input goes to tty/0, whose output goes back to the terminal. bash is the foreground process group: it reads and writes tty/0. fish runs in the background: it can still write to tty/0, but reading it stops fish with SIGTTIN."
    >
      <defs>
        <marker
          v-for="tone in ['line', 'a', 'b', 'danger']"
          :id="`${id}-${tone}`"
          :key="tone"
          viewBox="0 0 12 12"
          refX="11"
          refY="6"
          markerWidth="13"
          markerHeight="13"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L12,6 L0,12 z" class="head" :class="tone" />
        </marker>
      </defs>

      <!-- Layers -->
      <rect class="zone" x="20" y="40" width="270" height="460" rx="14" />
      <text class="zone-label" x="44" y="74">TERMINAL</text>
      <rect class="zone" x="390" y="40" width="540" height="460" rx="14" />
      <text class="zone-label" x="414" y="74">KERNEL</text>
      <rect class="zone" x="990" y="40" width="390" height="460" rx="14" />
      <text class="zone-label" x="1014" y="74">USER SPACE</text>

      <!-- Terminal -->
      <rect class="box" x="55" y="190" width="200" height="140" rx="12" />
      <text class="label" x="155" y="252" text-anchor="middle">Terminal</text>
      <text class="sub" x="155" y="280" text-anchor="middle">keyboard · screen</text>

      <!-- tty/0 and its foreground process group -->
      <rect class="frame-box" x="460" y="112" width="400" height="316" rx="16" />
      <text class="label mono" x="660" y="214" text-anchor="middle">tty/0</text>
      <text class="sub" x="660" y="248" text-anchor="middle">Foreground process group</text>
      <rect class="box a" x="545" y="282" width="230" height="56" rx="28" />
      <text class="label mono accent-a" x="660" y="319" text-anchor="middle" style="font-size: 22px">pgrp → bash</text>

      <!-- Terminal ⇄ tty/0 -->
      <path class="edge" d="M255,228 H460" :marker-end="arrow('line')" />
      <path class="flow a" d="M255,228 H450" />
      <text class="edge-label" x="345" y="214" text-anchor="middle">Input</text>
      <path class="edge" d="M460,292 H255" :marker-end="arrow('line')" />
      <path class="flow a" d="M460,292 H265" />
      <text class="edge-label" x="345" y="320" text-anchor="middle">Output</text>

      <!-- bash: foreground, reads and writes -->
      <rect class="box a" x="1030" y="110" width="310" height="120" rx="12" />
      <text class="label mono" x="1185" y="164" text-anchor="middle">bash</text>
      <text class="sub" x="1185" y="194" text-anchor="middle">foreground · active</text>
      <path class="edge a" d="M860,152 H1030" :marker-end="arrow('a')" />
      <path class="flow a" d="M860,152 H1020" />
      <path class="edge a" d="M1030,198 H860" :marker-end="arrow('a')" />
      <path class="flow a" d="M1030,198 H870" />
      <text class="edge-label key a" x="945" y="140" text-anchor="middle">R</text>
      <text class="edge-label key a" x="945" y="226" text-anchor="middle">W</text>

      <!-- fish: background, may write, a read stops it -->
      <rect class="box idle" x="1030" y="310" width="310" height="120" rx="12" />
      <text class="label mono" x="1185" y="364" text-anchor="middle">fish</text>
      <text class="sub" x="1185" y="394" text-anchor="middle">background</text>
      <path class="edge" d="M1030,338 H860" :marker-end="arrow('line')" />
      <path class="flow line" d="M1030,338 H870" />
      <text class="edge-label key" x="945" y="326" text-anchor="middle">W</text>
      <path class="edge blocked" d="M860,402 H1030" :marker-end="arrow('danger')" />
      <g transform="translate(945 402)">
        <line class="cross" x1="-9" y1="-9" x2="9" y2="9" />
        <line class="cross" x1="-9" y1="9" x2="9" y2="-9" />
      </g>
      <text class="edge-label key danger" x="945" y="438" text-anchor="middle">R → SIGTTIN</text>

      <text class="figure-tag mono" x="1380" y="528" text-anchor="end">fig · only the foreground group reads; any group may write</text>
    </svg>
  </figure>
</template>
