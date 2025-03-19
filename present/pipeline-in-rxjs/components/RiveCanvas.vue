<template>
  <canvas ref="canvasEl" @dblclick="handleDoubleClick"></canvas>
</template>

<script setup lang="ts">
import { useTemplateRef, onMounted, onUnmounted } from 'vue'
import { Rive, RiveFile } from '@rive-app/canvas'
import { loadRiveFile } from './rive'

const props = withDefaults(defineProps<{
  src?: string;
  artboard:
    | '纯输入输出管道'
    | 'tap 观察'
    | 'Filter 管道'
    | 'Observable'
    | '纯输入输出直线'
    | 'map 管道'
    | 'Subject'
    | '管道模板'
    | 'switchMap'
    | string;
  stateMachines?: string | string[];
  autoplay?: boolean;
}>(), {
  // https://editor.rive.app/file/rxjs-pipe/1217817
  src: import.meta.env.BASE_URL + `rive/RxJS Pipe.riv`,
  autoplay: true,
  stateMachines: "State Machine 1"
})

const canvasEl = useTemplateRef('canvasEl')
let riveInstance: Rive | null = null

const handleDoubleClick = () => {
  if (!riveInstance) return

  if (riveInstance.isPlaying) {
    riveInstance.pause()
  } else {
    riveInstance.play()
  }
}

const renderRive = async () => {
  if (!canvasEl.value) {
    await Promise.resolve()
  }

  if (!canvasEl.value) {
    return
  }

  if (riveInstance) {
    riveInstance.resizeDrawingSurfaceToCanvas()
    return
  }

  const riveFile: RiveFile = await loadRiveFile(props.src)
  /** https://rive.app/docs/runtimes/web/web-js */
  riveInstance = new Rive({
    riveFile: riveFile,
    canvas: canvasEl.value,
    autoplay: props.autoplay,
    artboard: props.artboard,
    stateMachines: props.stateMachines,
    onLoad: () => {
      riveInstance?.resizeDrawingSurfaceToCanvas()
    },
  })
}

onMounted(renderRive)

onUnmounted(() => {
  if (riveInstance) {
    try {
      // which may trigger error that cause the slide to stuck
      riveInstance.cleanup()
    } catch (error) {
      console.error(error)
    }
    riveInstance = null
  }
})
</script>
