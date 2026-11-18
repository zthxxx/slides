<script setup lang="ts">
import { useId } from 'vue'
import DiagramFrame from './DiagramFrame.vue'

// Marker ids must be unique per instance: Slidev renders a slide more than once (overview, presenter).
const id = useId()
const arrow = (tone: string) => `url(#${id}-${tone})`
</script>

<template>
  <DiagramFrame>
    <svg
      viewBox="0 0 1440 660"
      role="img"
      aria-label="ssh and pts: the terminal talks the ssh protocol to the ssh server, which writes to and reads from ptmx, the pseudo-terminal master in the kernel. Each pseudo-terminal slave, pts/0, pts/1 and pts/2, is the terminal of one shell; the ssh server forks the shell that runs on pts/0."
    >
      <defs>
        <marker
          v-for="tone in ['line', 'a']"
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
      <rect class="zone" x="20" y="40" width="240" height="590" rx="14" />
      <text class="zone-label" x="44" y="74">CLIENT</text>
      <rect class="zone" x="290" y="40" width="1130" height="230" rx="14" />
      <text class="zone-label" x="314" y="74">USER SPACE</text>
      <rect class="zone" x="290" y="340" width="1130" height="290" rx="14" />
      <text class="zone-label" x="314" y="374">KERNEL</text>

      <!-- Client -->
      <rect class="box a" x="45" y="115" width="190" height="80" rx="12" />
      <text class="label" x="140" y="163" text-anchor="middle">Terminal</text>

      <!-- User space -->
      <rect class="box a" x="370" y="115" width="220" height="80" rx="12" />
      <text class="label" x="480" y="152" text-anchor="middle">ssh server</text>
      <text class="sub mono" x="480" y="178" text-anchor="middle">sshd</text>

      <rect class="box a" x="735" y="115" width="170" height="80" rx="12" />
      <text class="label mono" x="820" y="164" text-anchor="middle">shell</text>
      <rect class="box" x="975" y="115" width="170" height="80" rx="12" />
      <text class="label mono" x="1060" y="164" text-anchor="middle">shell</text>
      <rect class="box" x="1215" y="115" width="170" height="80" rx="12" />
      <text class="label mono" x="1300" y="164" text-anchor="middle">shell</text>

      <!-- Kernel -->
      <rect class="box" x="370" y="400" width="220" height="120" rx="12" />
      <text class="label mono" x="480" y="456" text-anchor="middle">ptmx</text>
      <text class="sub mono" x="480" y="486" text-anchor="middle">/dev/ptmx</text>

      <rect class="box a" x="735" y="410" width="170" height="80" rx="10" />
      <text class="label mono" x="820" y="459" text-anchor="middle">pts/0</text>
      <rect class="box" x="975" y="410" width="170" height="80" rx="10" />
      <text class="label mono" x="1060" y="459" text-anchor="middle">pts/1</text>
      <rect class="box" x="1215" y="410" width="170" height="80" rx="10" />
      <text class="label mono" x="1300" y="459" text-anchor="middle">pts/2</text>

      <!-- Terminal ⇄ ssh server over the network -->
      <path class="edge a" d="M235,140 H370" :marker-end="arrow('a')" />
      <path class="flow a" d="M235,140 H360" />
      <path class="edge a" d="M370,170 H235" :marker-end="arrow('a')" />
      <path class="flow a" d="M370,170 H245" />
      <text class="edge-label a" x="302" y="126" text-anchor="middle">ssh protocol</text>

      <!-- ssh server forks the session's shell -->
      <path class="edge a event" d="M590,155 H735" :marker-end="arrow('a')" />
      <text class="edge-label a" x="662" y="141" text-anchor="middle">fork</text>

      <!-- ssh server ⇄ ptmx -->
      <path class="edge a" d="M450,195 V400" :marker-end="arrow('a')" />
      <path class="flow a" d="M450,195 V390" />
      <path class="edge a" d="M510,400 V195" :marker-end="arrow('a')" />
      <path class="flow a" d="M510,400 V205" />
      <text class="edge-label a" x="438" y="310" text-anchor="end">write</text>
      <text class="edge-label a" x="522" y="310" text-anchor="start">read</text>

      <!-- ptmx ⇄ each pts: one master end per slave -->
      <path class="edge a" d="M590,450 H735" :marker-start="arrow('a')" :marker-end="arrow('a')" />
      <path class="edge" d="M590,500 H650 V565 H1060 V490" :marker-start="arrow('line')" :marker-end="arrow('line')" />
      <path class="edge" d="M1060,565 H1300 V490" :marker-end="arrow('line')" />
      <circle class="junction" cx="1060" cy="565" r="4.5" />

      <!-- pts ⇄ shell: the shell's stdin, stdout and stderr -->
      <path class="edge a" d="M820,410 V195" :marker-start="arrow('a')" :marker-end="arrow('a')" />
      <path class="edge" d="M1060,410 V195" :marker-start="arrow('line')" :marker-end="arrow('line')" />
      <path class="edge" d="M1300,410 V195" :marker-start="arrow('line')" :marker-end="arrow('line')" />
      <text class="edge-label a" x="832" y="310" text-anchor="start">fd 0 · 1 · 2</text>

      <!-- What the two kernel ends are called -->
      <text class="tag" x="480" y="608" text-anchor="middle"><tspan class="strong">PTMX</tspan>  pseudo-terminal master</text>
      <path class="bracket" d="M735,584 V592 H1385 V584" />
      <text class="tag" x="1060" y="614" text-anchor="middle"><tspan class="strong">PTS</tspan>  pseudo-terminal slave</text>

      <text class="figure-tag mono" x="1420" y="652" text-anchor="end">fig · sshd holds the master end, the shell gets /dev/pts/N</text>
    </svg>
  </DiagramFrame>
</template>
