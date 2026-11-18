<script setup lang="ts">
// The frame every diagram renders into: the shared look from diagram.css, and a zoom button.
import Zoomable from '../Zoomable.vue'
import './diagram.css'
</script>

<template>
  <Zoomable class="tg-diagram-zoom">
    <figure class="tg-diagram">
      <slot />
    </figure>
  </Zoomable>
</template>

<style scoped>
/* A diagram takes the full width of its slide, also inside layouts that center their content. */
.tg-diagram-zoom {
  width: 100%;
}
</style>
