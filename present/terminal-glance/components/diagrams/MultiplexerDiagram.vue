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
      viewBox="0 0 1440 620"
      role="img"
      aria-label="tmux, a terminal inside a terminal: the outer terminal emulator drives pts/0, where the tmux client runs. The client hands the file descriptor of pts/0 to the tmux server, which then reads keys from it and redraws the composed screen into it. For each pane the server holds a ptmx, parses that pane's output into its own grid and answers terminal queries such as DA1 and OSC 11 itself. pts/1 runs zsh and pts/2 runs nvim. A program can reach the outer terminal only through a passthrough sequence."
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
      <rect class="zone" x="20" y="60" width="450" height="380" rx="14" />
      <text class="zone-label" x="40" y="92">OUTER TERMINAL</text>
      <rect class="zone" x="490" y="60" width="430" height="380" rx="14" />
      <text class="zone-label" x="510" y="92">TMUX SERVER</text>
      <rect class="zone" x="940" y="60" width="480" height="380" rx="14" />
      <text class="zone-label" x="960" y="92">PANES</text>

      <!-- Outer side -->
      <rect class="box" x="40" y="150" width="200" height="80" rx="12" />
      <text class="label" x="140" y="186" text-anchor="middle">Terminal</text>
      <text class="sub" x="140" y="212" text-anchor="middle">iTerm2 · Ghostty …</text>

      <rect class="box" x="290" y="150" width="150" height="80" rx="10" />
      <text class="label mono" x="365" y="187" text-anchor="middle">pts/0</text>
      <text class="sub" x="365" y="212" text-anchor="middle">the client's tty</text>

      <rect class="box idle" x="290" y="310" width="150" height="80" rx="10" />
      <text class="label mono" x="365" y="347" text-anchor="middle">tmux</text>
      <text class="sub" x="365" y="372" text-anchor="middle">client</text>

      <!-- Server: one parser and one grid per pane -->
      <rect class="box b" x="510" y="120" width="390" height="190" rx="12" />
      <text class="label mono" x="705" y="156" text-anchor="middle">tmux server</text>
      <rect class="box" x="530" y="176" width="170" height="56" rx="8" />
      <text class="grid-text mono" x="615" y="210" text-anchor="middle">pane 1 · grid</text>
      <rect class="box" x="710" y="176" width="170" height="56" rx="8" />
      <text class="grid-text mono" x="795" y="210" text-anchor="middle">pane 2 · grid</text>
      <text class="sub" x="705" y="268" text-anchor="middle">VT parser per pane · composes one screen</text>
      <text class="sub b-ink" x="705" y="294" text-anchor="middle">answers DA1 · OSC 11 itself</text>

      <!-- Panes -->
      <rect class="box a" x="960" y="120" width="170" height="70" rx="10" />
      <text class="label mono" x="1045" y="164" text-anchor="middle">pts/1</text>
      <rect class="box a" x="1220" y="120" width="180" height="70" rx="10" />
      <text class="label mono" x="1310" y="164" text-anchor="middle">zsh</text>
      <rect class="box a" x="960" y="240" width="170" height="70" rx="10" />
      <text class="label mono" x="1045" y="284" text-anchor="middle">pts/2</text>
      <rect class="box a" x="1220" y="240" width="180" height="70" rx="10" />
      <text class="label mono" x="1310" y="284" text-anchor="middle">nvim</text>

      <!-- Terminal ⇄ pts/0 -->
      <path class="edge" d="M240,190 H290" :marker-start="arrow('line')" :marker-end="arrow('line')" />
      <text class="edge-label" x="265" y="140" text-anchor="middle">ptmx</text>

      <!-- The client runs on pts/0 and hands its fd to the server -->
      <path class="edge event" d="M365,310 V230" :marker-end="arrow('line')" />
      <text class="edge-label" x="377" y="276" text-anchor="start">runs on</text>
      <path class="edge b event" d="M440,350 H690 V310" :marker-end="arrow('b')" />
      <text class="edge-label b" x="690" y="384" text-anchor="middle">passes the fd of pts/0</text>

      <!-- The server does the client's tty I/O itself -->
      <path class="edge b" d="M440,172 H510" :marker-end="arrow('b')" />
      <path class="flow b" d="M440,172 H500" />
      <path class="edge b" d="M510,208 H440" :marker-end="arrow('b')" />
      <path class="flow b" d="M510,208 H450" />
      <text class="edge-label b" x="475" y="140" text-anchor="middle">keys · redraw</text>

      <!-- Server ⇄ each pane through its own ptmx -->
      <path class="edge a" d="M900,155 H960" :marker-start="arrow('a')" :marker-end="arrow('a')" />
      <text class="edge-label a" x="930" y="140" text-anchor="middle">ptmx</text>
      <path class="edge a" d="M900,275 H960" :marker-start="arrow('a')" :marker-end="arrow('a')" />
      <text class="edge-label a" x="930" y="260" text-anchor="middle">ptmx</text>
      <path class="edge a" d="M1130,155 H1220" :marker-start="arrow('a')" :marker-end="arrow('a')" />
      <path class="edge a" d="M1130,275 H1220" :marker-start="arrow('a')" :marker-end="arrow('a')" />
      <text class="edge-label a" x="1175" y="140" text-anchor="middle">fd 0·1·2</text>

      <!-- Passthrough: the only way a pane's bytes reach the outer terminal unparsed -->
      <path class="edge b event" d="M1370,310 V520 H80 V230" :marker-end="arrow('b')" />
      <text class="edge-label key b" x="720" y="508" text-anchor="middle">ESC P tmux; … ESC \ · allow-passthrough</text>

      <!-- Two roles -->
      <text class="tag" x="255" y="476" text-anchor="middle"><tspan class="strong">to the outer terminal</tspan>  a program on pts/0</text>
      <text class="tag" x="1180" y="476" text-anchor="middle"><tspan class="strong">to the panes</tspan>  a terminal emulator</text>

      <text class="figure-tag mono" x="1420" y="606" text-anchor="end">fig · tmux 3.7c · client.c MSG_IDENTIFY_STDIN · tty.c · spawn.c fdforkpty</text>
    </svg>
  </DiagramFrame>
</template>

<style scoped>
.grid-text {
  fill: var(--dg-ink);
  font-size: 18px;
  font-weight: 600;
}

.b-ink {
  fill: var(--dg-b);
}
</style>
