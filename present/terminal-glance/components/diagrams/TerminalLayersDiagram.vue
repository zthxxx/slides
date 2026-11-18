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
      aria-label="Terminal layers: a terminal emulator, a transport that holds the pseudo-terminal master, the kernel TTY, and the program. Three fixed interfaces separate them: VT bytes, the ptmx file descriptor, and the tty file descriptor. Each layer has several implementations. In this deck: ghostty-web, kwtty serve in the guest reached over vsock, /dev/pts/N of the unkernel Linux, and zsh."
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

      <!-- Layers, each with the implementations that can fill it -->
      <rect class="zone" x="20" y="60" width="280" height="280" rx="14" />
      <text class="zone-label" x="40" y="92">EMULATOR</text>
      <rect class="zone" x="330" y="60" width="270" height="280" rx="14" />
      <text class="zone-label" x="350" y="92">TRANSPORT</text>
      <rect class="zone" x="630" y="60" width="380" height="280" rx="14" />
      <text class="zone-label" x="650" y="92">KERNEL TTY</text>
      <rect class="zone" x="1040" y="60" width="380" height="280" rx="14" />
      <text class="zone-label" x="1060" y="92">PROGRAM</text>

      <rect class="zone" x="20" y="380" width="1400" height="250" rx="14" />
      <text class="zone-label" x="40" y="412">THIS DECK</text>

      <!-- The fixed interfaces between the layers -->
      <path class="edge b iface" d="M315,44 V626" />
      <path class="edge b iface" d="M615,44 V626" />
      <path class="edge b iface" d="M1025,44 V626" />
      <text class="edge-label key b" x="315" y="30" text-anchor="middle">VT bytes</text>
      <text class="edge-label key b" x="615" y="30" text-anchor="middle">ptmx fd</text>
      <text class="edge-label key b" x="1025" y="30" text-anchor="middle">tty fd</text>

      <!-- Emulators -->
      <g class="chip">
        <rect class="box" x="40" y="112" width="115" height="42" rx="8" />
        <text class="chip-text" x="97.5" y="140" text-anchor="middle">iTerm2</text>
        <rect class="box" x="165" y="112" width="115" height="42" rx="8" />
        <text class="chip-text" x="222.5" y="140" text-anchor="middle">Ghostty</text>
        <rect class="box" x="40" y="166" width="115" height="42" rx="8" />
        <text class="chip-text" x="97.5" y="194" text-anchor="middle">kitty</text>
        <rect class="box" x="165" y="166" width="115" height="42" rx="8" />
        <text class="chip-text" x="222.5" y="194" text-anchor="middle">Warp</text>
        <rect class="box a" x="40" y="220" width="240" height="42" rx="8" />
        <text class="chip-text mono" x="160" y="248" text-anchor="middle">ghostty-web</text>
      </g>
      <text class="tag" x="160" y="316" text-anchor="middle">keys → bytes · bytes → cells</text>

      <!-- Transports: who holds the master end -->
      <g class="chip">
        <rect class="box" x="350" y="112" width="230" height="42" rx="8" />
        <text class="chip-text" x="465" y="140" text-anchor="middle">local · the emulator</text>
        <rect class="box" x="350" y="166" width="230" height="42" rx="8" />
        <text class="chip-text mono" x="465" y="194" text-anchor="middle">ssh · sshd</text>
        <rect class="box" x="350" y="220" width="230" height="42" rx="8" />
        <text class="chip-text mono" x="465" y="248" text-anchor="middle">tmux server</text>
      </g>
      <text class="tag" x="465" y="316" text-anchor="middle">holds the master end</text>

      <!-- Kernel TTY -->
      <rect class="box" x="650" y="112" width="340" height="88" rx="12" />
      <text class="label" x="820" y="150" text-anchor="middle">line discipline</text>
      <text class="sub mono" x="820" y="180" text-anchor="middle">termios · echo · icanon · isig</text>
      <g class="chip">
        <rect class="box" x="650" y="220" width="104" height="42" rx="8" />
        <text class="chip-text" x="702" y="248" text-anchor="middle">Linux</text>
        <rect class="box" x="768" y="220" width="104" height="42" rx="8" />
        <text class="chip-text" x="820" y="248" text-anchor="middle">macOS</text>
        <rect class="box a" x="886" y="220" width="104" height="42" rx="8" />
        <text class="chip-text" x="938" y="248" text-anchor="middle">unkernel</text>
      </g>
      <text class="tag" x="820" y="316" text-anchor="middle">pty pair · ptmx ⇄ pts</text>

      <!-- Programs -->
      <g class="chip">
        <rect class="box a" x="1060" y="112" width="165" height="42" rx="8" />
        <text class="chip-text mono" x="1142.5" y="140" text-anchor="middle">zsh</text>
        <rect class="box" x="1235" y="112" width="165" height="42" rx="8" />
        <text class="chip-text mono" x="1317.5" y="140" text-anchor="middle">bash</text>
        <rect class="box" x="1060" y="166" width="165" height="42" rx="8" />
        <text class="chip-text mono" x="1142.5" y="194" text-anchor="middle">nvim</text>
        <rect class="box" x="1235" y="166" width="165" height="42" rx="8" />
        <text class="chip-text mono" x="1317.5" y="194" text-anchor="middle">htop</text>
        <rect class="box" x="1060" y="220" width="165" height="42" rx="8" />
        <text class="chip-text mono" x="1142.5" y="248" text-anchor="middle">less</text>
        <rect class="box" x="1235" y="220" width="165" height="42" rx="8" />
        <text class="chip-text" x="1317.5" y="248" text-anchor="middle">Claude Code</text>
      </g>
      <text class="tag" x="1230" y="316" text-anchor="middle">reads and writes fd 0 · 1 · 2</text>

      <!-- This deck's own chain, one implementation per layer -->
      <rect class="box a" x="40" y="450" width="240" height="90" rx="12" />
      <text class="label mono" x="160" y="490" text-anchor="middle">ghostty-web</text>
      <text class="sub" x="160" y="520" text-anchor="middle">Ghostty VT · WASM · canvas</text>

      <rect class="box a" x="350" y="450" width="230" height="90" rx="12" />
      <text class="label mono" x="465" y="490" text-anchor="middle">kwtty serve</text>
      <text class="sub" x="465" y="520" text-anchor="middle">in the guest · forkpty()</text>

      <rect class="box a" x="650" y="450" width="340" height="90" rx="12" />
      <text class="label mono" x="820" y="490" text-anchor="middle">/dev/pts/N</text>
      <text class="sub" x="820" y="520" text-anchor="middle">unkernel · Linux in WebAssembly</text>

      <rect class="box a" x="1060" y="450" width="340" height="90" rx="12" />
      <text class="label mono" x="1230" y="490" text-anchor="middle">zsh</text>
      <text class="sub" x="1230" y="520" text-anchor="middle">root's login shell</text>

      <path class="edge a" d="M280,478 H350" :marker-end="arrow('a')" />
      <path class="flow a" d="M280,478 H340" />
      <path class="edge a" d="M350,512 H280" :marker-end="arrow('a')" />
      <path class="flow a" d="M350,512 H290" />
      <path class="edge a" d="M580,478 H650" :marker-end="arrow('a')" />
      <path class="edge a" d="M650,512 H580" :marker-end="arrow('a')" />
      <path class="edge a" d="M990,478 H1060" :marker-end="arrow('a')" />
      <path class="edge a" d="M1060,512 H990" :marker-end="arrow('a')" />

      <text class="edge-label a" x="315" y="576" text-anchor="middle">JS Pty ⇄ vsock :1022</text>
      <text class="edge-label a" x="615" y="576" text-anchor="middle">ptmx</text>
      <text class="edge-label a" x="1025" y="576" text-anchor="middle">fd 0 · 1 · 2</text>

      <text class="figure-tag mono" x="1420" y="652" text-anchor="end">fig · the interfaces stay, every layer can be swapped</text>
    </svg>
  </DiagramFrame>
</template>

<style scoped>
.chip-text {
  fill: var(--dg-ink);
  font-size: 19px;
  font-weight: 600;
}

.iface {
  stroke-dasharray: 8 7;
  stroke-width: 2;
  opacity: 0.75;
}
</style>
