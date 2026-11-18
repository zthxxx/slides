<script setup lang="ts">
import { useIsSlideActive, useNav, useSlideContext } from '@slidev/client'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * A figure with a zoom button. Zooming moves the content into an overlay over the whole slide, 20 px from its edges.
 * The overlay lives in the slide's `.slidev-page`, so it is scaled with the slide; it is not the browser's fullscreen.
 * The content is moved, not copied: SVG ids stay unique and nothing re-renders.
 */
const root = ref<HTMLElement>()
const slide = ref<HTMLElement | null>(null)
const zoomed = ref(false)
/** The figure's own size, held while its content is shown in the overlay, so the slide does not reflow underneath. */
const room = ref<{ width: string, height: string }>()

const { $renderContext } = useSlideContext()
const { isPrintMode } = useNav()
const isActive = useIsSlideActive()
/** Only the audience window zooms; the presenter, previews, overview and export show the plain figure. */
const zoomable = computed(() => $renderContext.value === 'slide' && !isPrintMode.value)

onMounted(() => {
  slide.value = root.value?.closest<HTMLElement>('.slidev-page') ?? null
})

function open(): void {
  const box = root.value
  if (!box || !slide.value)
    return
  room.value = { width: `${box.offsetWidth}px`, height: `${box.offsetHeight}px` }
  zoomed.value = true
}

function close(): void {
  zoomed.value = false
  room.value = undefined
}

function toggle(event: MouseEvent): void {
  // A focused button switches off Slidev's keyboard navigation.
  (event.currentTarget as HTMLElement).blur()
  if (zoomed.value)
    close()
  else
    open()
}

/** Captured on window before any other listener, so Slidev's own Esc shortcut never sees it. */
function closeOnEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape')
    return
  event.preventDefault()
  event.stopImmediatePropagation()
  close()
}

watch(zoomed, (open) => {
  if (open)
    window.addEventListener('keydown', closeOnEscape, { capture: true })
  else
    window.removeEventListener('keydown', closeOnEscape, { capture: true })
})
watch(isActive, (active) => {
  if (!active)
    close()
})
onBeforeUnmount(() => window.removeEventListener('keydown', closeOnEscape, { capture: true }))
</script>

<template>
  <div ref="root" class="zoomable" :style="room">
    <Teleport :to="slide ?? 'body'" :disabled="!zoomed">
      <div class="zoomable-frame" :class="{ zoomed }" @click="zoomed && close()">
        <div class="zoomable-content">
          <slot />
        </div>
        <button
          v-if="zoomable"
          type="button"
          class="zoomable-button"
          :title="zoomed ? 'Close (Esc)' : 'Enlarge'"
          :aria-label="zoomed ? 'Close the enlarged figure' : 'Enlarge the figure'"
          @click.stop="toggle"
        >
          <svg v-if="zoomed" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.zoomable-frame {
  position: relative;

  &:hover .zoomable-button {
    opacity: 1;
  }
}

.zoomable-button {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--zoom-button-border);
  border-radius: 8px;
  background: var(--zoom-button-bg);
  color: var(--zoom-button-fg);
  opacity: 0.6;
  cursor: pointer;
  transition: opacity 0.15s, background-color 0.15s;

  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &:hover {
    background: var(--zoom-button-hover-bg);
  }
}

.zoomable-frame.zoomed {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: var(--zoom-backdrop);
  backdrop-filter: blur(6px);
  cursor: zoom-out;

  .zoomable-content {
    position: absolute;
    inset: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .zoomable-button {
    top: 30px;
    right: 30px;
    opacity: 1;
  }

  /* Fill the overlay; pictures keep their aspect ratio. */
  .zoomable-content > :deep(*) {
    width: 100%;
    height: 100%;
    max-width: none;
    margin: 0;
  }

  :deep(.tg-diagram) {
    display: flex;
    align-items: center;
  }

  :deep(.tg-diagram svg),
  :deep(img) {
    width: 100%;
    height: 100%;
    max-width: none;
    object-fit: contain;
  }

  :deep(p) {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

@media print {
  .zoomable-button {
    display: none;
  }
}
</style>

<style>
/* Colour tokens live outside the scoped block, so the dark-mode selector keeps working on the teleported overlay. */
.zoomable-frame {
  --zoom-backdrop: rgb(250 250 250 / 0.94);
  --zoom-button-bg: rgb(255 255 255 / 0.9);
  --zoom-button-hover-bg: #f0f0ff;
  --zoom-button-border: #d4d4d8;
  --zoom-button-fg: #3f3f46;
}

html.dark .zoomable-frame {
  --zoom-backdrop: rgb(18 18 18 / 0.94);
  --zoom-button-bg: rgb(30 31 41 / 0.9);
  --zoom-button-hover-bg: #282a3a;
  --zoom-button-border: #3a3c4e;
  --zoom-button-fg: #e4e4e7;
}
</style>
