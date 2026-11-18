<script setup lang="ts">
import { computed, provide, useSlots } from 'vue'
import { shellDemoKey } from '../runtime/demo'
import Terminal from './Terminal.vue'

const props = withDefaults(defineProps<{
  /** Space-separated terminal names, stacked top to bottom, e.g. `"a b"`. */
  terminals?: string
  /** Space-separated height ratios of the stacked terminals, e.g. `"3 2"`; equal shares by default. */
  heights?: string
}>(), {
  terminals: 'a',
})

const names = computed(() => props.terminals.trim().split(/\s+/))
/** A missing or invalid ratio counts as 1. */
const grows = computed(() => {
  const ratios = props.heights?.trim().split(/\s+/).map(Number) ?? []
  return names.value.map((_, index) => ratios[index] > 0 ? ratios[index] : 1)
})
provide(shellDemoKey, {
  get terminals() {
    return names.value
  },
})

const hasSteps = Boolean(useSlots().default)
</script>

<template>
  <div class="shell-demo" :class="{ 'with-steps': hasSteps }">
    <div class="shell-demo-terminals">
      <Terminal v-for="(name, index) in names" :key="name" :name="name" :grow="grows[index]" />
    </div>
    <ol v-if="hasSteps" class="shell-demo-steps">
      <slot />
    </ol>
  </div>
</template>

<style scoped>
.shell-demo {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  flex: 1 1 0;
  width: 100%;
  min-height: 0;
  margin-top: 12px;
  /* The layout pads the slide's bottom as much as its top, but the windows' drop shadow takes part of that room. */
  margin-bottom: 24px;

  &.with-steps {
    grid-template-columns: minmax(0, 1fr) 400px;
  }
}

.shell-demo-terminals {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;

  > * {
    flex: 1 1 0;
  }
}

.shell-demo-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  counter-reset: shell-step;
}
</style>
