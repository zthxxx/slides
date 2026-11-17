<script setup lang="ts">
import { useId } from 'vue'
import './diagram.css'

const id = useId()
</script>

<template>
  <figure class="tg-diagram">
    <svg viewBox="0 0 1440 470" role="img" aria-label="OSC 7501: program probes the host, the host replies to advertise support, then the program reports working, blocked and done. Reports travel in the program output; user replies remain ordinary terminal input.">
      <defs>
        <marker :id="`${id}-arrow`" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
          <path class="head a" d="M0,0 L12,6 L0,12 Z" />
        </marker>
      </defs>
      <rect class="box a" x="70" y="25" width="320" height="70" rx="12" />
      <rect class="box b" x="1050" y="25" width="320" height="70" rx="12" />
      <text class="label" x="230" y="70" text-anchor="middle">Program / Agent</text>
      <text class="label" x="1210" y="70" text-anchor="middle">Terminal / Gateway</text>
      <path class="edge event" d="M230,96 V430 M1210,96 V430" />
      <path class="edge a" d="M230,145 H1210" :marker-end="`url(#${id}-arrow)`" />
      <text class="edge-label a mono" x="720" y="132" text-anchor="middle">probe: ESC ] 7501 ; ? ST</text>
      <path class="edge a" d="M1210,215 H230" :marker-end="`url(#${id}-arrow)`" />
      <text class="edge-label a mono" x="720" y="202" text-anchor="middle">reply: ESC ] 7501 ; ? ST</text>
      <path class="edge a" d="M230,310 H1210" :marker-end="`url(#${id}-arrow)`" />
      <text class="edge-label a mono" x="720" y="296" text-anchor="middle">ESC ] 7501 ; state=working:app=demo-agent ST</text>
      <path class="edge a" d="M230,390 H1210" :marker-end="`url(#${id}-arrow)`" />
      <text class="edge-label a mono" x="720" y="376" text-anchor="middle">state=blocked → state=done</text>
      <text class="figure-tag" x="1380" y="457" text-anchor="end">OSC 7501 · Program Status Protocol · botmux cb8ff44b2</text>
    </svg>
  </figure>
</template>
