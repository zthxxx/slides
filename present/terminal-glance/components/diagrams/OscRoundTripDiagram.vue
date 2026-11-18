<script setup lang="ts">
import { useId } from 'vue'
import './diagram.css'

const id = useId()
const arrow = (tone: string) => `url(#${id}-${tone})`
</script>

<template>
  <figure class="tg-diagram">
    <svg viewBox="0 0 1440 520" role="img" aria-label="OSC query round trip: a remote program writes a query through its PTY and SSH to the client terminal emulator. The emulator writes its reply back through the same transport to the program's terminal input.">
      <defs>
        <marker v-for="tone in ['a', 'b']" :id="`${id}-${tone}`" :key="tone" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
          <path class="head" :class="tone" d="M0,0 L12,6 L0,12 Z" />
        </marker>
      </defs>
      <rect class="zone" x="24" y="24" width="570" height="226" rx="14" />
      <rect class="zone" x="846" y="24" width="570" height="226" rx="14" />
      <text class="zone-label" x="48" y="60">REMOTE MACHINE</text>
      <text class="zone-label" x="870" y="60">CLIENT MACHINE</text>
      <rect class="box a" x="52" y="96" width="210" height="110" rx="12" />
      <text class="label" x="157" y="142" text-anchor="middle">Program</text>
      <text class="sub mono" x="157" y="175" text-anchor="middle">bat / zsh</text>
      <rect class="box" x="330" y="96" width="232" height="110" rx="12" />
      <text class="label mono" x="446" y="142" text-anchor="middle">PTY · sshd</text>
      <text class="sub" x="446" y="175" text-anchor="middle">transport bytes</text>
      <rect class="box" x="878" y="96" width="226" height="110" rx="12" />
      <text class="label mono" x="991" y="142" text-anchor="middle">ssh · PTY</text>
      <text class="sub" x="991" y="175" text-anchor="middle">transport bytes</text>
      <rect class="box b" x="1162" y="96" width="226" height="110" rx="12" />
      <text class="label" x="1275" y="142" text-anchor="middle">Terminal</text>
      <text class="sub" x="1275" y="175" text-anchor="middle">emulator</text>
      <path class="edge event" d="M262,151 H330 M562,151 H878 M1104,151 H1162" />
      <text class="edge-label" x="720" y="133" text-anchor="middle">SSH channel</text>
      <text class="tag" x="720" y="292" text-anchor="middle">OSC ROUND TRIP · END TO END</text>
      <path class="edge a" d="M195,206 V340 H1237 V206" :marker-end="arrow('a')" />
      <path class="flow a" d="M195,230 V340 H1237 V226" />
      <text class="edge-label a mono" x="716" y="326" text-anchor="middle">① TTY output → ESC ] 11 ; ? ST</text>
      <path class="edge b" d="M1313,206 V420 H119 V206" :marker-end="arrow('b')" />
      <path class="flow b" d="M1313,230 V420 H119 V226" />
      <text class="edge-label b mono" x="716" y="406" text-anchor="middle">② TTY input ← ESC ] 11 ; rgb:… ST</text>
      <text class="sub" x="716" y="470" text-anchor="middle">protocol endpoints: Program ↔ Terminal emulator</text>
      <text class="figure-tag" x="1390" y="505" text-anchor="end">SSH carries terminal bytes; OSC is inside that channel</text>
    </svg>
  </figure>
</template>
