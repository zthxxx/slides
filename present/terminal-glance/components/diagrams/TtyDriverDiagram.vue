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
      viewBox="0 0 1400 600"
      role="img"
      aria-label="Each terminal talks to its own tty device in the kernel's TTY driver; every process opened on that tty reads and writes through it: Terminal A with tty/0 and processes A and B, Terminal B with tty/1 and processes C and D."
    >
      <defs>
        <marker
          v-for="tone in ['line', 'a', 'b']"
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
      <rect class="zone" x="20" y="40" width="290" height="520" rx="14" />
      <text class="zone-label" x="44" y="74">TERMINAL</text>
      <rect class="zone" x="370" y="40" width="530" height="520" rx="14" />
      <text class="zone-label" x="394" y="74">KERNEL</text>
      <rect class="zone" x="960" y="40" width="420" height="520" rx="14" />
      <text class="zone-label" x="984" y="74">USER SPACE</text>

      <!-- Terminals -->
      <rect class="box a" x="60" y="174" width="210" height="92" rx="12" />
      <text class="label" x="165" y="228" text-anchor="middle">Terminal A</text>
      <rect class="box b" x="60" y="394" width="210" height="92" rx="12" />
      <text class="label" x="165" y="448" text-anchor="middle">Terminal B</text>

      <!-- TTY driver -->
      <rect class="frame-box" x="420" y="100" width="430" height="440" rx="16" />
      <text class="label" x="635" y="140" text-anchor="middle">TTY Driver</text>
      <text class="sub" x="635" y="164" text-anchor="middle">I/O · line discipline</text>
      <rect class="box a" x="555" y="180" width="160" height="80" rx="10" />
      <text class="label mono" x="635" y="229" text-anchor="middle">tty/0</text>
      <rect class="box b" x="555" y="400" width="160" height="80" rx="10" />
      <text class="label mono" x="635" y="449" text-anchor="middle">tty/1</text>

      <!-- Processes -->
      <rect class="box" x="1000" y="148" width="340" height="64" rx="10" />
      <text class="label" x="1170" y="188" text-anchor="middle">User process A</text>
      <rect class="box" x="1000" y="228" width="340" height="64" rx="10" />
      <text class="label" x="1170" y="268" text-anchor="middle">User process B</text>
      <rect class="box" x="1000" y="368" width="340" height="64" rx="10" />
      <text class="label" x="1170" y="408" text-anchor="middle">User process C</text>
      <rect class="box" x="1000" y="448" width="340" height="64" rx="10" />
      <text class="label" x="1170" y="488" text-anchor="middle">User process D</text>

      <!-- Terminal ⇄ tty: input in, output back -->
      <path class="edge a" d="M270,206 H555" :marker-end="arrow('a')" />
      <path class="flow a" d="M270,206 H545" />
      <path class="edge a" d="M555,234 H270" :marker-end="arrow('a')" />
      <path class="flow a" d="M555,234 H280" />
      <text class="edge-label a" x="345" y="194" text-anchor="middle">input</text>
      <text class="edge-label a" x="345" y="260" text-anchor="middle">output</text>

      <path class="edge b" d="M270,426 H555" :marker-end="arrow('b')" />
      <path class="flow b" d="M270,426 H545" />
      <path class="edge b" d="M555,454 H270" :marker-end="arrow('b')" />
      <path class="flow b" d="M555,454 H280" />
      <text class="edge-label b" x="345" y="414" text-anchor="middle">input</text>
      <text class="edge-label b" x="345" y="480" text-anchor="middle">output</text>

      <!-- tty ⇄ processes: read and write on the same device -->
      <path class="edge a" d="M715,220 H930 V180 H1000" :marker-start="arrow('a')" :marker-end="arrow('a')" />
      <path class="edge a" d="M715,220 H930 V260 H1000" :marker-start="arrow('a')" :marker-end="arrow('a')" />
      <circle class="junction a" cx="930" cy="220" r="4.5" />
      <text class="edge-label a" x="822" y="208" text-anchor="middle">read · write</text>

      <path class="edge b" d="M715,440 H930 V400 H1000" :marker-start="arrow('b')" :marker-end="arrow('b')" />
      <path class="edge b" d="M715,440 H930 V480 H1000" :marker-start="arrow('b')" :marker-end="arrow('b')" />
      <circle class="junction b" cx="930" cy="440" r="4.5" />
      <text class="edge-label b" x="822" y="428" text-anchor="middle">read · write</text>

      <text class="figure-tag mono" x="1380" y="588" text-anchor="end">fig · one terminal, one tty, many processes</text>
    </svg>
  </figure>
</template>
