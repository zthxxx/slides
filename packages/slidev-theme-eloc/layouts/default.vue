<!-- copy from: https://github.com/slidevjs/themes/blob/%40slidev/theme-default%40v0.25.0/packages/theme-default/layouts/cover.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { formatBackground, type Background } from './layoutHelper'

const props = defineProps({
  background: {
    default: '' as Background,
  },
})

const background = computed(() => formatBackground(props.background))
</script>

<template>
  <div
    class="slidev-layout default"
    :data-background-color="background.backgroundColor"
    :data-background-image="background.backgroundImage"
  >
    <slot />
  </div>

</template>


<style scoped>
.slidev-layout {
  &[data-background-color]:not([data-background-color=""]),
  &[data-background-image]:not([data-background-image=""]) {
    @apply overflow-visible;
    filter: v-bind(background.invertContent ? 'invert()' : 'none');

    &::before {
      @apply absolute block -z-1 w-screen h-screen min-w-full min-h-full;
      content: '';
      filter: v-bind(background.invertContent ? 'invert()' : 'none');
      background-repeat: no-repeat;
      background-position: center;
      background-size: cover;
    }
  }

  &[data-background-color]:not([data-background-color=""])::before {
    background-color: v-bind(background.backgroundColor);
  }

  &[data-background-image]:not([data-background-image=""])::before {
    background-image: v-bind(background.backgroundImage);
  }
}
</style>
