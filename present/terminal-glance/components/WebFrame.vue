<script setup lang="ts">
import { useIsSlideActive, useNav, useSlideContext } from '@slidev/client'
import { computed, ref, useTemplateRef, watch } from 'vue'

/**
 * A live web page embedded in a slide, cropped to one region of it. A cross-origin page cannot be restyled from
 * outside, so the page is laid out at `viewport` CSS pixels wide, shifted so that the region inside `crop`
 * (top right bottom left, in the page's pixels) sits at the frame's origin, and scaled so that region fills the
 * frame's width. Sticky headers and sidebars stay outside the visible region while the page scrolls.
 */
const props = withDefaults(defineProps<{
  src: string
  /** The page's layout width in CSS pixels; picks which of its responsive layouts is used. */
  viewport?: number
  /** Insets cut off the page, as "top right bottom left" in the page's pixels. */
  crop?: string
  title?: string
}>(), {
  viewport: 1400,
  crop: '0 0 0 0',
  title: 'Embedded page',
})

const { $renderContext } = useSlideContext()
const { isPrintMode } = useNav()
const isActive = useIsSlideActive()
/** Only the audience and presenter windows load the page; previews, the overview and export show a stand-in. */
const live = computed(() => ['slide', 'presenter'].includes($renderContext.value) && !isPrintMode.value)

/** Slidev mounts every slide early; the page loads the first time its slide is shown and stays loaded after. */
const loaded = ref(false)
watch(isActive, (active) => {
  if (active)
    loaded.value = true
}, { immediate: true })

const insets = computed(() => {
  const [top = 0, right = 0, , left = 0] = props.crop.trim().split(/\s+/).map(Number)
  return { top, right, left, width: props.viewport - left - right }
})

const box = useTemplateRef<HTMLDivElement>('box')
const size = ref({ width: 0, height: 0 })
watch(box, (element, _, onCleanup) => {
  if (!element)
    return
  // Layout sizes, before Slidev's own scale, which applies to the whole slide including the page.
  const observer = new ResizeObserver(() => size.value = { width: element.clientWidth, height: element.clientHeight })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { immediate: true })

const frameStyle = computed(() => {
  const { top, left, width } = insets.value
  const scale = size.value.width ? size.value.width / width : 1
  return {
    width: `${props.viewport}px`,
    height: `${top + size.value.height / scale}px`,
    transform: `scale(${scale}) translate(${-left}px, ${-top}px)`,
  }
})
</script>

<template>
  <div ref="box" class="web-frame">
    <iframe
      v-if="live && loaded"
      class="web-frame-page"
      :src="src"
      :title="title"
      :style="frameStyle"
      referrerpolicy="no-referrer"
    />
    <a v-else class="web-frame-stand-in" :href="src" target="_blank" rel="noopener">{{ src }}</a>
  </div>
</template>

<style scoped>
.web-frame {
  position: relative;
  flex: 1 1 0;
  width: 100%;
  min-height: 0;
  margin-bottom: 24px;
  overflow: hidden;
  border: 1px solid rgb(127 127 127 / 0.25);
  border-radius: 0.6rem;
  background: #fff;
  box-shadow: 0 0.6rem 1.6rem rgb(0 0 0 / 0.18);
}

.web-frame-page {
  position: absolute;
  top: 0;
  left: 0;
  border: 0;
  transform-origin: 0 0;
}

.web-frame-stand-in {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6272a4;
  font-size: 20px;
}
</style>
