<script setup lang="ts">
import { useId } from 'vue'
import './diagram.css'

const id = useId()
const arrow = (tone: string) => `url(#${id}-${tone})`
</script>

<template>
  <figure class="tg-diagram">
    <svg viewBox="0 0 1440 740" role="img" aria-label="Top: the Agent runs on the pane's pts; the tmux server holds the pane's ptmx and acts as the pane's terminal, so it answers the DA1 query itself within milliseconds, while the worker only sees the OSC 7501 probe through pipe-pane and answers later through send-keys. Bottom: a relay runs in the pane and holds an inner ptmx for the Agent; it writes the probe reply synchronously, then forwards the DA1 query to tmux, so tmux's DA1 reply always arrives after the probe reply.">
      <defs>
        <marker v-for="tone in ['a', 'b', 'line', 'danger']" :id="`${id}-${tone}`" :key="tone" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
          <path class="head" :class="tone" d="M0,0 L12,6 L0,12 Z" />
        </marker>
      </defs>

      <!-- Without a relay: tmux is the pane's terminal and answers DA1 before the worker can answer the probe. -->
      <rect class="zone" x="24" y="20" width="1392" height="324" rx="12" />
      <text class="zone-label" x="48" y="54">WITHOUT RELAY · TMUX IS THE PANE'S TERMINAL</text>
      <rect class="box" x="40" y="85" width="210" height="100" rx="10" />
      <text class="label" x="145" y="128" text-anchor="middle">Agent</text>
      <text class="sub mono" x="145" y="160" text-anchor="middle">on pane pts</text>
      <rect class="box b" x="500" y="85" width="330" height="100" rx="10" />
      <text class="label mono" x="665" y="125" text-anchor="middle">tmux server</text>
      <text class="sub" x="665" y="158" text-anchor="middle">holds pane ptmx · the pane's terminal</text>
      <rect class="box" x="1110" y="85" width="290" height="100" rx="10" />
      <text class="label" x="1255" y="128" text-anchor="middle">botmux worker</text>
      <text class="sub" x="1255" y="160" text-anchor="middle">reads FIFO · runs send-keys</text>
      <path class="edge a" d="M250,135 H500" :marker-end="arrow('a')" />
      <text class="edge-label a mono" x="375" y="121" text-anchor="middle">① probe + DA1</text>
      <path class="edge a" d="M830,135 H1110" :marker-end="arrow('a')" />
      <text class="edge-label a mono" x="970" y="121" text-anchor="middle">③ pipe-pane → FIFO</text>
      <path class="edge blocked" d="M665,185 V240 H175 V185" :marker-end="arrow('danger')" />
      <text class="edge-label danger" x="420" y="228" text-anchor="middle">② tmux answers DA1 itself · ~1–2 ms</text>
      <path class="edge b event" d="M1255,185 V300 H105 V185" :marker-end="arrow('b')" />
      <text class="edge-label b" x="680" y="288" text-anchor="middle">④ 7501 reply: send-keys → tmux → pane input, arrives after ②</text>
      <text class="tag" x="1380" y="332" text-anchor="end"><tspan class="strong">Agent</tspan>: DA1 came first → no status support</text>

      <!-- With the relay: the probe is answered inside the pane before DA1 reaches tmux. -->
      <rect class="zone" x="24" y="370" width="1392" height="330" rx="12" />
      <text class="zone-label" x="48" y="404">PANE-RESIDENT RELAY · ANSWER BEFORE FORWARDING</text>
      <rect class="box" x="40" y="435" width="210" height="100" rx="10" />
      <text class="label" x="145" y="478" text-anchor="middle">Agent</text>
      <text class="sub mono" x="145" y="510" text-anchor="middle">on inner pts</text>
      <rect class="box a" x="440" y="435" width="270" height="100" rx="10" />
      <text class="label" x="575" y="475" text-anchor="middle">relay</text>
      <text class="sub" x="575" y="508" text-anchor="middle">in the pane · holds inner ptmx</text>
      <rect class="box b" x="880" y="435" width="230" height="100" rx="10" />
      <text class="label mono" x="995" y="475" text-anchor="middle">tmux server</text>
      <text class="sub" x="995" y="508" text-anchor="middle">pane ptmx · answers DA1</text>
      <rect class="box" x="1240" y="435" width="160" height="100" rx="10" />
      <text class="label" x="1320" y="478" text-anchor="middle">worker</text>
      <text class="sub" x="1320" y="510" text-anchor="middle">FIFO</text>
      <path class="edge a" d="M250,485 H440" :marker-end="arrow('a')" />
      <text class="edge-label a mono" x="345" y="471" text-anchor="middle">① probe + DA1</text>
      <path class="edge b" d="M710,485 H880" :marker-end="arrow('b')" />
      <text class="edge-label b mono" x="795" y="471" text-anchor="middle">③ forward DA1</text>
      <path class="edge" d="M1110,485 H1240" :marker-end="arrow('line')" />
      <text class="edge-label mono" x="1175" y="471" text-anchor="middle">pipe-pane</text>
      <path class="edge a" d="M575,535 V590 H175 V535" :marker-end="arrow('a')" />
      <text class="edge-label a" x="375" y="578" text-anchor="middle">② 7501 reply, written synchronously</text>
      <path class="edge" d="M995,535 V650 H105 V535" :marker-end="arrow('line')" />
      <text class="edge-label" x="550" y="638" text-anchor="middle">④ tmux's DA1 reply passes back through the relay, after ②</text>
      <text class="tag" x="1380" y="684" text-anchor="end">status reports pass through to tmux and the worker</text>

      <text class="figure-tag" x="1388" y="728" text-anchor="end">botmux cb8ff44b2 · program-status-probe-relay.ts / program-status-relay.ts</text>
    </svg>
  </figure>
</template>
