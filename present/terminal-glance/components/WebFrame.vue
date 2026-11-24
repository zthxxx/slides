<script setup lang="ts">
import { useIsSlideActive, useNav, useSlideContext } from '@slidev/client'
import { computed, ref, useTemplateRef, watch } from 'vue'

/**
 * A live web page embedded in a slide, cropped to one region of it. A cross-origin page cannot be restyled from
 * outside, so the page is laid out at `viewport` CSS pixels wide, shifted so that the region inside `crop`
 * (top right bottom left, in the page's pixels) sits at the frame's origin, and scaled as large as the slide allows
 * while the region's full width and `fitHeight` page pixels of height stay visible; the window narrows to the region's
 * width at that scale, so nothing outside the crop shows. Sticky headers and sidebars stay outside the visible region
 * while the page scrolls.
 */
const props = withDefaults(defineProps<{
  src: string
  /** The page's layout width in CSS pixels; picks which of its responsive layouts is used. */
  viewport?: number
  /** Insets cut off the page, as "top right bottom left" in the page's pixels. */
  crop?: string
  /** Page pixels that must fit vertically, e.g. the tallest media in the region, so it shows whole. */
  fitHeight?: number
  title?: string
}>(), {
  viewport: 1400,
  crop: '0 0 0 0',
  fitHeight: 0,
  title: 'Embedded page',
})

const { $renderContext } = useSlideContext()
const { isPrintMode } = useNav()
const isActive = useIsSlideActive()
/** Only the audience and presenter windows load the page; previews, the overview and export show a stand-in. */
const live = computed(() => ['slide', 'presenter'].includes($renderContext.value) && !isPrintMode.value)

/** Slidev mounts every slide early; the page loads the first time its slide is shown and stays loaded after. */
const loaded = ref(false)
/**
 * In a cross-origin isolated deck (public/coi-sw.js, Chromium only) a cross-origin page loads only as a credentialless
 * iframe, without the viewer's cookies for its site; its host cannot opt in to the deck's embedder policy.
 */
const isolated = globalThis.crossOriginIsolated
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

const scale = computed(() => {
  const { width, height } = size.value
  if (!width)
    return 1
  const byWidth = width / insets.value.width
  return props.fitHeight > 0 && height ? Math.min(byWidth, height / props.fitHeight) : byWidth
})

const windowStyle = computed(() => ({ width: `${Math.floor(insets.value.width * scale.value)}px` }))

const frameStyle = computed(() => {
  const { top, left } = insets.value
  return {
    width: `${props.viewport}px`,
    height: `${top + size.value.height / scale.value}px`,
    transform: `scale(${scale.value}) translate(${-left}px, ${-top}px)`,
  }
})
</script>

<template>
  <div ref="box" class="web-frame">
    <div class="web-frame-window" :style="windowStyle">
      <iframe
        v-if="live && loaded"
        class="web-frame-page"
        :credentialless="isolated || undefined"
        :src="src"
        :title="title"
        :style="frameStyle"
        referrerpolicy="no-referrer"
      />
      <a v-else class="web-frame-stand-in" :href="src" target="_blank" rel="noopener">{{ src }}</a>
    </div>
  </div>
</template>

<style scoped>
.web-frame {
  display: flex;
  justify-content: center;
  flex: 1 1 0;
  width: 100%;
  min-height: 0;
  margin-bottom: 24px;
}

.web-frame-window {
  position: relative;
  height: 100%;
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
