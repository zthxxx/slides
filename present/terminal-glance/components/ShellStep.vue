<script setup lang="ts">
import { useSlideContext } from '@slidev/client'
import { computed, inject, ref, shallowRef, watch } from 'vue'
import { toggleTerminalAppearance } from '../runtime/appearance'
import { namesTerminals, shellDemoKey, terminalAccent } from '../runtime/demo'
import { relayStep } from '../runtime/relay'
import { describeStepText, playStep } from '../runtime/session'
import { splitKeys } from '../runtime/steps'
import { highlightShell, type ShellToken } from './shell-highlight'

/**
 * A button that types into a terminal of the same slide: `keys` are pressed first,
 * then `type` is typed, then `run` is typed and Enter pressed.
 * `{a.pts}` / `{a.pid}` in the text become terminal `a`'s pty number / shell pid.
 * A step with `action` types nothing and does that instead.
 */
const props = defineProps<{
  /** Target terminal name; defaults to the first terminal of the demo. */
  to?: string
  /** Space-separated keys, e.g. `"^C"`, `"↑ ⏎"`. */
  keys?: string
  type?: string
  run?: string
  /**
   * `toggle-appearance`: switch every terminal between dark and light, as the title bar's toggle does. The
   * preference syncs to the other windows through localStorage (runtime/appearance.ts), so the presenter's click
   * needs no relay.
   */
  action?: 'toggle-appearance'
}>()

const ACTION_LABELS = { 'toggle-appearance': 'Switch dark / light theme' } as const

const demo = inject(shellDemoKey, undefined)
const { $page, $renderContext } = useSlideContext()

const target = computed(() => props.to ?? demo?.terminals[0] ?? 'a')
const accent = computed(() => terminalAccent(demo?.terminals ?? [target.value], target.value))
const keys = computed(() => splitKeys(props.keys))
const text = computed(() => {
  const raw = props.run ?? props.type
  return raw && $renderContext.value === 'slide' ? describeStepText($page.value, raw) : raw
})
/** Shell highlighting of `text`; the plain text shows until the highlighter has loaded. */
const lines = shallowRef<ShellToken[][]>()
watch(text, async (value) => {
  lines.value = undefined
  if (!value)
    return
  const highlighted = await highlightShell(value).catch(() => undefined)
  if (text.value === value)
    lines.value = highlighted
}, { immediate: true })
const clickable = $renderContext.value === 'slide' || $renderContext.value === 'presenter'
const played = ref(false)

function play(event: MouseEvent) {
  // A focused button switches off Slidev's keyboard navigation.
  (event.currentTarget as HTMLElement).blur()
  played.value = true
  if (props.action) {
    toggleTerminalAppearance()
    return
  }

  const step = { keys: props.keys, type: props.type, run: props.run }
  if ($renderContext.value === 'presenter')
    relayStep({ page: $page.value, to: target.value, step })
  else
    void playStep($page.value, target.value, step).catch(() => {})
}
</script>

<template>
  <li class="shell-step" :class="{ played }">
    <button :disabled="!clickable" :title="text" @click="play">
      <span v-if="namesTerminals(demo) && !action" class="shell-step-target" :style="{ backgroundColor: accent }">{{ target.toUpperCase() }}</span>
      <span v-if="action" class="shell-step-action">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" /></svg>
        {{ ACTION_LABELS[action] }}
      </span>
      <span v-else class="shell-step-input">
        <kbd v-for="key in keys" :key="key">{{ key }}</kbd>
        <code v-if="text && lines"><template v-for="(line, row) in lines" :key="row"><template v-if="row">{{ '\n' }}</template><span v-for="(token, column) in line" :key="column" :style="token.style">{{ token.content }}</span></template></code>
        <code v-else-if="text">{{ text }}</code>
        <span v-if="run" class="shell-step-enter">⏎</span>
      </span>
    </button>
  </li>
</template>

<style scoped>
.shell-step {
  counter-increment: shell-step;
  margin: 0;
  padding: 0;

  &::before {
    display: none;
  }
}

button {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--step-border);
  border-radius: 8px;
  background: var(--step-bg);
  color: var(--step-fg);
  font-family: "Fira Code", Menlo, monospace;
  /* Show commands as typed: Fira Code would merge `<>` and `***` into ligatures. */
  font-feature-settings: "calt" 0, "liga" 0;
  font-variant-ligatures: none;
  font-size: 15px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;

  &::before {
    content: counter(shell-step);
    flex: none;
    min-width: 1.4em;
    color: var(--step-muted);
    text-align: right;
  }

  &:hover:enabled {
    border-color: var(--step-hover-border);
    background: var(--step-hover-bg);
  }

  &:active:enabled {
    background: var(--step-active-bg);
  }

  &:disabled {
    cursor: default;
  }
}

.played button {
  border-color: var(--step-played-border);
  background: var(--step-played-bg);

  &::before {
    content: '✓';
    color: var(--step-played-mark);
  }
}

.shell-step-target {
  flex: none;
  padding: 0 7px;
  border-radius: 4px;
  color: #1e1f29;
  font-weight: 700;
}

.shell-step-input {
  min-width: 0;
  overflow-wrap: anywhere;

  code {
    padding: 0;
    margin: 0;
    background: none;
    color: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: pre-wrap;
  }

  kbd {
    display: inline-block;
    margin-right: 6px;
    padding: 0 6px;
    border: 1px solid var(--step-muted);
    border-radius: 4px;
    background: none;
    box-shadow: none;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.3;
  }
}

.shell-step-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  /* Set apart from the typed commands: an action, in the page's sans-serif. */
  font-family: var(--slidev-theme-font-sans, system-ui), sans-serif;

  svg {
    flex: none;
    color: var(--step-muted);
    width: 1.05em;
    height: 1.05em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;

    path { fill: currentColor }
  }
}

.shell-step-enter {
  margin-left: 6px;
  color: var(--step-muted);
}
</style>

<style>
/* Colour tokens live outside the scoped block: Vue's scoped `:global()` would drop the `.shell-step` part of a dark-mode selector. */
/* Shiki's dual-theme tokens carry both colors as custom properties (shiki `defaultColor: false`). */
.shell-step-input code span {
  color: var(--shiki-light);
  font-style: var(--shiki-light-font-style);
  font-weight: var(--shiki-light-font-weight);
}

html.dark .shell-step-input code span {
  color: var(--shiki-dark);
  font-style: var(--shiki-dark-font-style);
  font-weight: var(--shiki-dark-font-weight);
}

.shell-step {
  --step-fg: #27272a;
  --step-muted: #a1a1aa;
  --step-bg: #fafafa;
  --step-border: #d4d4d8;
  --step-hover-bg: #f0f0ff;
  --step-hover-border: #6272a4;
  --step-active-bg: #e4e4f7;
  --step-played-bg: #f3fbf5;
  --step-played-border: #c7e9cf;
  --step-played-mark: #22a04b;
}

html.dark .shell-step {
  --step-fg: #e4e4e7;
  --step-muted: #6272a4;
  --step-bg: #1e1f29;
  --step-border: #3a3c4e;
  --step-hover-bg: #282a3a;
  --step-hover-border: #8be9fd;
  --step-active-bg: #313347;
  --step-played-bg: #17261d;
  --step-played-border: #2c5a3a;
  --step-played-mark: #50fa7b;
}
</style>
