<script setup lang="ts">
// The frame every diagram renders into, with the shared look from diagram.css.
import './diagram.css'
</script>

<template>
  <figure class="tg-diagram tg-diagram-frame">
    <slot />
  </figure>
</template>

<style scoped>
/* A diagram takes the full width of its slide, also inside layouts that center their content. */
.tg-diagram-frame {
  width: 100%;
}
</style>
