<script setup lang="ts">
import { useId } from 'vue'
import './diagram.css'

const id = useId()
const arrow = (tone: string) => `url(#${id}-${tone})`
</script>

<template>
  <figure class="tg-diagram">
    <svg viewBox="0 0 1440 650" role="img" aria-label="Without a pane relay, tmux's DA1 reply can arrive before the worker's OSC7501 reply. A pane-resident relay answers the probe before forwarding the following DA1 query, guaranteeing reply order.">
      <defs>
        <marker v-for="tone in ['a', 'b', 'danger']" :id="`${id}-${tone}`" :key="tone" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
          <path class="head" :class="tone" d="M0,0 L12,6 L0,12 Z" />
        </marker>
      </defs>
      <rect class="zone" x="24" y="24" width="1392" height="284" rx="12" />
      <text class="zone-label" x="48" y="62">ASYNC WORKER REPLY</text>
      <rect class="box" x="70" y="94" width="230" height="68" rx="10" />
      <rect class="box" x="620" y="94" width="230" height="68" rx="10" />
      <rect class="box" x="1100" y="94" width="260" height="68" rx="10" />
      <text class="label" x="185" y="137" text-anchor="middle">Agent</text>
      <text class="label mono" x="735" y="137" text-anchor="middle">tmux</text>
      <text class="label" x="1230" y="137" text-anchor="middle">worker</text>
      <path class="edge a" d="M300,115 H620" :marker-end="arrow('a')" />
      <text class="edge-label a mono" x="460" y="99" text-anchor="middle">probe + DA1</text>
      <path class="edge a" d="M850,115 H1100" :marker-end="arrow('a')" />
      <text class="edge-label a mono" x="975" y="99" text-anchor="middle">pipe-pane</text>
      <path class="edge blocked" d="M735,162 V217 H185 V162" :marker-end="arrow('danger')" />
      <text class="edge-label danger" x="455" y="202" text-anchor="middle">DA1 reply arrives first</text>
      <path class="edge b event" d="M1230,162 V275 H185 V162" :marker-end="arrow('b')" />
      <text class="edge-label b" x="760" y="261" text-anchor="middle">probe reply via worker / send-keys arrives later</text>
      <rect class="zone" x="24" y="338" width="1392" height="284" rx="12" />
      <text class="zone-label" x="48" y="376">PANE-RESIDENT RELAY</text>
      <rect class="box" x="70" y="414" width="230" height="75" rx="10" />
      <rect class="box a" x="610" y="414" width="250" height="75" rx="10" />
      <rect class="box" x="1100" y="414" width="260" height="75" rx="10" />
      <text class="label" x="185" y="461" text-anchor="middle">Agent</text>
      <text class="label" x="735" y="461" text-anchor="middle">inner PTY · relay</text>
      <text class="label mono" x="1230" y="461" text-anchor="middle">tmux</text>
      <path class="edge a" d="M300,435 H610" :marker-end="arrow('a')" />
      <text class="edge-label a mono" x="455" y="420" text-anchor="middle">probe + DA1</text>
      <path class="edge a" d="M735,489 V565 H185 V489" :marker-end="arrow('a')" />
      <text class="edge-label a" x="460" y="550" text-anchor="middle">1 · write probe reply to inner PTY</text>
      <path class="edge b" d="M860,455 H1100" :marker-end="arrow('b')" />
      <text class="edge-label b" x="980" y="512" text-anchor="middle">2 · forward DA1</text>
      <text class="figure-tag" x="1388" y="644" text-anchor="end">botmux cb8ff44b2 · program-status-probe-relay.ts</text>
    </svg>
  </figure>
</template>
