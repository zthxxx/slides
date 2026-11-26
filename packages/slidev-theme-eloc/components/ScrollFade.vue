<!--
  Vertical scroll container whose top / bottom edge fades out while content remains beyond it,
  the only scroll hint left since the theme hides scrollbars (`::-webkit-scrollbar` in ../styles/override.css).
  The consumer sets its height limit (e.g. `max-height`); `--scroll-fade-size` sets the full fade depth.
-->
<script setup lang="ts">
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { ref, useTemplateRef } from 'vue'

const viewport = useTemplateRef<HTMLElement>('viewport')
const distanceToTop = ref(0)
const distanceToBottom = ref(0)

function measure() {
  const el = viewport.value
  if (!el) return
  distanceToTop.value = el.scrollTop
  distanceToBottom.value = Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop)
}

useEventListener(viewport, 'scroll', measure, { passive: true })
// Slidev mounts upcoming slides while hidden, so the size is only known once the box is laid out
useResizeObserver(viewport, measure)
</script>

<template>
  <div
    ref="viewport"
    class="scroll-fade"
    :style="{
      '--scroll-distance-top': `${distanceToTop}px`,
      '--scroll-distance-bottom': `${distanceToBottom}px`,
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.scroll-fade {
  --scroll-fade-size: 3em;
  /* each edge's fade grows with the content beyond it, so it appears and vanishes along with scrolling */
  --scroll-fade-top: min(var(--scroll-distance-top), var(--scroll-fade-size));
  --scroll-fade-bottom: min(var(--scroll-distance-bottom), var(--scroll-fade-size));

  overflow-y: auto;
  /*
   * the transition hints at 70% of the fade ease it in (about alpha = t^2),
   * so the edge-most line reads as cut off instead of merely dimmed
   */
  mask-image: linear-gradient(
    to bottom,
    transparent,
    calc(var(--scroll-fade-top) * 0.7),
    #000 var(--scroll-fade-top),
    #000 calc(100% - var(--scroll-fade-bottom)),
    calc(100% - var(--scroll-fade-bottom) * 0.7),
    transparent
  );
}
</style>
