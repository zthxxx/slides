<!--
  Vertical scroll container whose top / bottom edge fades out while content remains beyond it,
  the only scroll hint left since the theme hides scrollbars (`::-webkit-scrollbar` in ../styles/override.css).
  The consumer sets its height limit (e.g. `max-height`); `--scroll-fade-size` sets the fade depth.
-->
<script setup lang="ts">
import { useResizeObserver, useScroll } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const viewport = useTemplateRef<HTMLElement>('viewport')
const { arrivedState, measure } = useScroll(viewport)

// Slidev mounts upcoming slides while hidden, so the mount-time measure sees a zero-sized box
useResizeObserver(viewport, measure)
</script>

<template>
  <div
    ref="viewport"
    class="scroll-fade"
    :class="{
      'fade-top': !arrivedState.top,
      'fade-bottom': !arrivedState.bottom,
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
/* registered so the fade edges can transition instead of snapping */
@property --scroll-fade-top {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

@property --scroll-fade-bottom {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

.scroll-fade {
  --scroll-fade-size: 4em;

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
  transition:
    --scroll-fade-top 0.3s ease-out,
    --scroll-fade-bottom 0.3s ease-out;

  &.fade-top {
    --scroll-fade-top: var(--scroll-fade-size);
  }

  &.fade-bottom {
    --scroll-fade-bottom: var(--scroll-fade-size);
  }
}
</style>
