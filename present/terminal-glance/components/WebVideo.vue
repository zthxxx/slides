<script setup lang="ts">
import { useIsSlideActive, useNav, useSlideContext } from '@slidev/client'
import { computed, ref, watch } from 'vue'

/**
 * A video from another site, played in the slide with the browser's controls, and a link to the page it comes from.
 * It is a CORS request (`crossorigin`), which the deck's embedder policy (public/coi-sw.js, `require-corp`) accepts
 * from a host that answers with `Access-Control-Allow-Origin`, as GitHub Pages does; an iframe of another site would
 * be blocked under that policy.
 */
const props = defineProps<{
  src: string
  /** The page the video belongs to, linked under it. */
  page: string
  title: string
}>()

const { $renderContext } = useSlideContext()
const { isPrintMode } = useNav()
const isActive = useIsSlideActive()
/** Only the audience and presenter windows load the video; previews, the overview and export show a stand-in. */
const live = computed(() => ['slide', 'presenter'].includes($renderContext.value) && !isPrintMode.value)

/** Slidev mounts every slide early; the video loads the first time its slide is shown and stays loaded after. */
const loaded = ref(false)
watch(isActive, (active) => {
  if (active)
    loaded.value = true
}, { immediate: true })

/** A start at 0.1 s makes Safari draw a frame before playback, as other browsers do with `preload="metadata"`. */
const source = computed(() => `${props.src}#t=0.1`)
</script>

<template>
  <figure class="web-video">
    <video
      v-if="live && loaded"
      class="web-video-player"
      :src="source"
      :title="title"
      crossorigin="anonymous"
      preload="metadata"
      controls
      playsinline
    />
    <div v-else class="web-video-player web-video-stand-in">
      {{ title }}
    </div>
    <figcaption class="web-video-caption">
      <a :href="page" target="_blank" rel="noopener">{{ title }} ↗</a>
    </figcaption>
  </figure>
</template>

<style scoped>
.web-video {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 0;
  width: 100%;
  min-height: 0;
  margin: 0 0 16px;
}

.web-video-player {
  flex: 1 1 0;
  min-height: 0;
  max-width: 100%;
  border: 1px solid rgb(127 127 127 / 0.25);
  border-radius: 0.6rem;
  background: #000;
  box-shadow: 0 0.6rem 1.6rem rgb(0 0 0 / 0.18);
}

.web-video-stand-in {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  color: #6272a4;
  background: #fff;
  font-size: 20px;
}

.web-video-caption {
  margin-top: 10px;
  font-size: 15px;
  opacity: 0.7;
}
</style>
