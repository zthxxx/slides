<script setup lang="ts">
import { computed, provide, useSlots } from 'vue'
import { shellDemoKey } from '../runtime/demo'
import Terminal from './Terminal.vue'

const props = withDefaults(defineProps<{
  /** Space-separated terminal names, stacked top to bottom, e.g. `"a b"`. */
  terminals?: string
}>(), {
  terminals: 'a',
})

const names = computed(() => props.terminals.trim().split(/\s+/))
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
      <Terminal v-for="name in names" :key="name" :name="name" />
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
